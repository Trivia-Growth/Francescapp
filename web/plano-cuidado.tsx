/* Plano de cuidado (objetivos, ESP-06 campos extras, aprovação e histórico), reconstruído
 * em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarPlanoCuidado(raiz, pacienteId, servico,
 * acessoPerdido, alteracaoPendente, ehFamilia, nomeDoUsuario) => desmontar`.
 *
 * O que a migração entrega:
 *
 * 1. VIS-012. A versão imperativa tinha UMA flag `ativa` conferida em treze pontos
 *    (`if (!ativa) return`): duas na consulta, três na barreira de criação, duas no
 *    envio de revisão/criação, duas na aprovação, duas no histórico e uma no `desenhar`.
 *    Não sobrou nenhuma — `ilha()` desmonta a raiz React e escrever estado depois disso
 *    não faz nada, como nas demais telas já migradas.
 * 2. Superfície plana do `DESIGN.md` nas molduras de lista, vazio e erro.
 *
 * O que NÃO mudou, de propósito (VIS-018):
 *
 * - **Nenhuma frase mudou de palavra**, nem a ausência de formatação de data: os campos
 *   fixos e o histórico continuam mostrando a data como o servidor manda, sem conversão —
 *   só o carimbo de aprovação usa `toLocaleString('pt-BR')`, como antes.
 * - Só a CRIAÇÃO de objetivo passa pela barreira (`ciclo-plano.ts`); revisão nunca passa.
 *   Resultado pendente de OUTRO paciente nunca é reconhecido aqui — o botão de conferência
 *   fica oculto e a tela não repete o `paciente_id` recebido (linha "outro paciente" sem o
 *   valor), para não tratar um aviso de outro caso como prova de identidade.
 * - Existem DOIS caminhos de "descartar rascunho", com efeitos DIFERENTES e de propósito:
 *   o botão imediato de uma criação incerta ("Descartar rascunho e confirmar criação")
 *   só limpa o aviso de alteração pendente e reconsulta — a trava de escrita permanece,
 *   porque o resultado daquele envio específico pode ainda se confirmar sozinho; o botão
 *   de "Consultar versão atual" → "Descartar rascunho e abrir plano atual" reconsulta E
 *   libera a trava E zera a paginação, porque ali a pessoa já conferiu o plano vigente.
 * - Resultado incerto mantém Salvar e Cancelar travados (só os campos reabrem, para
 *   copiar); conflito de versão também trava os dois; falha comum reabre os dois para
 *   nova tentativa — a mesma assimetria da versão imperativa.
 * - Campo extra desativado ou removido do catálogo nunca vira campo editável: continua
 *   como texto fixo, a revisão fica bloqueada até a regularização no catálogo, e o valor
 *   não se perde. Mudança de tipo no catálogo que tornaria o valor antigo inválido mantém
 *   o campo como texto, em vez de truncar o valor (`type=number`/`date` descartaria
 *   silenciosamente um valor incompatível).
 * - Reprovação de aprovação por falta de permissão NUNCA bloqueia revisão — são
 *   autorizações independentes; a tela reconsulta para distinguir "não é aprovador" de
 *   "perdeu acesso ao caso".
 * - Família só lê: sem catálogo, sem revisão, sem aprovação, sem histórico, mas com os
 *   mesmos campos extras do objetivo público que o servidor já filtrou.
 *
 * **O formulário usa rótulo nativo, envolvendo o controle — não os componentes de
 * `componentes/ui`.** As provas de tela localizam cada campo por
 * `[...label].find(l => l.textContent.includes(nome))?.querySelector('input, textarea')`,
 * o padrão "rótulo que envolve o controle" da versão imperativa. Trocar para rótulo com
 * `htmlFor` (o padrão do resto do produto) quebraria essa busca em quase toda prova deste
 * arquivo; preservar o aninhamento é o hook, não um detalhe de estilo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  objetivoSchema,
  validarCamposExtras,
  type AprovadorPlano,
  type CampoExtraCatalogo,
  type Objetivo,
  type RevisaoObjetivo,
  type VisibilidadeObjetivo,
} from '../packages/contracts/src/plano-cuidado.js';
import type { criarCicloPlano } from './ciclo-plano.js';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import { Botao } from './componentes/ui/botao.js';
import { classeControle } from './componentes/ui/campo.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { juntar } from './componentes/ui/juntar.js';
import { Superficie } from './componentes/ui/superficie.js';
import { confirmarDescarte } from './confirmacao.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import { Formulario, valorDe } from './telas/formulario.js';

export type ObjetivoAtual = {
  registro_id?: string;
  aprovacoes?: { registro_id: string; aprovador_usuario_id: string; aprovado_em: string }[];
  objetivo_id: string;
  versao: number;
  objetivo: Objetivo;
  visibilidade: VisibilidadeObjetivo;
};
export type VersaoHistoricoObjetivo = ObjetivoAtual & {
  ator_usuario_id: string;
  data: string;
  motivo?: string;
};
export type Pagina<T> = { itens: T[]; proximo_cursor: string | null };
export type ServicoPlanoCuidado = {
  consultarCatalogo?(): Promise<CampoExtraCatalogo[]>;
  gravarCampoExtra?(
    entrada: Omit<CampoExtraCatalogo, 'versao'> & { versao_esperada: number },
    chave: string,
  ): Promise<void>;
  consultarAprovadores?(): Promise<AprovadorPlano[]>;
  gravarAprovador?(
    entrada: { usuario_id_aprovador: string; ativo: boolean; versao_esperada: number },
    chave: string,
  ): Promise<void>;
  aprovarObjetivo?(
    registroId: string,
  ): Promise<{ registro_id: string; aprovador_usuario_id: string; aprovado_em: string }>;
  consultarHistorico(
    pacienteId: string,
    objetivoId: string,
    cursor?: string,
  ): Promise<Pagina<VersaoHistoricoObjetivo>>;
  consultarObjetivos(pacienteId: string, cursor?: string): Promise<Pagina<ObjetivoAtual>>;
  ciclo: ReturnType<typeof criarCicloPlano>;
  revisarObjetivo(
    pacienteId: string,
    objetivoId: string,
    versaoEsperada: number,
    revisao: RevisaoObjetivo & { visibilidade: VisibilidadeObjetivo },
  ): Promise<void>;
};

const ESTADOS_OBJETIVO = [
  'proposto',
  'em andamento',
  'atingido',
  'pausado',
  'revisar',
  'encerrado',
] as const;
const VISIBILIDADES = [
  ['interna', 'Interna (só a equipe vê)'],
  ['publica', 'Pública (a família também vê)'],
] as const;

function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

/** Rótulo nativo ENVOLVENDO o controle — ver nota do cabeçalho do arquivo. */
function CampoNativo({
  rotulo,
  tipo = 'text',
  area,
  ...resto
}: {
  rotulo: string;
  tipo?: string;
  area?: boolean;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'type'
>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: o controle está sempre dentro do rótulo — textarea OU input, por `area`. A análise estática do biome não enxerga a ramificação condicional, mas o aninhamento é exatamente o gancho que as provas de tela exigem (ver cabeçalho do arquivo).
    <label className="grid min-w-0 gap-1 text-(length:--texto-1) font-semibold">
      <span>{rotulo}</span>
      {area ? (
        <textarea
          required
          rows={3}
          className={juntar(classeControle, 'resize-y')}
          {...(resto as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          type={tipo}
          required
          className={classeControle}
          {...(resto as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
    </label>
  );
}

function SelecaoNativa({
  rotulo,
  children,
  ...resto
}: { rotulo: string; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="grid min-w-0 gap-1 text-(length:--texto-1) font-semibold">
      <span>{rotulo}</span>
      <select className={juntar(classeControle, 'cursor-pointer')} {...resto}>
        {children}
      </select>
    </label>
  );
}

/* --- Campos extras (ESP-06): preparo para desenho e reconstrução no envio. --- */

type CampoExtraRenderizavel = {
  campo: CampoExtraCatalogo;
  valorInicial: string;
  comoTexto: boolean;
  opcaoAntiga?: string;
};

function prepararExtras(
  valoresAnteriores: Record<string, string>,
  catalogo: readonly CampoExtraCatalogo[],
): { bloqueios: { id: string; nome: string; valor: string }[]; ativos: CampoExtraRenderizavel[] } {
  const bloqueios: { id: string; nome: string; valor: string }[] = [];
  for (const [id, valor] of Object.entries(valoresAnteriores)) {
    const campo = catalogo.find((item) => item.campo_id === id);
    if (!campo?.ativo) bloqueios.push({ id, nome: campo?.nome ?? 'Campo indisponível', valor });
  }
  const ativos: CampoExtraRenderizavel[] = catalogo
    .filter((campo) => campo.ativo)
    .map((campo) => {
      const valorAnterior = valoresAnteriores[campo.campo_id];
      const comoTexto =
        campo.tipo !== 'lista' &&
        valorAnterior !== undefined &&
        !validarCamposExtras({ [campo.campo_id]: valorAnterior }, [campo]).ok;
      const opcaoAntiga =
        campo.tipo === 'lista' && valorAnterior && !campo.opcoes?.includes(valorAnterior)
          ? valorAnterior
          : undefined;
      return { campo, valorInicial: valorAnterior ?? '', comoTexto, opcaoAntiga };
    });
  return { bloqueios, ativos };
}

function reconstruirCamposExtras(
  formulario: HTMLFormElement,
  valoresAnteriores: Record<string, string>,
  ativos: readonly CampoExtraRenderizavel[],
): Record<string, string> {
  const resultado = { ...valoresAnteriores };
  for (const { campo } of ativos) {
    const valor = valorDe(formulario, `extra-${campo.campo_id}`);
    if (valor === '') delete resultado[campo.campo_id];
    else resultado[campo.campo_id] = valor;
  }
  return resultado;
}

function CamposExtras({
  bloqueios,
  ativos,
  onDirty,
}: {
  bloqueios: readonly { id: string; nome: string; valor: string }[];
  ativos: readonly CampoExtraRenderizavel[];
  onDirty: () => void;
}) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
      <legend className="px-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
        Campos adicionais (opcionais)
      </legend>
      {bloqueios.map(({ id, nome, valor }) => (
        <p key={id} className="m-0">{`${nome}: ${valor}`}</p>
      ))}
      {ativos.map(({ campo, valorInicial, comoTexto, opcaoAntiga }) =>
        campo.tipo === 'lista' ? (
          <SelecaoNativa
            key={campo.campo_id}
            rotulo={campo.nome}
            name={`extra-${campo.campo_id}`}
            defaultValue={valorInicial}
            onChange={onDirty}
          >
            <option value="">Não preenchido</option>
            {(campo.opcoes ?? []).map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
            {opcaoAntiga ? (
              <option value={opcaoAntiga}>{`${opcaoAntiga} (opção indisponível)`}</option>
            ) : null}
          </SelecaoNativa>
        ) : (
          <CampoNativo
            key={campo.campo_id}
            rotulo={campo.nome}
            name={`extra-${campo.campo_id}`}
            tipo={
              comoTexto
                ? 'text'
                : campo.tipo === 'numero'
                  ? 'number'
                  : campo.tipo === 'data'
                    ? 'date'
                    : 'text'
            }
            step={!comoTexto && campo.tipo === 'numero' ? 'any' : undefined}
            required={false}
            defaultValue={valorInicial}
            onInput={onDirty}
          />
        ),
      )}
      {bloqueios.length ? (
        <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
          Este objetivo contém campos desativados ou indisponíveis. A revisão está bloqueada para
          preservar os valores. Solicite a regularização do catálogo.
        </p>
      ) : null}
    </fieldset>
  );
}

/* --- O visualizador embutido de "Consultar versão atual". --- */

type ConteudoRecuperacao =
  | { tipo: 'imediato' }
  | {
      tipo: 'consulta';
      carregando: boolean;
      erro?: string;
      itens: ObjetivoAtual[];
      proximoCursor: string | null;
    }
  | null;

function VisualizadorAtual({
  conteudo,
  onProximaPagina,
  onDescartarEAbrirAtual,
}: {
  conteudo: Extract<ConteudoRecuperacao, { tipo: 'consulta' }>;
  onProximaPagina: () => void;
  onDescartarEAbrirAtual: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-3">
      <h4 className="m-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
        Plano atual
      </h4>
      {conteudo.carregando ? (
        // biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as provas e os leitores de tela procuram.
        <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
          Consultando plano de cuidado…
        </p>
      ) : conteudo.erro ? (
        // biome-ignore lint/a11y/useSemanticElements: idem.
        <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
          {conteudo.erro}
        </p>
      ) : (
        <>
          {conteudo.itens.length ? null : <p className="m-0">Nenhum objetivo nesta página.</p>}
          {conteudo.itens.map((registro) => (
            <article key={registro.objetivo_id} className="grid min-w-0 gap-1">
              <h5 className="m-0 font-semibold">{registro.objetivo.descricao}</h5>
              <p className="m-0">{`Área: ${registro.objetivo.area}`}</p>
              <p className="m-0">{`Responsável: ${registro.objetivo.responsavel}`}</p>
              <p className="m-0">{`Situação inicial: ${registro.objetivo.situacaoInicial}`}</p>
              <p className="m-0">{`Como observar o progresso: ${registro.objetivo.observacaoProgresso}`}</p>
              <p className="m-0">{`Data de revisão: ${registro.objetivo.dataRevisao}`}</p>
              <p className="m-0">{`Estado: ${registro.objetivo.estado}`}</p>
            </article>
          ))}
          {conteudo.proximoCursor ? (
            <Botao peso="discreto" aoAtivar={onProximaPagina}>
              Próxima página do plano atual
            </Botao>
          ) : null}
          <Botao peso="secundario" aoAtivar={onDescartarEAbrirAtual}>
            Descartar rascunho e abrir plano atual
          </Botao>
        </>
      )}
    </div>
  );
}

/* --- O histórico por objetivo, carregado sob demanda. --- */

type EstadoHistorico = {
  linhas: VersaoHistoricoObjetivo[];
  proximoCursor: string | null;
  carregando: boolean;
  erro?: string;
};

function HistoricoObjetivo({
  pacienteId,
  objetivoId,
  catalogo,
  consultarHistorico,
  descartarAcesso,
}: {
  pacienteId: string;
  objetivoId: string;
  catalogo: readonly CampoExtraCatalogo[];
  consultarHistorico: ServicoPlanoCuidado['consultarHistorico'];
  descartarAcesso: (erro: unknown) => boolean;
}) {
  const [estado, definirEstado] = useState<EstadoHistorico | null>(null);
  const [carregando, definirCarregando] = useState(false);

  const carregar = useCallback(
    (cursor?: string) => {
      flushSync(() => {
        definirCarregando(true);
        definirEstado((atual) => ({
          linhas: cursor ? (atual?.linhas ?? []) : [],
          proximoCursor: atual?.proximoCursor ?? null,
          carregando: true,
          ...(atual?.erro === undefined ? {} : {}),
        }));
      });
      consultarHistorico(pacienteId, objetivoId, cursor).then(
        (pagina) => {
          flushSync(() => {
            definirCarregando(false);
            definirEstado((atual) => ({
              linhas: [...(atual?.linhas ?? []), ...pagina.itens],
              proximoCursor: pagina.proximo_cursor,
              carregando: false,
            }));
          });
        },
        (erro: unknown) => {
          if (descartarAcesso(erro)) return;
          flushSync(() => {
            definirCarregando(false);
            definirEstado((atual) => ({
              linhas: atual?.linhas ?? [],
              proximoCursor: atual?.proximoCursor ?? null,
              carregando: false,
              erro: mensagemFalha(erro),
            }));
          });
        },
      );
    },
    [consultarHistorico, pacienteId, objetivoId, descartarAcesso],
  );

  const rotuloBotao = estado?.proximoCursor ? 'Carregar mais versões' : 'Consultar histórico';

  return (
    <div className="grid min-w-0 gap-3">
      <Botao
        peso="discreto"
        disabled={carregando}
        aria-busy={carregando || undefined}
        aoAtivar={() => carregar(estado?.proximoCursor ?? undefined)}
      >
        {rotuloBotao}
        {carregando ? <Indicador /> : null}
      </Botao>
      {estado ? (
        <div className="grid min-w-0 gap-3">
          {estado.linhas.length ? (
            <h4 className="m-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
              Histórico do objetivo
            </h4>
          ) : null}
          {carregando && !estado.linhas.length ? (
            // biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as provas e os leitores de tela procuram.
            <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
              Carregando histórico…
            </p>
          ) : null}
          {!carregando && !estado.linhas.length && !estado.erro ? (
            <p className="m-0">Nenhuma versão encontrada.</p>
          ) : null}
          {estado.erro ? (
            // biome-ignore lint/a11y/useSemanticElements: idem.
            <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
              {estado.erro}
            </p>
          ) : null}
          {estado.linhas.map((versao) => (
            <section key={`${versao.objetivo_id}-${versao.versao}`} className="grid min-w-0 gap-1">
              <h5 className="m-0 font-semibold">{`Versão ${versao.versao}`}</h5>
              <p className="m-0">{`Objetivo: ${versao.objetivo.descricao}`}</p>
              <p className="m-0">{`Área: ${versao.objetivo.area}`}</p>
              <p className="m-0">{`Responsável: ${versao.objetivo.responsavel}`}</p>
              <p className="m-0">{`Situação inicial: ${versao.objetivo.situacaoInicial}`}</p>
              <p className="m-0">{`Como observar o progresso: ${versao.objetivo.observacaoProgresso}`}</p>
              <p className="m-0">{`Data de revisão: ${versao.objetivo.dataRevisao}`}</p>
              <p className="m-0">{`Estado: ${versao.objetivo.estado}`}</p>
              <p className="m-0">{`Registrado por: ${versao.ator_usuario_id}`}</p>
              <p className="m-0">{`Data do registro: ${versao.data}`}</p>
              {versao.motivo ? (
                <p className="m-0">{`Motivo da revisão: ${versao.motivo}`}</p>
              ) : null}
              {Object.entries(versao.objetivo.camposExtras ?? {}).map(([id, valor]) => (
                <p key={id} className="m-0">
                  {`${catalogo.find((campo) => campo.campo_id === id)?.nome ?? 'Campo adicional'}: ${valor}`}
                </p>
              ))}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* --- O formulário único (criar OU revisar) — só um pode estar aberto por vez. --- */

type FaseFormulario = 'editando' | 'enviando' | 'incerto' | 'conflito';

function FormularioObjetivo({
  pacienteId,
  atual,
  catalogo,
  servico,
  descartarAcesso,
  aoFechar,
  aoDescartarEAbrirAtual,
  aoGravado,
  aoBloquear,
  aoCriacaoIncerta,
  aoGravandoMudou,
  aoAlterado,
}: {
  pacienteId: string;
  atual?: ObjetivoAtual;
  catalogo: readonly CampoExtraCatalogo[];
  servico: Pick<ServicoPlanoCuidado, 'consultarObjetivos' | 'revisarObjetivo' | 'ciclo'>;
  descartarAcesso: (erro: unknown) => boolean;
  /** Fecha o formulário sem mais nenhum efeito colateral — usado pelo cancelamento comum. */
  aoFechar: () => void;
  /** "Descartar rascunho e abrir plano atual": reconsulta, libera a trava de escrita E
   *  zera a paginação — diferente de `aoGravado`, que não mexe na trava. */
  aoDescartarEAbrirAtual: () => void;
  /** Gravação confirmada: `criacaoIncerta` volta a `true` quando é uma criação nova. */
  aoGravado: (eraNovo: boolean) => void;
  aoBloquear: (bloqueado: boolean) => void;
  /** Criação incerta: a barreira tranca de novo IMEDIATAMENTE, antes mesmo de
   *  "Descartar rascunho" — o envio ainda pode se confirmar sozinho no servidor. */
  aoCriacaoIncerta: () => void;
  aoGravandoMudou: (emCurso: boolean) => void;
  aoAlterado: () => void;
}) {
  const { bloqueios, ativos } = useMemo(
    () => prepararExtras(atual?.objetivo.camposExtras ?? {}, catalogo),
    [atual, catalogo],
  );
  const valoresAnteriores = atual?.objetivo.camposExtras ?? {};

  const [fase, definirFase] = useState<FaseFormulario>('editando');
  const [aviso, definirAviso] = useState('');
  const [recuperacao, definirRecuperacao] = useState<ConteudoRecuperacao>(null);
  const rascunhoAlteradoRef = useRef(false);
  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;

  function onDirty() {
    rascunhoAlteradoRef.current = true;
    aoAlterado();
  }

  async function cancelar() {
    if (
      rascunhoAlteradoRef.current &&
      !(await confirmarDescarte('as alterações não salvas deste objetivo'))
    )
      return;
    aoFechar();
  }

  function enviar(formulario: HTMLFormElement) {
    if (fase !== 'editando') return;
    const camposExtras = reconstruirCamposExtras(formulario, valoresAnteriores, ativos);
    if (bloqueios.length || !validarCamposExtras(camposExtras, catalogo).ok) {
      definirAviso(
        'Confira os campos adicionais. Valores desativados precisam ser regularizados no catálogo antes da revisão.',
      );
      return;
    }
    const validado = objetivoSchema.safeParse({
      ...(Object.keys(camposExtras).length ? { camposExtras } : {}),
      descricao: valorDe(formulario, 'descricao'),
      area: valorDe(formulario, 'area'),
      responsavel: valorDe(formulario, 'responsavel'),
      situacaoInicial: valorDe(formulario, 'situacaoInicial'),
      observacaoProgresso: valorDe(formulario, 'observacaoProgresso'),
      dataRevisao: valorDe(formulario, 'dataRevisao'),
      estado: valorDe(formulario, 'estado'),
    });
    const motivo = atual ? valorDe(formulario, 'motivo').trim() : undefined;
    const audiencia = valorDe(formulario, 'visibilidade') === 'publica' ? 'publica' : 'interna';
    if (!validado.success || (atual && !motivo)) {
      definirAviso('Preencha todos os campos e confira a data de revisão.');
      return;
    }
    flushSync(() => {
      definirFase('enviando');
      definirAviso('Salvando objetivo…');
    });
    aoGravandoMudou(true);
    const operacao = atual
      ? servicoAtual.current.revisarObjetivo(pacienteId, atual.objetivo_id, atual.versao, {
          objetivo: validado.data,
          motivo: motivo ?? '',
          visibilidade: audiencia,
        })
      : servicoAtual.current.ciclo.criar(pacienteId, validado.data, audiencia);
    operacao.then(
      () => {
        aoGravandoMudou(false);
        aoGravado(!atual);
      },
      (erro: unknown) => {
        aoGravandoMudou(false);
        if (descartarAcesso(erro)) return;
        if (!atual || resultadoIncerto(erro)) {
          flushSync(() => {
            definirFase('incerto');
            definirAviso(
              'Não foi possível confirmar o salvamento. Preserve seu rascunho e consulte a versão atual antes de tentar novamente.',
            );
            if (!atual) {
              definirRecuperacao({ tipo: 'imediato' });
              // Criação incerta re-trava IMEDIATAMENTE a barreira — o envio ainda pode
              // se confirmar sozinho no servidor, e permitir outra criação enquanto
              // isso é exatamente o que a conferência existe para impedir.
              aoCriacaoIncerta();
            }
          });
          aoBloquear(true);
          return;
        }
        const conflito = erro instanceof FalhaApi && erro.codigo === 'conflito_versao';
        flushSync(() => {
          definirFase(conflito ? 'conflito' : 'editando');
          definirAviso(
            conflito
              ? 'O objetivo foi alterado por outra pessoa. Preserve seu rascunho e consulte a versão atual antes de revisar novamente.'
              : mensagemFalha(erro),
          );
        });
        aoBloquear(conflito);
      },
    );
  }

  function consultarVersaoAtual(cursor?: string) {
    flushSync(() =>
      definirRecuperacao((atual2) => ({
        tipo: 'consulta',
        carregando: true,
        itens: atual2 && atual2.tipo === 'consulta' && cursor ? atual2.itens : [],
        proximoCursor: atual2 && atual2.tipo === 'consulta' ? atual2.proximoCursor : null,
      })),
    );
    servicoAtual.current.consultarObjetivos(pacienteId, cursor).then(
      (pagina) => {
        flushSync(() =>
          definirRecuperacao((atual2) => ({
            tipo: 'consulta',
            carregando: false,
            itens: [
              ...(atual2 && atual2.tipo === 'consulta' && cursor ? atual2.itens : []),
              ...pagina.itens,
            ],
            proximoCursor: pagina.proximo_cursor,
          })),
        );
      },
      (erro: unknown) => {
        if (descartarAcesso(erro)) return;
        flushSync(() =>
          definirRecuperacao((atual2) => ({
            tipo: 'consulta',
            carregando: false,
            erro: mensagemFalha(erro),
            itens: atual2 && atual2.tipo === 'consulta' ? atual2.itens : [],
            proximoCursor: atual2 && atual2.tipo === 'consulta' ? atual2.proximoCursor : null,
          })),
        );
      },
    );
  }

  // `campos` só trava DURANTE o envio — resultado incerto e conflito reabrem os campos
  // para copiar, e só mantêm Salvar/Cancelar travados (ver cabeçalho do arquivo).
  const camposTravados = fase === 'enviando';
  const acoesTravadas = fase !== 'editando';
  const mostrarConsultarAtual = fase === 'incerto' || fase === 'conflito';

  return (
    <Formulario aoEnviar={enviar} noValidate className="grid min-w-0 gap-4">
      <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
        {atual ? 'Revisar objetivo' : 'Novo objetivo'}
      </h3>
      <fieldset disabled={camposTravados} className="m-0 grid min-w-0 gap-4 border-0 p-0">
        <legend className="px-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
          Dados do objetivo
        </legend>
        <CampoNativo
          rotulo="Objetivo"
          area
          name="descricao"
          defaultValue={atual?.objetivo.descricao}
          onInput={onDirty}
        />
        <CampoNativo
          rotulo="Área"
          name="area"
          defaultValue={atual?.objetivo.area}
          onInput={onDirty}
        />
        <CampoNativo
          rotulo="Responsável"
          name="responsavel"
          defaultValue={atual?.objetivo.responsavel}
          onInput={onDirty}
        />
        <CampoNativo
          rotulo="Situação inicial"
          area
          name="situacaoInicial"
          defaultValue={atual?.objetivo.situacaoInicial}
          onInput={onDirty}
        />
        <CampoNativo
          rotulo="Como observar o progresso"
          area
          name="observacaoProgresso"
          defaultValue={atual?.objetivo.observacaoProgresso}
          onInput={onDirty}
        />
        <CampoNativo
          rotulo="Data de revisão"
          tipo="date"
          name="dataRevisao"
          defaultValue={atual?.objetivo.dataRevisao}
          onInput={onDirty}
        />
        <SelecaoNativa
          rotulo="Estado"
          name="estado"
          defaultValue={atual?.objetivo.estado ?? ESTADOS_OBJETIVO[0]}
          onChange={onDirty}
        >
          {ESTADOS_OBJETIVO.map((valor) => (
            <option key={valor} value={valor}>
              {valor}
            </option>
          ))}
        </SelecaoNativa>
        <SelecaoNativa
          rotulo="Visibilidade para a família"
          name="visibilidade"
          defaultValue={atual?.visibilidade ?? 'interna'}
          onChange={onDirty}
        >
          {VISIBILIDADES.map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </SelecaoNativa>
        <CamposExtras bloqueios={bloqueios} ativos={ativos} onDirty={onDirty} />
        {atual ? (
          <CampoNativo rotulo="Motivo da revisão" area name="motivo" onInput={onDirty} />
        ) : null}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Botao
          peso="principal"
          tipo="submit"
          disabled={acoesTravadas}
          aria-busy={fase === 'enviando' || undefined}
        >
          {atual ? 'Salvar revisão' : 'Salvar objetivo'}
          {fase === 'enviando' ? <Indicador /> : null}
        </Botao>
        <Botao peso="secundario" disabled={acoesTravadas} aoAtivar={() => void cancelar()}>
          Cancelar
        </Botao>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as provas e os leitores de tela procuram. */}
      <p
        role="status"
        className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave empty:hidden"
      >
        {aviso}
      </p>
      {mostrarConsultarAtual ? (
        <Botao peso="secundario" aoAtivar={() => consultarVersaoAtual()}>
          Consultar versão atual
        </Botao>
      ) : null}
      {recuperacao?.tipo === 'imediato' ? (
        // Só limpa o aviso de alteração pendente e reconsulta — a trava de escrita
        // (`bloqueada`) permanece, porque o envio incerto ainda pode se confirmar sozinho.
        // Diferente do "Descartar rascunho e abrir plano atual", que o solicitante só vê
        // depois de CONFERIR o plano vigente (ver cabeçalho do arquivo).
        <Botao peso="secundario" aoAtivar={() => aoGravado(false)}>
          Descartar rascunho e confirmar criação
        </Botao>
      ) : null}
      {recuperacao?.tipo === 'consulta' ? (
        <VisualizadorAtual
          conteudo={recuperacao}
          onProximaPagina={() => consultarVersaoAtual(recuperacao.proximoCursor ?? undefined)}
          onDescartarEAbrirAtual={aoDescartarEAbrirAtual}
        />
      ) : null}
    </Formulario>
  );
}

/* --- Um objetivo da lista: exibição, aprovação e histórico. --- */

function ItemObjetivo({
  pacienteId,
  registro,
  catalogo,
  ehFamilia,
  nomeDoUsuario,
  servico,
  descartarAcesso,
  onAbrir,
}: {
  pacienteId: string;
  registro: ObjetivoAtual;
  catalogo: readonly CampoExtraCatalogo[];
  ehFamilia: boolean;
  nomeDoUsuario: (usuarioId: string) => string | undefined;
  servico: Pick<
    ServicoPlanoCuidado,
    'aprovarObjetivo' | 'consultarObjetivos' | 'consultarHistorico'
  >;
  descartarAcesso: (erro: unknown) => boolean;
  /** `abrir()` (como "Revisar objetivo") checa gravação/trava/barreira/formulário aberto
   *  no pai, em `tentarAbrir` — "Revisar objetivo" nunca fica com o atributo `disabled`,
   *  igual à versão imperativa; o clique simplesmente não abre nada enquanto bloqueado. */
  onAbrir: () => void;
}) {
  const [aprovando, definirAprovando] = useState(false);
  const [resultadoAprovacao, definirResultadoAprovacao] = useState('');
  const [aprovado, definirAprovado] = useState(false);

  function aprovar() {
    flushSync(() => {
      definirAprovando(true);
      definirResultadoAprovacao('Registrando aprovação…');
    });
    const aprovarObjetivo = servico.aprovarObjetivo;
    const registroId = registro.registro_id;
    if (!aprovarObjetivo || !registroId) return;
    aprovarObjetivo(registroId).then(
      (carimbo) => {
        flushSync(() => {
          definirAprovado(true);
          definirResultadoAprovacao(
            `Versão ${registro.versao} aprovada por ${
              nomeDoUsuario(carimbo.aprovador_usuario_id) ??
              'Aprovador sem identificação disponível'
            } em ${new Date(carimbo.aprovado_em).toLocaleString('pt-BR')}.`,
          );
        });
      },
      (erro: unknown) => {
        if (erro instanceof FalhaApi && erro.status === 403 && erro.codigo === 'sem_permissao') {
          // Não ser aprovador não revoga permissão de trabalhar no plano.
          // Reconsultar para distinguir perda de acesso ao caso de negativa do carimbo.
          servico.consultarObjetivos(pacienteId).then(
            () => {
              flushSync(() => {
                definirAprovando(false);
                definirResultadoAprovacao(
                  'Você não possui permissão vigente para aprovar esta versão.',
                );
              });
            },
            (falha: unknown) => {
              if (descartarAcesso(falha)) return;
              flushSync(() => {
                definirAprovando(false);
                definirResultadoAprovacao(
                  'Você não possui permissão vigente para aprovar esta versão.',
                );
              });
            },
          );
          return;
        }
        if (descartarAcesso(erro)) return;
        flushSync(() => {
          definirAprovando(false);
          definirResultadoAprovacao(mensagemFalha(erro));
        });
      },
    );
  }

  return (
    <article className="grid min-w-0 gap-2 rounded-cartao border border-borda p-4">
      <h3 className="m-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
        {registro.objetivo.descricao}
      </h3>
      <p className="m-0">{`Área: ${registro.objetivo.area}`}</p>
      <p className="m-0">{`Responsável: ${registro.objetivo.responsavel}`}</p>
      <p className="m-0">{`Situação inicial: ${registro.objetivo.situacaoInicial}`}</p>
      <p className="m-0">{`Como observar o progresso: ${registro.objetivo.observacaoProgresso}`}</p>
      <p className="m-0">{`Data de revisão: ${registro.objetivo.dataRevisao}`}</p>
      <p className="m-0">{`Estado: ${registro.objetivo.estado}`}</p>
      {ehFamilia ? null : (
        <p className="m-0">{`Visibilidade: ${registro.visibilidade === 'publica' ? 'Pública' : 'Interna'}`}</p>
      )}
      {Object.entries(registro.objetivo.camposExtras ?? {}).map(([id, valor]) => (
        <p key={id} className="m-0">
          {`${catalogo.find((campo) => campo.campo_id === id)?.nome ?? 'Campo adicional'}: ${valor}`}
        </p>
      ))}
      {ehFamilia ? null : (
        <>
          {(registro.aprovacoes ?? []).map((aprovacao) => (
            <p key={aprovacao.registro_id} className="m-0">
              {`Versão ${registro.versao} aprovada por ${
                nomeDoUsuario(aprovacao.aprovador_usuario_id) ??
                'Aprovador sem identificação disponível'
              } em ${new Date(aprovacao.aprovado_em).toLocaleString('pt-BR')}.`}
            </p>
          ))}
          {servico.aprovarObjetivo && registro.registro_id ? (
            <div className="flex flex-wrap items-center gap-3">
              <Botao
                peso="secundario"
                disabled={aprovando || aprovado}
                aria-busy={aprovando || undefined}
                aoAtivar={aprovar}
              >
                Aprovar esta versão
                {aprovando ? <Indicador /> : null}
              </Botao>
              {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
              <p
                role="status"
                className="m-0 text-(length:--texto-1) text-texto-suave empty:hidden"
              >
                {resultadoAprovacao}
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Botao peso="discreto" aoAtivar={onAbrir}>
              Revisar objetivo
            </Botao>
          </div>
          <HistoricoObjetivo
            pacienteId={pacienteId}
            objetivoId={registro.objetivo_id}
            catalogo={catalogo}
            consultarHistorico={servico.consultarHistorico}
            descartarAcesso={descartarAcesso}
          />
        </>
      )}
    </article>
  );
}

/* --- A barreira de criação (`ciclo-plano.ts`). Só a CRIAÇÃO passa por ela. --- */

type FaseBarreira = 'inicial' | 'pendente-mesmo' | 'pendente-outro';

function BarreiraPlano({
  ciclo,
  pacienteId,
  descartarAcesso,
  formAberto,
  ocupado,
  definirOcupado,
  aoLiberar,
}: {
  ciclo: ReturnType<typeof criarCicloPlano>;
  pacienteId: string;
  descartarAcesso: (erro: unknown) => boolean;
  formAberto: boolean;
  /** Levantado para o pai: `abrir()` (Adicionar/Revisar objetivo) e a navegação de
   *  páginas também precisam saber se a conferência está em curso, não só este botão. */
  ocupado: boolean;
  definirOcupado: (valor: boolean) => void;
  aoLiberar: () => void;
}) {
  const [fase, definirFase] = useState<FaseBarreira>('inicial');
  const [aviso, definirAviso] = useState(
    'Antes de criar um objetivo, confira se já existe algum envio aguardando resposta.',
  );
  const reconhecidoRef = useRef(false);

  const concluirSemPendencia = useCallback(() => {
    ciclo.liberar();
    aoLiberar();
  }, [ciclo, aoLiberar]);

  const conferirPrimeiraVez = useCallback(() => {
    flushSync(() => {
      definirOcupado(true);
      definirAviso('Conferindo…');
    });
    (async () => {
      let situacao = await ciclo.consultar();
      if (!situacao.resultado_pendente) {
        await ciclo.encerrar();
        situacao = await ciclo.consultar();
      }
      if (situacao.resultado_pendente) {
        if (situacao.resultado_pendente.paciente_id.toLowerCase() !== pacienteId.toLowerCase()) {
          flushSync(() => {
            definirAviso(
              'O envio aguardando resposta é de outro paciente. Abra o plano dele para conferir antes de continuar aqui.',
            );
            definirFase('pendente-outro');
            definirOcupado(false);
          });
          return;
        }
        const resultado = situacao.resultado_pendente.resultado;
        flushSync(() => {
          definirAviso(
            resultado === 'confirmada'
              ? 'O objetivo enviado antes foi salvo. Confira-o na lista abaixo.'
              : 'O objetivo enviado antes não foi salvo.',
          );
          definirFase('pendente-mesmo');
          definirOcupado(false);
        });
        return;
      }
      concluirSemPendencia();
    })().catch((erro: unknown) => {
      if (descartarAcesso(erro)) return;
      flushSync(() => {
        definirAviso('Não foi possível conferir agora. Tente novamente.');
        definirOcupado(false);
      });
    });
  }, [ciclo, pacienteId, descartarAcesso, concluirSemPendencia, definirOcupado]);

  const reconhecerPendente = useCallback(() => {
    flushSync(() => definirOcupado(true));
    (async () => {
      if (!reconhecidoRef.current) {
        await ciclo.reconhecer();
        reconhecidoRef.current = true;
      }
      await ciclo.consultar();
      concluirSemPendencia();
    })()
      .catch((erro: unknown) => {
        if (descartarAcesso(erro)) return;
        flushSync(() => {
          definirAviso('Não foi possível concluir. Tente novamente.');
          definirOcupado(false);
        });
      })
      .finally(() => {
        definirOcupado(false);
      });
  }, [ciclo, descartarAcesso, concluirSemPendencia, definirOcupado]);

  return (
    <div className="grid min-w-0 gap-3 rounded-cartao border border-borda p-4">
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as provas e os leitores de tela procuram. */}
      <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
        {aviso}
      </p>
      <div>
        {/* O botão permanece no DOM, só OCULTO, quando o pendente é de outro paciente:
            reconhecer o resultado errado exigiria repetir o `paciente_id` recebido como
            prova de identidade, e a tela nunca faz isso (ver cabeçalho do arquivo). */}
        <Botao
          peso="secundario"
          data-recuperacao-plano=""
          hidden={fase === 'pendente-outro'}
          disabled={formAberto || ocupado}
          aria-busy={ocupado || undefined}
          aoAtivar={fase === 'pendente-mesmo' ? reconhecerPendente : conferirPrimeiraVez}
        >
          {fase === 'pendente-mesmo' ? 'Entendi, liberar novo objetivo' : 'Conferir e liberar'}
          {ocupado ? <Indicador /> : null}
        </Botao>
      </div>
    </div>
  );
}

/* --- A tela. --- */

type Fase =
  | { fase: 'carregando' }
  | { fase: 'pronta'; pagina: Pagina<ObjetivoAtual>; cursorAtual?: string }
  | { fase: 'erro'; erro: unknown; cursor?: string };

function TelaPlanoCuidado({
  pacienteId,
  servico,
  acessoPerdido,
  alteracaoPendente,
  ehFamilia,
  nomeDoUsuario,
}: {
  pacienteId: string;
  servico: ServicoPlanoCuidado;
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
  ehFamilia: boolean;
  nomeDoUsuario: (usuarioId: string) => string | undefined;
}) {
  const [descartada, definirDescartada] = useState(false);
  const [fase, definirFase] = useState<Fase>({ fase: 'carregando' });
  const [catalogo, definirCatalogo] = useState<CampoExtraCatalogo[]>([]);
  const [criacaoIncerta, definirCriacaoIncerta] = useState(true);
  const [bloqueada, definirBloqueada] = useState(false);
  const [gravando, definirGravando] = useState(false);
  const [ocupadoBarreira, definirOcupadoBarreira] = useState(false);
  const [formAberto, definirFormAberto] = useState<'novo' | ObjetivoAtual | null>(null);
  const cursoresAnterioresRef = useRef<(string | undefined)[]>([]);

  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;
  const avisarPendente = useRef(alteracaoPendente);
  avisarPendente.current = alteracaoPendente;

  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    flushSync(() => definirDescartada(true));
    avisarPerda.current(erro);
    return true;
  }, []);

  /** Busca a página e, quando aplicável, o catálogo — sem mexer em `fase` antes. Usada
   *  direto na montagem, onde o estado já nasce `carregando` (`useState` acima): um
   *  `flushSync` aqui ficaria aninhado dentro do `flushSync` da própria `ilha()` e
   *  derrubaria o React ("React cannot flush when React is already rendering"). */
  const buscarPagina = useCallback(
    (cursor?: string) => {
      Promise.all([
        servicoAtual.current.consultarObjetivos(pacienteId, cursor),
        !ehFamilia && servicoAtual.current.consultarCatalogo
          ? servicoAtual.current.consultarCatalogo()
          : Promise.resolve<CampoExtraCatalogo[] | null>(null),
      ]).then(
        ([pagina, catalogoNovo]) => {
          flushSync(() => {
            if (catalogoNovo) definirCatalogo(catalogoNovo);
            definirFase({ fase: 'pronta', pagina, cursorAtual: cursor });
          });
        },
        (erro: unknown) => {
          if (descartarAcesso(erro)) return;
          flushSync(() => definirFase({ fase: 'erro', erro, cursor }));
        },
      );
    },
    [pacienteId, ehFamilia, descartarAcesso],
  );

  /** Recarrega a partir de um clique comum (recuperação, paginação, "Tentar novamente",
   *  gravação concluída): aqui o `flushSync` é seguro — e necessário, porque o clique real
   *  de uma prova de tela não garante, por si só, o repintar síncrono que as provas
   *  conferem logo na linha seguinte. */
  const consultar = useCallback(
    (cursor?: string) => {
      flushSync(() => definirFase({ fase: 'carregando' }));
      buscarPagina(cursor);
    },
    [buscarPagina],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara só na montagem.
  useEffect(() => {
    buscarPagina();
  }, []);

  // Mesmas quatro condições de `abrir()` na versão imperativa: gravação em curso,
  // trava de escrita, conferência da barreira em curso, ou já há um formulário aberto.
  function tentarAbrir(alvo: 'novo' | ObjetivoAtual) {
    if (gravando || bloqueada || ocupadoBarreira || formAberto !== null) return;
    flushSync(() => definirFormAberto(alvo));
  }

  // A paginação NÃO confere `bloqueada` — ela trava escrita, não leitura — só formulário
  // aberto, conferência em curso e gravação, como na versão imperativa.
  function avancarPagina() {
    if (formAberto !== null || ocupadoBarreira || gravando || fase.fase !== 'pronta') return;
    cursoresAnterioresRef.current.push(fase.cursorAtual);
    consultar(fase.pagina.proximo_cursor ?? undefined);
  }

  function voltarPagina() {
    if (formAberto !== null || ocupadoBarreira || gravando) return;
    consultar(cursoresAnterioresRef.current.pop());
  }

  const fecharFormulario = useCallback(() => {
    avisarPendente.current(false);
    flushSync(() => definirFormAberto(null));
  }, []);

  const aoGravado = useCallback(
    (eraNovo: boolean) => {
      avisarPendente.current(false);
      flushSync(() => {
        definirFormAberto(null);
        if (eraNovo) definirCriacaoIncerta(true);
      });
      consultar();
    },
    [consultar],
  );

  const descartarEAbrirAtual = useCallback(() => {
    avisarPendente.current(false);
    cursoresAnterioresRef.current = [];
    flushSync(() => {
      definirFormAberto(null);
      definirBloqueada(false);
    });
    consultar();
  }, [consultar]);

  const aoLiberarBarreira = useCallback(() => {
    flushSync(() => {
      definirCriacaoIncerta(false);
      definirBloqueada(false);
      // `ocupadoBarreira` foi levantado para o pai (`tentarAbrir`/paginação também
      // precisam dele) — ao contrário da versão com estado só local, ele NÃO some
      // sozinho quando `BarreiraPlano` desmonta por `criacaoIncerta` virar falso.
      definirOcupadoBarreira(false);
    });
    consultar();
  }, [consultar]);

  if (descartada) return null;

  if (fase.fase === 'carregando')
    return (
      <div className="grid min-w-0 gap-4">
        <Esqueleto ocupado />
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as provas procuram. */}
        <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
          Carregando plano de cuidado…
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
        <Botao peso="secundario" aoAtivar={() => consultar(fase.cursor)}>
          Tentar novamente
        </Botao>
      </div>
    );

  const { pagina } = fase;
  const objetivos = pagina.itens;
  const servicoComumItem = {
    aprovarObjetivo: servico.aprovarObjetivo,
    consultarObjetivos: servico.consultarObjetivos,
    consultarHistorico: servico.consultarHistorico,
  };
  const servicoComumForm = {
    consultarObjetivos: servico.consultarObjetivos,
    revisarObjetivo: servico.revisarObjetivo,
    ciclo: servico.ciclo,
  };

  return (
    <section className="grid min-w-0 gap-5">
      <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
        Plano de cuidado
      </h2>
      <p className="m-0 text-(length:--texto-1) text-texto-suave">
        A lista pode mudar entre páginas. Atualize para consultar novamente.
      </p>

      {criacaoIncerta && !ehFamilia ? (
        <BarreiraPlano
          ciclo={servico.ciclo}
          pacienteId={pacienteId}
          descartarAcesso={descartarAcesso}
          formAberto={formAberto !== null}
          ocupado={ocupadoBarreira}
          definirOcupado={definirOcupadoBarreira}
          aoLiberar={aoLiberarBarreira}
        />
      ) : null}

      {!objetivos.length ? <EstadoVazio titulo="Nenhum objetivo nesta página." /> : null}

      <div className="grid min-w-0 gap-4">
        {objetivos.map((registro) =>
          ehFamilia ? (
            <article
              key={registro.objetivo_id}
              className="grid min-w-0 gap-2 rounded-cartao border border-borda p-4"
            >
              <h3 className="m-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
                {registro.objetivo.descricao}
              </h3>
              <p className="m-0">{`Área: ${registro.objetivo.area}`}</p>
              <p className="m-0">{`Responsável: ${registro.objetivo.responsavel}`}</p>
              <p className="m-0">{`Situação inicial: ${registro.objetivo.situacaoInicial}`}</p>
              <p className="m-0">{`Como observar o progresso: ${registro.objetivo.observacaoProgresso}`}</p>
              <p className="m-0">{`Data de revisão: ${registro.objetivo.dataRevisao}`}</p>
              <p className="m-0">{`Estado: ${registro.objetivo.estado}`}</p>
              {Object.entries(registro.objetivo.camposExtras ?? {}).map(([id, valor]) => (
                <p key={id} className="m-0">
                  {`${catalogo.find((campo) => campo.campo_id === id)?.nome ?? 'Campo adicional'}: ${valor}`}
                </p>
              ))}
            </article>
          ) : (
            <ItemObjetivo
              key={registro.objetivo_id}
              pacienteId={pacienteId}
              registro={registro}
              catalogo={catalogo}
              ehFamilia={ehFamilia}
              nomeDoUsuario={nomeDoUsuario}
              servico={servicoComumItem}
              descartarAcesso={descartarAcesso}
              onAbrir={() => tentarAbrir(registro)}
            />
          ),
        )}
      </div>

      {cursoresAnterioresRef.current.length ? (
        <Botao peso="discreto" aoAtivar={voltarPagina}>
          Página anterior de objetivos
        </Botao>
      ) : null}
      {pagina.proximo_cursor ? (
        <Botao peso="discreto" aoAtivar={avancarPagina}>
          Próxima página de objetivos
        </Botao>
      ) : null}

      {ehFamilia ? null : (
        <>
          <Botao peso="secundario" disabled={criacaoIncerta} aoAtivar={() => tentarAbrir('novo')}>
            Adicionar objetivo
          </Botao>
          {formAberto !== null ? (
            <Superficie>
              <FormularioObjetivo
                pacienteId={pacienteId}
                atual={formAberto === 'novo' ? undefined : formAberto}
                catalogo={catalogo}
                servico={servicoComumForm}
                descartarAcesso={descartarAcesso}
                aoFechar={fecharFormulario}
                aoDescartarEAbrirAtual={descartarEAbrirAtual}
                aoGravado={aoGravado}
                aoBloquear={definirBloqueada}
                aoCriacaoIncerta={() => definirCriacaoIncerta(true)}
                aoGravandoMudou={definirGravando}
                aoAlterado={() => avisarPendente.current(true)}
              />
            </Superficie>
          ) : null}
        </>
      )}
    </section>
  );
}

export function montarPlanoCuidado(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoPlanoCuidado,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
  ehFamilia = false,
  nomeDoUsuario: (usuarioId: string) => string | undefined = () => undefined,
): () => void {
  return ilha(
    raiz,
    <TelaPlanoCuidado
      pacienteId={pacienteId}
      servico={servico}
      acessoPerdido={acessoPerdido}
      alteracaoPendente={alteracaoPendente}
      ehFamilia={ehFamilia}
      nomeDoUsuario={nomeDoUsuario}
    />,
  );
}
