/* Tarefas de cuidado no painel React da ficha.
 *
 * O que NÃO mudou, de propósito (VIS-018):
 *
 * - **Nenhuma frase mudou de palavra.**
 * - O protocolo de barreira (`ciclo-tarefa-cuidado.ts`: consultar, encerrar, reconhecer,
 *   liberar) é consumido exatamente como antes, inclusive a troca de rótulo do botão
 *   ANTES de repetir a consulta — é o que faz um resultado pendente NOVO, descoberto no
 *   meio do reconhecimento do anterior, reapresentar "Entendi, liberar as tarefas" sem
 *   reconhecer o novo sozinho.
 * - Depois de qualquer gravação bem-sucedida a barreira volta a trancar quando o serviço
 *   tem `ciclo`: cada escrita consome a liberação, e a próxima exige nova conferência.
 * - Uma tarefa alterada mas não enviada continua bloqueando o ENVIO de qualquer outra
 *   tarefa (`permitirAtualizacao`) com a mesma pergunta de descarte, e uma tarefa em
 *   envio continua travando os campos de TODAS as demais e dos filtros
 *   (`bloquearOutrosFormularios`) — aqui obtido por os dois lerem o mesmo estado
 *   `enviando`, em vez de uma função que percorre o DOM.
 * - Resultado incerto ou conflito de versão — e TODA falha, quando o serviço tem
 *   `ciclo`, mesmo sem ser conflito — oferece "Consultar tarefas novamente" com os
 *   campos em leitura (não desabilitados: dá para copiar o texto) e seleção/botões
 *   trancados, sem decidir nada sozinho.
 * - O formulário de criação não desliga a validação nativa do navegador (sem
 *   `noValidate`); o de edição desliga, como na versão imperativa — assimetria herdada,
 *   não corrigida aqui.
 *
 * **O DOM continua dono do valor dos campos.** Os controles de cada tarefa são NÃO
 * controlados, como na versão imperativa; a leitura no envio é por `name`, via `valorDe`
 * de `web/telas/formulario.tsx`, que também resolve o `submit` sem bubble que as provas
 * despacham.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type {
  RegistroTarefaCuidado as RegistroTarefa,
  TarefaCuidado,
} from '../packages/contracts/src/tarefa-cuidado.js';
import type { criarCicloTarefaCuidado } from './ciclo-tarefa-cuidado.js';
import { confirmar, confirmarDescarte } from './confirmacao.js';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { Campo } from './componentes/ui/campo.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import './estilos/tema.css';
import { Formulario, valorDe } from './telas/formulario.js';

export type ServicoTarefasCuidado = {
  consultarTarefas(pacienteId: string): Promise<RegistroTarefa[]>;
  ciclo?: ReturnType<typeof criarCicloTarefaCuidado>;
  atualizarTarefa?(
    pacienteId: string,
    tarefaId: string,
    versao: number,
    chave: string,
    tarefa: TarefaCuidado,
  ): Promise<void>;
  criarTarefa?(
    pacienteId: string,
    tarefaId: string,
    chave: string,
    tarefa: TarefaCuidado,
  ): Promise<void>;
};

const ESTADOS: Record<RegistroTarefa['tarefa']['estado'], string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};
const PRIORIDADES: Record<RegistroTarefa['tarefa']['prioridade'], string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

function prazoCivil(valor: string): string {
  return valor.split('-').reverse().join('/');
}

/** O indicador de ação em curso. A mensagem acessível continua no `role="status"` do
 *  próprio formulário; isto é só a pintura. */
function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

type ValoresTarefa = {
  descricao: string;
  responsavel: string;
  prazo: string;
  prioridade: RegistroTarefa['tarefa']['prioridade'];
  estado?: RegistroTarefa['tarefa']['estado'];
  acaoRealizada?: string;
  justificativa?: string;
};

/** Um formulário de tarefa — criação ou edição, pela presença de `mostrarEstado`.
 *
 *  Faz só duas coisas: valida os campos localmente (as mesmas mensagens de antes) e,
 *  quando a validação passa, entrega a tarefa pronta ao chamador — que decide reservar
 *  a gravação, falar com o serviço e tratar o resultado. O formulário não sabe de
 *  barreira nem de conflito; só de campo. */
function FormularioTarefa({
  idForm,
  titulo,
  rotuloSalvar,
  mostrarEstado,
  valoresIniciais,
  validarNativo,
  travado,
  meuEnvio,
  recuperacaoAtiva,
  mostrarRecuperarAqui,
  status,
  onDirty,
  aoMudarStatus,
  onValidado,
  onConsultarNovamente,
}: {
  idForm: string;
  titulo: string;
  rotuloSalvar: string;
  mostrarEstado: boolean;
  valoresIniciais: ValoresTarefa;
  /** A criação não desliga a validação nativa do navegador; a edição desliga — herdado. */
  validarNativo: boolean;
  travado: boolean;
  meuEnvio: boolean;
  recuperacaoAtiva: boolean;
  mostrarRecuperarAqui: boolean;
  status: string;
  onDirty: () => void;
  /** Mensagem de validação LOCAL de campo — mesmo canal de status que o envio usa, mas
   *  escrita aqui porque só o formulário sabe se descrição/responsável/prazo/prioridade
   *  estão preenchidos. */
  aoMudarStatus: (texto: string) => void;
  onValidado: (tarefa: TarefaCuidado) => void;
  onConsultarNovamente: () => void;
}) {
  function enviar(formulario: HTMLFormElement) {
    const descricao = valorDe(formulario, 'descricao').trim();
    const responsavel = valorDe(formulario, 'responsavel').trim();
    const prazo = valorDe(formulario, 'prazo');
    const prioridade = valorDe(formulario, 'prioridade');
    if (!descricao || !responsavel || !prazo || !Object.hasOwn(PRIORIDADES, prioridade)) {
      aoMudarStatus('Preencha descrição, responsável, prazo e prioridade.');
      return;
    }
    if (!mostrarEstado) {
      onValidado({
        descricao,
        responsavel,
        prazo,
        prioridade: prioridade as TarefaCuidado['prioridade'],
        estado: 'pendente',
      });
      return;
    }
    const estado = valorDe(formulario, 'estado');
    const acaoLimpa = valorDe(formulario, 'acaoRealizada').trim();
    const justificativaLimpa = valorDe(formulario, 'justificativa').trim();
    if (estado === 'concluida' && !acaoLimpa && !justificativaLimpa) {
      aoMudarStatus('Informe a ação realizada ou a justificativa para concluir.');
      return;
    }
    if (!Object.hasOwn(ESTADOS, estado)) return;
    onValidado({
      descricao,
      responsavel,
      prazo,
      prioridade: prioridade as TarefaCuidado['prioridade'],
      estado: estado as TarefaCuidado['estado'],
      acaoRealizada: acaoLimpa || undefined,
      justificativa: justificativaLimpa || undefined,
    });
  }

  return (
    <Formulario
      aoEnviar={enviar}
      noValidate={validarNativo ? undefined : true}
      className="grid min-w-0 gap-4"
    >
      <fieldset
        disabled={travado && !recuperacaoAtiva}
        className="m-0 min-w-0 grid gap-4 border-0 p-0"
      >
        <legend className="px-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
          {titulo}
        </legend>
        <Campo
          id={`${idForm}-descricao`}
          name="descricao"
          rotulo="Descrição"
          required
          maxLength={4000}
          readOnly={recuperacaoAtiva}
          defaultValue={valoresIniciais.descricao}
          onInput={onDirty}
        />
        <Campo
          id={`${idForm}-responsavel`}
          name="responsavel"
          rotulo="Responsável"
          required
          maxLength={4000}
          readOnly={recuperacaoAtiva}
          defaultValue={valoresIniciais.responsavel}
          onInput={onDirty}
        />
        <CampoData
          id={`${idForm}-prazo`}
          name="prazo"
          rotulo="Prazo"
          required
          readOnly={recuperacaoAtiva}
          defaultValue={valoresIniciais.prazo}
          onInput={onDirty}
        />
        <SelecaoAprimorada
          id={`${idForm}-prioridade`}
          name="prioridade"
          rotulo="Prioridade"
          disabled={travado || recuperacaoAtiva}
          defaultValue={valoresIniciais.prioridade}
          onChange={onDirty}
        >
          {Object.entries(PRIORIDADES).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </SelecaoAprimorada>
        {mostrarEstado ? (
          <>
            <SelecaoAprimorada
              id={`${idForm}-estado`}
              name="estado"
              rotulo="Estado"
              disabled={travado || recuperacaoAtiva}
              defaultValue={valoresIniciais.estado}
              onChange={onDirty}
            >
              {Object.entries(ESTADOS).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </SelecaoAprimorada>
            <AreaTexto
              id={`${idForm}-acao-realizada`}
              name="acaoRealizada"
              rotulo="Ação realizada"
              maxLength={4000}
              readOnly={recuperacaoAtiva}
              defaultValue={valoresIniciais.acaoRealizada ?? ''}
              onInput={onDirty}
            />
            <AreaTexto
              id={`${idForm}-justificativa`}
              name="justificativa"
              rotulo="Justificativa"
              maxLength={4000}
              readOnly={recuperacaoAtiva}
              defaultValue={valoresIniciais.justificativa ?? ''}
              onInput={onDirty}
            />
          </>
        ) : null}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Botao
          peso="principal"
          tipo="submit"
          disabled={travado || recuperacaoAtiva}
          aria-busy={meuEnvio || undefined}
        >
          {rotuloSalvar}
          {meuEnvio ? <Indicador /> : null}
        </Botao>
        {mostrarRecuperarAqui ? (
          <Botao peso="secundario" aoAtivar={onConsultarNovamente}>
            Consultar tarefas novamente
          </Botao>
        ) : null}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas e os leitores de tela procuram. */}
      <p
        role="status"
        className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave empty:hidden"
      >
        {status}
      </p>
    </Formulario>
  );
}

/** A barreira de conferência (`ciclo-tarefa-cuidado.ts`): antes de liberar a escrita,
 *  confirma que não há um envio anterior aguardando resposta. Replica o estado da versão
 *  imperativa: o rótulo do botão troca para "Entendi, liberar as tarefas" assim que há um
 *  resultado pendente, e troca de volta ANTES de repetir a consulta — por isso um
 *  resultado novo, descoberto no meio do reconhecimento, reapresenta o aviso sem
 *  reconhecê-lo sozinho. */
function BarreiraTarefas({
  ciclo,
  descartarAcesso,
  aoLiberar,
}: {
  ciclo: ReturnType<typeof criarCicloTarefaCuidado>;
  descartarAcesso: (erro: unknown) => boolean;
  aoLiberar: () => void;
}) {
  const [aviso, definirAviso] = useState(
    'Antes de alterar tarefas, confira se já existe algum envio aguardando resposta.',
  );
  const [rotulo, definirRotulo] = useState<'inicial' | 'reconhecer'>('inicial');
  const [ocupado, definirOcupado] = useState(false);
  const cercadoRef = useRef(false);

  const verificar = useCallback(async (): Promise<void> => {
    let situacao = await ciclo.consultar();
    if (!situacao.resultado_pendente && (!cercadoRef.current || situacao.reserva)) {
      await ciclo.encerrar();
      cercadoRef.current = true;
      situacao = await ciclo.consultar();
    }
    if (situacao.resultado_pendente) {
      const pendente = situacao.resultado_pendente;
      flushSync(() => {
        definirAviso(
          `A alteração enviada antes ${pendente.resultado === 'confirmada' ? 'foi salva' : 'não foi salva'}. Confira a tarefa na lista antes de continuar.`,
        );
        definirRotulo('reconhecer');
        definirOcupado(false);
      });
      return;
    }
    if (situacao.reserva) {
      flushSync(() => {
        definirAviso('Outro envio começou enquanto isso. Confira novamente.');
        definirRotulo('inicial');
        definirOcupado(false);
      });
      return;
    }
    ciclo.liberar();
    aoLiberar();
  }, [ciclo, aoLiberar]);

  const iniciar = useCallback(() => {
    flushSync(() => {
      definirOcupado(true);
      definirAviso('Conferindo tarefas…');
    });
    void verificar().catch((erro: unknown) => {
      if (descartarAcesso(erro)) return;
      flushSync(() => {
        definirAviso('Não foi possível conferir agora. Tente novamente.');
        definirOcupado(false);
      });
    });
  }, [verificar, descartarAcesso]);

  const reconhecer = useCallback(() => {
    flushSync(() => {
      definirOcupado(true);
      definirAviso('Concluindo conferência…');
    });
    void (async () => {
      await ciclo.reconhecer();
      cercadoRef.current = true;
      // O rótulo volta ao inicial ANTES de repetir a consulta: se ela revelar um resultado
      // pendente NOVO, o ramo acima desta função o reapresenta sozinho.
      flushSync(() => definirRotulo('inicial'));
      await verificar();
    })().catch((erro: unknown) => {
      if (descartarAcesso(erro)) return;
      flushSync(() => {
        definirAviso('Não foi possível conferir agora. Tente novamente.');
        definirOcupado(false);
      });
    });
  }, [ciclo, verificar, descartarAcesso]);

  return (
    <div className="grid min-w-0 gap-3 rounded-cartao border border-borda p-4">
      {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
      <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
        {aviso}
      </p>
      <div>
        <Botao
          peso="secundario"
          disabled={ocupado}
          aria-busy={ocupado || undefined}
          aoAtivar={rotulo === 'reconhecer' ? reconhecer : iniciar}
        >
          {rotulo === 'reconhecer' ? 'Entendi, liberar as tarefas' : 'Conferir e liberar'}
          {ocupado ? <Indicador /> : null}
        </Botao>
      </div>
    </div>
  );
}

type Fase =
  | { fase: 'carregando' }
  | { fase: 'pronta'; registros: readonly RegistroTarefa[] }
  | { fase: 'erro'; erro: unknown };

/** Consulta vinculada ao paciente; o servidor determina o acesso. */
export function TelaTarefasCuidado({
  pacienteId,
  servico,
  acessoPerdido,
  alteracaoPendente,
}: {
  pacienteId: string;
  servico: ServicoTarefasCuidado;
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
}) {
  const [descartada, definirDescartada] = useState(false);
  const [fase, definirFase] = useState<Fase>({ fase: 'carregando' });
  const [tentativa, definirTentativa] = useState(0);
  const [bloqueada, definirBloqueada] = useState(() => !!servico.ciclo);
  const [enviando, definirEnviando] = useState<string | null>(null);
  const [recuperacaoFormId, definirRecuperacaoFormId] = useState<string | null>(null);
  const [statusPorForm, definirStatusPorForm] = useState<Record<string, string>>({});
  const [filtroEstado, definirFiltroEstado] = useState('');
  const [filtroPrioridade, definirFiltroPrioridade] = useState('');

  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;
  const avisarPendente = useRef(alteracaoPendente);
  avisarPendente.current = alteracaoPendente;
  const formulariosAlteradosRef = useRef(new Set<string>());

  const definirStatusDoForm = useCallback((idForm: string, texto: string) => {
    definirStatusPorForm((atual) => ({ ...atual, [idForm]: texto }));
  }, []);

  /** Revalidação de acesso: a raiz é esvaziada ANTES de avisar. */
  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    flushSync(() => definirDescartada(true));
    avisarPerda.current(erro);
    return true;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tentativa` não é lida no corpo de propósito — é o GATILHO de recarga que o "Tentar novamente" e as gravações bem-sucedidas incrementam.
  useEffect(() => {
    let valida = true;
    // SEM `flushSync` aqui: na MONTAGEM este efeito roda dentro do `flushSync` da
    // própria `ilha()`, e um `flushSync` aninhado derruba o React ("React cannot flush
    // when React is already rendering"). O estado inicial já nasce `carregando`
    // (`useState` acima), então a atualização síncrona nem é necessária; só as
    // continuações assíncronas abaixo precisam de `flushSync`.
    definirFase({ fase: 'carregando' });
    servicoAtual.current.consultarTarefas(pacienteId).then(
      (registros) => {
        if (!valida) return;
        flushSync(() => definirFase({ fase: 'pronta', registros }));
      },
      (erro: unknown) => {
        if (!valida || descartarAcesso(erro)) return;
        flushSync(() => definirFase({ fase: 'erro', erro }));
      },
    );
    return () => {
      valida = false;
    };
  }, [pacienteId, tentativa, descartarAcesso]);

  const marcarAlterado = useCallback((idForm: string) => {
    formulariosAlteradosRef.current.add(idForm);
    avisarPendente.current(true);
  }, []);

  const permitirAtualizacao = useCallback(async (idAtual: string): Promise<boolean> => {
    const outraAlterada = [...formulariosAlteradosRef.current].some((outro) => outro !== idAtual);
    if (!outraAlterada) return true;
    return confirmarDescarte('as alterações não salvas em outra tarefa');
  }, []);

  const aoLiberarBarreira = useCallback(() => {
    flushSync(() => {
      definirBloqueada(false);
      definirTentativa((valor) => valor + 1);
    });
  }, []);

  const consultarNovamente = useCallback(() => {
    void (async () => {
      if (
        !(await confirmar({
          titulo: 'Consultar de novo e descartar o que não foi salvo nesta tela?',
          detalhe:
            'A consulta substitui o que está na tela pelos dados do serviço. Copie o que precisar antes de seguir.',
          acao: 'Consultar de novo',
          cancelar: 'Continuar nesta tela',
        }))
      )
        return;
      formulariosAlteradosRef.current.clear();
      avisarPendente.current(false);
      flushSync(() => {
        definirRecuperacaoFormId(null);
        definirBloqueada(!!servicoAtual.current.ciclo);
        definirTentativa((valor) => valor + 1);
      });
    })();
  }, []);

  const salvar = useCallback(
    async (
      idForm: string,
      tarefa: TarefaCuidado,
      chamar: () => Promise<void>,
      mensagemEmCurso: string,
      modo: 'criar' | 'editar',
    ) => {
      if (!(await permitirAtualizacao(idForm))) return;
      flushSync(() => {
        definirEnviando(idForm);
        avisarPendente.current(true);
        definirStatusDoForm(idForm, mensagemEmCurso);
      });
      try {
        await chamar();
        formulariosAlteradosRef.current.clear();
        avisarPendente.current(false);
        flushSync(() => {
          definirEnviando(null);
          definirBloqueada(!!servicoAtual.current.ciclo);
          definirTentativa((valor) => valor + 1);
        });
      } catch (erro) {
        if (descartarAcesso(erro)) return;
        const cicloOuConflito =
          !!servicoAtual.current.ciclo ||
          resultadoIncerto(erro) ||
          (erro instanceof FalhaApi &&
            ['conflito_versao', 'conflito_idempotencia'].includes(erro.codigo));
        if (cicloOuConflito) {
          const mensagem =
            modo === 'criar'
              ? 'Não foi possível confirmar a criação. Copie os dados e consulte as tarefas antes de tentar novamente.'
              : resultadoIncerto(erro)
                ? 'Não foi possível confirmar a atualização. Copie os dados e consulte a tarefa antes de tentar novamente.'
                : 'A tarefa foi alterada. Copie os dados e consulte a versão atual antes de tentar novamente.';
          flushSync(() => {
            definirEnviando(null);
            definirRecuperacaoFormId(idForm);
            definirStatusDoForm(idForm, mensagem);
          });
          return;
        }
        flushSync(() => {
          definirEnviando(null);
          definirStatusDoForm(idForm, mensagemFalha(erro));
        });
      }
    },
    [permitirAtualizacao, descartarAcesso, definirStatusDoForm],
  );

  if (descartada) return null;

  if (fase.fase === 'carregando')
    return (
      <div className="grid min-w-0 gap-4">
        <Esqueleto ocupado />
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas procuram. */}
        <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
          Carregando tarefas…
        </p>
      </div>
    );

  if (fase.fase === 'erro')
    return (
      <div className="grid min-w-0 justify-items-start gap-4">
        {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
        <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
          {mensagemFalha(fase.erro)}
        </p>
        <Botao peso="secundario" aoAtivar={() => definirTentativa((valor) => valor + 1)}>
          Tentar novamente
        </Botao>
      </div>
    );

  const { registros } = fase;
  const corresponde = (registro: RegistroTarefa) =>
    (!filtroEstado || registro.tarefa.estado === filtroEstado) &&
    (!filtroPrioridade || registro.tarefa.prioridade === filtroPrioridade);
  const visiveis = registros.filter(corresponde).length;
  const ciclo = servico.ciclo;

  return (
    <section className="grid min-w-0 gap-5">
      <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
        Tarefas da equipe
      </h2>

      {!servico.criarTarefa && !servico.atualizarTarefa ? (
        <p className="m-0 text-(length:--texto-1) text-texto-suave">
          Consulta disponível. Criação e edição ainda indisponíveis.
        </p>
      ) : null}

      {ciclo && bloqueada ? (
        <BarreiraTarefas
          ciclo={ciclo}
          descartarAcesso={descartarAcesso}
          aoLiberar={aoLiberarBarreira}
        />
      ) : null}

      {servico.criarTarefa && !bloqueada ? (
        <FormularioTarefa
          idForm="criar"
          titulo="Nova tarefa"
          rotuloSalvar="Criar tarefa"
          mostrarEstado={false}
          validarNativo
          valoresIniciais={{ descricao: '', responsavel: '', prazo: '', prioridade: 'baixa' }}
          travado={enviando !== null}
          meuEnvio={enviando === 'criar'}
          recuperacaoAtiva={recuperacaoFormId !== null}
          mostrarRecuperarAqui={recuperacaoFormId === 'criar'}
          status={statusPorForm.criar ?? ''}
          onDirty={() => marcarAlterado('criar')}
          aoMudarStatus={(texto) => definirStatusDoForm('criar', texto)}
          onValidado={(tarefa) => {
            const criar = servicoAtual.current.criarTarefa;
            if (!criar) return;
            const tarefaId = crypto.randomUUID();
            const chave = crypto.randomUUID();
            void salvar(
              'criar',
              tarefa,
              () => criar(pacienteId, tarefaId, chave, tarefa),
              'Criando tarefa…',
              'criar',
            );
          }}
          onConsultarNovamente={consultarNovamente}
        />
      ) : null}

      {!registros.length ? (
        <EstadoVazio titulo="Nenhuma tarefa encontrada para este paciente." />
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            <SelecaoAprimorada
              id="tarefas-filtro-estado"
              rotulo="Filtrar por estado"
              value={filtroEstado}
              disabled={enviando !== null}
              onChange={(evento) => definirFiltroEstado(evento.currentTarget.value)}
            >
              <option value="">Todos</option>
              {Object.entries(ESTADOS).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </SelecaoAprimorada>
            <SelecaoAprimorada
              id="tarefas-filtro-prioridade"
              rotulo="Filtrar por prioridade"
              value={filtroPrioridade}
              disabled={enviando !== null}
              onChange={(evento) => definirFiltroPrioridade(evento.currentTarget.value)}
            >
              <option value="">Todos</option>
              {Object.entries(PRIORIDADES).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </SelecaoAprimorada>
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
          <p
            role="status"
            hidden={visiveis > 0}
            className="m-0 text-(length:--texto-1) text-texto-suave"
          >
            Nenhuma tarefa corresponde aos filtros selecionados.
          </p>
          <div className="grid min-w-0 gap-4">
            {registros.map((registro) => (
              <article
                key={registro.tarefa_id}
                hidden={!corresponde(registro)}
                className="grid min-w-0 gap-2 rounded-cartao border border-borda p-4"
              >
                <h3 className="m-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
                  {registro.tarefa.descricao}
                </h3>
                <p className="m-0">{`Estado: ${ESTADOS[registro.tarefa.estado]}`}</p>
                <p className="m-0">{`Responsável: ${registro.tarefa.responsavel}`}</p>
                <p className="m-0">{`Prazo: ${prazoCivil(registro.tarefa.prazo)}`}</p>
                <p className="m-0">{`Prioridade: ${PRIORIDADES[registro.tarefa.prioridade]}`}</p>
                {registro.tarefa.acaoRealizada ? (
                  <p className="m-0">{`Ação realizada: ${registro.tarefa.acaoRealizada}`}</p>
                ) : null}
                {registro.tarefa.justificativa ? (
                  <p className="m-0">{`Justificativa: ${registro.tarefa.justificativa}`}</p>
                ) : null}
                {servico.atualizarTarefa && !bloqueada ? (
                  <FormularioTarefa
                    idForm={registro.tarefa_id}
                    titulo={`Editar tarefa: ${registro.tarefa.descricao}`}
                    rotuloSalvar="Salvar tarefa"
                    mostrarEstado
                    validarNativo={false}
                    valoresIniciais={{
                      descricao: registro.tarefa.descricao,
                      responsavel: registro.tarefa.responsavel,
                      prazo: registro.tarefa.prazo,
                      prioridade: registro.tarefa.prioridade,
                      estado: registro.tarefa.estado,
                      acaoRealizada: registro.tarefa.acaoRealizada ?? '',
                      justificativa: registro.tarefa.justificativa ?? '',
                    }}
                    travado={enviando !== null}
                    meuEnvio={enviando === registro.tarefa_id}
                    recuperacaoAtiva={recuperacaoFormId !== null}
                    mostrarRecuperarAqui={recuperacaoFormId === registro.tarefa_id}
                    status={statusPorForm[registro.tarefa_id] ?? ''}
                    onDirty={() => marcarAlterado(registro.tarefa_id)}
                    aoMudarStatus={(texto) => definirStatusDoForm(registro.tarefa_id, texto)}
                    onValidado={(tarefa) => {
                      const atualizar = servicoAtual.current.atualizarTarefa;
                      if (!atualizar) return;
                      void salvar(
                        registro.tarefa_id,
                        tarefa,
                        () =>
                          atualizar(
                            pacienteId,
                            registro.tarefa_id,
                            registro.versao,
                            crypto.randomUUID(),
                            tarefa,
                          ),
                        'Salvando atualização…',
                        'editar',
                      );
                    }}
                    onConsultarNovamente={consultarNovamente}
                  />
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
