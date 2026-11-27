/* Situação, responsável e cadastro do paciente, reconstruído em React sobre a ilha
 * (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarEdicaoPaciente(raiz, pacienteId, servico,
 * acessoPerdido, alteracaoPendente) => desmontar`.
 *
 * O que a migração entrega:
 *
 * 1. VIS-012. A versão imperativa tinha UMA flag `ativa` conferida em diversos pontos
 *    (carregamento, conferência, envio). Não sobrou nenhuma — `ilha()` desmonta a raiz
 *    React e escrever estado depois disso não faz nada, como nas demais telas migradas.
 * 2. Superfície plana do `DESIGN.md`: resumo e formulário, cada um na sua superfície.
 *
 * O que NÃO mudou, de propósito (VIS-018):
 *
 * - **Nenhuma frase mudou de palavra.**
 * - A aba abre SEM carregar (só "Confira o cadastro para começar a editar." e o botão):
 *   pode haver uma edição anterior sem resposta, e a conferência tem que vir antes.
 * - Os DOIS caminhos de conclusão da conferência continuam distintos: sem formulário
 *   ainda desenhado, ela libera a trava E carrega o cadastro; com formulário já
 *   desenhado (recuperação depois de um envio), ela só reabre os campos para copiar o
 *   rascunho — quem decide descartá-lo e recarregar é a pessoa, no botão "Recarregar
 *   cadastro".
 * - Resultado pendente de OUTRO paciente nunca é reconhecido, e a tela nunca repete o
 *   `paciente_id` recebido.
 * - Qualquer envio — sucesso ou falha — tranca a edição de novo: só a conferência
 *   reabre. O rascunho NUNCA é limpo por uma falha; só por "Recarregar cadastro".
 * - A seção de substituição de case manager (`servico.substituicao`) recebe a equipe tal
 *   como ela estava no instante em que o cadastro foi desenhado — a mesma leitura que a
 *   versão imperativa fazia (a listagem assíncrona de responsáveis quase sempre ainda não
 *   havia chegado nesse instante). Não "corrigido" aqui: seria mudança de comportamento
 *   sem autorização.
 * - A situação permanece editável mesmo quando a equipe não pode ser listada; só o
 *   responsável fica indisponível.
 *
 * **Os campos do formulário são NÃO controlados** (o DOM é quem tem o valor, como na
 * versão imperativa): as provas atribuem `.value` cru. O `<select>` de responsável troca
 * de `key` quando a equipe muda de fase (carregando → pronta/indisponível/falhou) para
 * herdar a pré-seleção correta sem virar campo controlado — o mesmo truque de
 * `plano-cuidado.tsx` para o formulário de acordo.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  atualizarPacienteSchema,
  type AtualizarPaciente,
  type PacienteEdicao,
} from '../packages/contracts/src/index.js';
import {
  descreverResponsavel,
  rotulosSituacao,
  type ResponsavelOpcao,
} from './acompanhamento-caso.js';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import type { criarCicloEdicaoPaciente } from './ciclo-edicao-paciente.js';
import { confirmar } from './confirmacao.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { Campo } from './componentes/ui/campo.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { Superficie } from './componentes/ui/superficie.js';
import { dataDeInstante } from './datas.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import { Formulario, valorDe } from './telas/formulario.js';
import type { ServicoSubstituicaoCaseManager } from './servico-substituicao-cm-http.js';
import { SecaoSubstituicaoCaseManager } from './substituicao-case-manager.js';

export type ServicoEdicaoPaciente = {
  consultarPaciente(pacienteId: string): Promise<PacienteEdicao>;
  /** Ausente quando o perfil não pode listar a equipe: a situação segue editável, o responsável não. */
  listarResponsaveis?: () => Promise<ResponsavelOpcao[]>;
  /** FR-037: ausente enquanto a fatia da substituição temporária está desligada. A seção
   *  só aparece quando o serviço é passado; a autorização continua no servidor e no banco. */
  /** `null` = fatia desligada: a seção é montada em estado honesto de indisponibilidade.
   * Ausente = o perfil não administra o caso e a seção não existe. */
  substituicao?: ServicoSubstituicaoCaseManager | null;
  ciclo: ReturnType<typeof criarCicloEdicaoPaciente>;
};

/** O primeiro retrato, gravado com o cadastro do caso, não tem motivo. */
const textoMotivo = (motivo: string | null) =>
  motivo === null ? 'Registrado no cadastro do caso.' : `Motivo: ${motivo}`;

const textoSituacao = (mudanca: PacienteEdicao['acompanhamento'][number] | undefined) =>
  mudanca?.situacao ? rotulosSituacao[mudanca.situacao] : 'a completar';

type EquipeEstado =
  | { tipo: 'carregando' }
  | { tipo: 'indisponivel' }
  | { tipo: 'falhou' }
  | { tipo: 'pronta'; opcoes: ResponsavelOpcao[] };

type ResultadoPendenteEdicao = {
  resultado: 'confirmada' | 'cancelada';
  paciente_id: string;
  versao: number | null;
};

function ResumoCaso({
  paciente,
  equipe,
}: {
  paciente: PacienteEdicao;
  equipe: readonly ResponsavelOpcao[];
}) {
  const vigente = paciente.acompanhamento[0];
  const faltantes = [
    ...(paciente.nome_preferencia ? [] : ['nome de preferência']),
    ...(paciente.data_nascimento ? [] : ['data de nascimento']),
    ...(paciente.contatos.length ? [] : ['contato']),
    ...(vigente?.situacao ? [] : ['situação do caso']),
    ...(vigente?.responsavel_id ? [] : ['responsável']),
  ];
  return (
    <section className="caso-resumo grid min-w-0 gap-3">
      <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
        Situação e responsável do caso
      </h3>
      <ul className="visao-lista m-0 grid min-w-0 list-disc gap-1 pl-5">
        <li>{`Situação: ${textoSituacao(vigente)}`}</li>
        <li>{`Responsável: ${vigente ? descreverResponsavel(vigente, equipe) : 'a completar'}`}</li>
        {vigente ? (
          <li>{`Desde ${dataDeInstante(vigente.criado_em) ?? 'data indisponível'}. ${textoMotivo(vigente.motivo)}`}</li>
        ) : null}
      </ul>
      {faltantes.length ? (
        <p className="visao-aviso m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
          {`A completar: ${faltantes.join(', ')}.`}
        </p>
      ) : null}
      {paciente.acompanhamento.length > 1 ? (
        <details>
          <summary>{`Histórico de mudanças (${paciente.acompanhamento.length})`}</summary>
          <ol className="m-0 grid min-w-0 gap-1 pl-5">
            {paciente.acompanhamento.map((mudanca, indice) => (
              // A posição é a identidade: o histórico não tem outra chave estável.
              // biome-ignore lint/suspicious/noArrayIndexKey: idem.
              <li key={indice}>
                {`${dataDeInstante(mudanca.criado_em) ?? 'Data indisponível'} · Situação: ${textoSituacao(mudanca)} · Responsável: ${descreverResponsavel(mudanca, equipe)} · ${textoMotivo(mudanca.motivo)}`}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

function TelaEdicaoPaciente({
  pacienteId,
  servico,
  acessoPerdido,
  alteracaoPendente,
}: {
  pacienteId: string;
  servico: ServicoEdicaoPaciente;
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
}) {
  const [descartada, definirDescartada] = useState(false);
  const [fase, definirFase] = useState<'inicial' | 'carregando' | 'pronta' | 'erro'>('inicial');
  const [paciente, definirPaciente] = useState<PacienteEdicao | null>(null);
  const [erroCarregamento, definirErroCarregamento] = useState<unknown>(null);
  const [bloqueada, definirBloqueada] = useState(true);
  /* Separado de `bloqueada` de propósito. Quando a conferência termina e a versão do
     cadastro pode ter mudado, a pessoa precisa conseguir COPIAR o que digitou — os campos
     voltam a ser alcançáveis — mas NÃO pode sobrescrever o cadastro com um rascunho preso
     a uma versão vencida. A versão imperativa fazia isso reabilitando só o `fieldset` e
     deixando `bloqueada` ligada; a migração colapsou os dois num sinalizador só e o envio
     voltou a ficar disponível. */
  const [camposLiberados, definirCamposLiberados] = useState(false);
  const [recuperarVisivel, definirRecuperarVisivel] = useState(true);
  const [recuperarTexto, definirRecuperarTexto] = useState('Conferir o que foi salvo');
  const [recuperarOcupado, definirRecuperarOcupado] = useState(false);
  const [status, definirStatus] = useState('Confira o cadastro para começar a editar.');
  const [conferenciaTexto, definirConferenciaTexto] = useState<string | null>(null);
  const [recarregarVisivel, definirRecarregarVisivel] = useState(false);
  const [enviando, definirEnviando] = useState(false);
  const [equipeEstado, definirEquipeEstado] = useState<EquipeEstado>(() =>
    servico.listarResponsaveis ? { tipo: 'carregando' } : { tipo: 'indisponivel' },
  );

  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;
  const avisarPendente = useRef(alteracaoPendente);
  avisarPendente.current = alteracaoPendente;

  const recuperandoRef = useRef(false);
  const reconhecidoRef = useRef(false);
  const recuperarModoRef = useRef<'inicial' | 'reconhecer'>('inicial');
  const resultadoPendenteRef = useRef<ResultadoPendenteEdicao | null>(null);
  const formJaDesenhadoRef = useRef(false);
  const equipeNaMontagemRef = useRef<readonly ResponsavelOpcao[]>([]);

  const ciclo = servico.ciclo;

  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    flushSync(() => definirDescartada(true));
    avisarPerda.current(erro);
    return true;
  }, []);

  /** Carrega (ou recarrega) o cadastro. Só chamada a partir de um clique — nunca na
   *  montagem, que abre parada à espera da conferência. */
  const consultar = useCallback(() => {
    flushSync(() => definirFase('carregando'));
    servicoAtual.current.consultarPaciente(pacienteId).then(
      (dados) => {
        equipeNaMontagemRef.current = equipeEstado.tipo === 'pronta' ? equipeEstado.opcoes : [];
        formJaDesenhadoRef.current = true;
        flushSync(() => {
          definirPaciente(dados);
          definirFase('pronta');
        });
      },
      (erro: unknown) => {
        if (descartarAcesso(erro)) return;
        flushSync(() => {
          definirErroCarregamento(erro);
          definirFase('erro');
        });
      },
    );
  }, [pacienteId, descartarAcesso, equipeEstado]);

  // Carrega a equipe uma vez, independente da conferência — a situação segue editável
  // mesmo que isto falhe ou ainda esteja em curso.
  useEffect(() => {
    if (!servicoAtual.current.listarResponsaveis) return;
    let valida = true;
    servicoAtual.current.listarResponsaveis().then(
      (opcoes) => {
        if (!valida) return;
        flushSync(() => definirEquipeEstado({ tipo: 'pronta', opcoes }));
      },
      (erro: unknown) => {
        if (!valida || descartarAcesso(erro)) return;
        flushSync(() => definirEquipeEstado({ tipo: 'falhou' }));
      },
    );
    return () => {
      valida = false;
    };
  }, [descartarAcesso]);

  const concluirRecuperacao = useCallback(() => {
    flushSync(() => definirRecuperarVisivel(false));
    if (!formJaDesenhadoRef.current) {
      flushSync(() => definirBloqueada(false));
      consultar();
      return;
    }
    /* Versão pode ter mudado; permite copiar o rascunho, SEM permitir sobrescrita.
       `bloqueada` fica ligada de propósito: é ela que trava o envio. Só os campos voltam
       a ser alcançáveis, por `camposLiberados`. A migração tinha escrito
       `definirBloqueada(false)` aqui, o que reabria o envio e contradizia o próprio
       comentário — o rascunho preso a uma versão vencida podia sobrescrever o cadastro. */
    flushSync(() => {
      definirStatus('Conferência concluída. Copie seu rascunho antes de recarregar o cadastro.');
      definirCamposLiberados(true);
      definirRecarregarVisivel(true);
    });
  }, [consultar]);

  const reconhecerPendente = useCallback(() => {
    if (recuperandoRef.current) return;
    recuperandoRef.current = true;
    definirRecuperarOcupado(true);
    definirStatus('Concluindo conferência…');
    (async () => {
      if (!reconhecidoRef.current) {
        await ciclo.reconhecer();
        reconhecidoRef.current = true;
      }
      await ciclo.consultar();
      ciclo.liberar();
      reconhecidoRef.current = false;
      recuperarModoRef.current = 'inicial';
      concluirRecuperacao();
    })()
      .catch((erro: unknown) => {
        if (descartarAcesso(erro)) return;
        flushSync(() => definirStatus('Não foi possível concluir. Tente novamente.'));
        definirRecuperarOcupado(false);
      })
      .finally(() => {
        recuperandoRef.current = false;
      });
  }, [ciclo, descartarAcesso, concluirRecuperacao]);

  const recuperarSituacao = useCallback(() => {
    if (recuperandoRef.current) return;
    recuperandoRef.current = true;
    definirRecuperarOcupado(true);
    definirStatus('Conferindo o cadastro…');
    (async () => {
      if (reconhecidoRef.current) {
        await ciclo.consultar();
        ciclo.liberar();
      } else {
        let situacao = await ciclo.consultar();
        if (!situacao.resultado_pendente) {
          if (
            situacao.reserva &&
            !(await confirmar({
              titulo: 'Encerrar a tentativa em andamento?',
              detalhe:
                'A tentativa pode estar aberta em outra aba. Encerrá-la afeta todas as abas desta pessoa.',
              acao: 'Encerrar a tentativa',
              cancelar: 'Deixar como está',
            }))
          )
            throw new Error('Encerramento não confirmado');
          await ciclo.encerrar();
          situacao = await ciclo.consultar();
        }
        if (situacao.resultado_pendente) {
          const resultado = situacao.resultado_pendente;
          if (resultado.paciente_id.toLowerCase() !== pacienteId.toLowerCase()) {
            flushSync(() => {
              definirStatus(
                'A edição aguardando resposta é de outro paciente. Abra o cadastro dele para conferir antes de continuar aqui.',
              );
              definirRecuperarVisivel(false);
            });
            return;
          }
          // A conferência usa leitura autorizada atual e não substitui o rascunho.
          const atual = await servicoAtual.current.consultarPaciente(pacienteId);
          if (atual.id.toLowerCase() !== pacienteId.toLowerCase())
            throw new Error('Cadastro divergente');
          const vigenteAtual = atual.acompanhamento[0];
          const equipeAtual = equipeEstado.tipo === 'pronta' ? equipeEstado.opcoes : [];
          resultadoPendenteRef.current = resultado;
          flushSync(() => {
            definirConferenciaTexto(
              `Cadastro atual: ${atual.nome}; nome de preferência: ${atual.nome_preferencia ?? 'não informado'}; nascimento: ${atual.data_nascimento ?? 'não informado'}; situação: ${textoSituacao(vigenteAtual)}; responsável: ${vigenteAtual ? descreverResponsavel(vigenteAtual, equipeAtual) : 'a completar'}; versão: ${atual.versao}.`,
            );
            definirStatus(
              resultado.resultado === 'confirmada'
                ? `As alterações enviadas antes foram salvas (versão ${resultado.versao}). ${atual.versao !== resultado.versao ? 'O cadastro já está em outra versão: alguém pode ter alterado depois.' : 'Confira os dados acima.'}`
                : 'As alterações enviadas antes não foram salvas.',
            );
            definirRecuperarTexto('Entendi, liberar a edição');
          });
          recuperarModoRef.current = 'reconhecer';
          definirRecuperarOcupado(false);
          return;
        }
        ciclo.liberar();
      }
      concluirRecuperacao();
    })()
      .catch((erro: unknown) => {
        if (descartarAcesso(erro)) return;
        flushSync(() => definirStatus('Não foi possível confirmar a situação. Tente novamente.'));
        definirRecuperarOcupado(false);
      })
      .finally(() => {
        recuperandoRef.current = false;
      });
  }, [ciclo, pacienteId, descartarAcesso, concluirRecuperacao, equipeEstado]);

  async function enviar(entrada: AtualizarPaciente) {
    definirEnviando(true);
    definirBloqueada(true);
    definirStatus('Salvando cadastro…');
    try {
      await servicoAtual.current.ciclo.editar(pacienteId, entrada);
      flushSync(() =>
        definirStatus('Alterações enviadas. Confira o resultado antes de continuar.'),
      );
    } catch (erro) {
      if (descartarAcesso(erro)) return;
      flushSync(() =>
        definirStatus(
          erro instanceof FalhaApi && !resultadoIncerto(erro)
            ? `${mensagemFalha(erro)} Nada foi alterado; confira o cadastro e tente de novo. O rascunho permanece nesta tela.`
            : 'Não deu para saber se as alterações foram salvas. Confira o cadastro antes de editar de novo; o rascunho permanece nesta tela.',
        ),
      );
    } finally {
      flushSync(() => definirEnviando(false));
    }
    flushSync(() => {
      recuperarModoRef.current = 'inicial';
      definirRecuperarTexto('Conferir o que foi salvo');
      definirRecuperarVisivel(true);
      definirRecuperarOcupado(false);
    });
  }

  function enviarEdicao(formulario: HTMLFormElement) {
    if (!paciente || bloqueada || recuperandoRef.current) return;
    const vigente = paciente.acompanhamento[0];
    const nome = valorDe(formulario, 'nome');
    const preferencia = valorDe(formulario, 'preferencia');
    const nascimento = valorDe(formulario, 'nascimento');
    const situacaoValor = valorDe(formulario, 'situacao');
    const responsavelValor = valorDe(formulario, 'responsavel');
    const motivoValor = valorDe(formulario, 'motivo');
    const dados = {
      ...(nome.trim() !== paciente.nome ? { nome } : {}),
      ...(preferencia.trim() !== (paciente.nome_preferencia ?? '')
        ? { nome_preferencia: preferencia.trim() || null }
        : {}),
      ...(nascimento !== (paciente.data_nascimento ?? '')
        ? { data_nascimento: nascimento || null }
        : {}),
      ...(situacaoValor && situacaoValor !== (vigente?.situacao ?? '')
        ? { situacao: situacaoValor }
        : {}),
      ...(responsavelValor && responsavelValor !== (vigente?.responsavel_id ?? '')
        ? { responsavel_id: responsavelValor }
        : {}),
      versao_esperada: paciente.versao,
      motivo: motivoValor,
    };
    const validado = atualizarPacienteSchema.safeParse(dados);
    if (!validado.success) {
      definirStatus(
        'Altere ao menos um campo e informe nome válido, data válida e motivo da alteração.',
      );
      return;
    }
    avisarPendente.current(true);
    void enviar(validado.data);
  }

  if (descartada) return null;

  const vigente = paciente?.acompanhamento[0];
  const ativos = equipeEstado.tipo === 'pronta' ? equipeEstado.opcoes.filter((o) => o.ativo) : [];
  const primeiraOpcaoResponsavel = ativos.length
    ? 'Selecione…'
    : equipeEstado.tipo === 'pronta'
      ? 'Nenhuma pessoa ativa na equipe'
      : equipeEstado.tipo === 'falhou'
        ? 'Não foi possível listar a equipe; recarregue o cadastro'
        : equipeEstado.tipo === 'indisponivel'
          ? 'Listagem da equipe indisponível para este perfil'
          : 'Carregando equipe…';
  const responsavelDesabilitado = ativos.length === 0;
  const responsavelValorInicial = ativos.some((o) => o.usuario_id === vigente?.responsavel_id)
    ? (vigente?.responsavel_id ?? '')
    : '';

  return (
    <div className="grid min-w-0 gap-6">
      {fase === 'pronta' && paciente ? (
        <Superficie>
          <ResumoCaso
            paciente={paciente}
            equipe={equipeEstado.tipo === 'pronta' ? equipeEstado.opcoes : []}
          />
        </Superficie>
      ) : null}

      {fase === 'carregando' ? (
        <div className="grid min-w-0 gap-4">
          <Esqueleto ocupado />
          {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as provas procuram. */}
          <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
            Carregando cadastro…
          </p>
        </div>
      ) : null}

      {fase === 'erro' ? (
        <div className="grid min-w-0 justify-items-start gap-4">
          {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
          <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
            {mensagemFalha(erroCarregamento)}
          </p>
          <Botao peso="secundario" aoAtivar={() => consultar()}>
            Tentar novamente
          </Botao>
        </div>
      ) : null}

      {fase === 'pronta' && paciente ? (
        <Superficie>
          <Formulario aoEnviar={enviarEdicao} noValidate className="grid min-w-0 gap-4">
            <fieldset
              disabled={bloqueada && !camposLiberados}
              className="m-0 grid min-w-0 gap-4 border-0 p-0"
            >
              <legend className="px-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
                Editar paciente
              </legend>
              <Campo
                id="edicao-nome"
                name="nome"
                rotulo="Nome"
                required
                maxLength={200}
                defaultValue={paciente.nome}
                onInput={() => avisarPendente.current(true)}
              />
              <Campo
                id="edicao-preferencia"
                name="preferencia"
                rotulo="Nome de preferência"
                maxLength={200}
                defaultValue={paciente.nome_preferencia ?? ''}
                onInput={() => avisarPendente.current(true)}
              />
              <CampoData
                id="edicao-nascimento"
                name="nascimento"
                rotulo="Data de nascimento"
                defaultValue={paciente.data_nascimento ?? ''}
                onInput={() => avisarPendente.current(true)}
              />
              <SelecaoAprimorada
                id="edicao-situacao"
                name="situacao"
                rotulo="Situação do caso"
                defaultValue={vigente?.situacao ?? ''}
                onChange={() => avisarPendente.current(true)}
              >
                <option value="">Selecione…</option>
                {Object.entries(rotulosSituacao).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </SelecaoAprimorada>
              <SelecaoAprimorada
                key={equipeEstado.tipo}
                id="edicao-responsavel"
                name="responsavel"
                rotulo="Responsável (case manager)"
                disabled={responsavelDesabilitado}
                defaultValue={responsavelValorInicial}
                onChange={() => avisarPendente.current(true)}
              >
                <option value="">{primeiraOpcaoResponsavel}</option>
                {ativos.map((opcao) => (
                  <option key={opcao.usuario_id} value={opcao.usuario_id}>
                    {opcao.rotulo}
                  </option>
                ))}
              </SelecaoAprimorada>
              <AreaTexto
                id="edicao-motivo"
                name="motivo"
                rotulo="Motivo da alteração"
                required
                maxLength={500}
                onInput={() => avisarPendente.current(true)}
              />
            </fieldset>
            <div>
              <Botao
                peso="principal"
                tipo="submit"
                disabled={bloqueada}
                aria-busy={enviando || undefined}
              >
                Salvar alterações
              </Botao>
            </div>
            {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
            <p
              role="status"
              className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave empty:hidden"
            >
              {status}
            </p>
          </Formulario>
        </Superficie>
      ) : null}

      {recuperarVisivel ? (
        <Botao
          peso="secundario"
          disabled={recuperarOcupado}
          aria-busy={recuperarOcupado || undefined}
          aoAtivar={() =>
            recuperarModoRef.current === 'reconhecer' ? reconhecerPendente() : recuperarSituacao()
          }
        >
          {recuperarTexto}
        </Botao>
      ) : null}
      {fase === 'inicial' ? (
        // biome-ignore lint/a11y/useSemanticElements: idem.
        <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
          {status}
        </p>
      ) : null}

      {conferenciaTexto ? (
        <p data-conferencia-edicao="" className="m-0 max-w-[68ch] text-(length:--texto-1)">
          {conferenciaTexto}
        </p>
      ) : null}

      {recarregarVisivel ? (
        <Botao
          peso="secundario"
          aoAtivar={() => {
            avisarPendente.current(false);
            flushSync(() => {
              definirRecarregarVisivel(false);
              definirBloqueada(false);
            });
            consultar();
          }}
        >
          Recarregar cadastro
        </Botao>
      ) : null}

      {/* Composta, não montada: antes um efeito montava a seção numa `div` de ref — raiz
          alheia dentro de um contêiner do React, a direção que produziu os `NotFoundError`
          da migração. Sai e volta com a fase, como o efeito fazia; a equipe é a da carga. */}
      {servico.substituicao !== undefined && fase === 'pronta' ? (
        <div className="ficha-subsecao min-w-0">
          <SecaoSubstituicaoCaseManager
            key={pacienteId}
            servico={servico.substituicao}
            pacienteId={pacienteId}
            equipe={equipeNaMontagemRef.current}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Interface preparada para integração segura; não ativa rota nem autoriza acesso. */
export function montarEdicaoPaciente(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoEdicaoPaciente,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  return ilha(
    raiz,
    <TelaEdicaoPaciente
      pacienteId={pacienteId}
      servico={servico}
      acessoPerdido={acessoPerdido}
      alteracaoPendente={alteracaoPendente}
    />,
  );
}
