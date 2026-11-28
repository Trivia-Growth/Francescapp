/** Execução do cuidado no turno, em React (VIS-018).
 *
 *  **O protocolo de barreira foi transportado, não reescrito.** As variáveis que a versão
 *  imperativa guardava em closure — barreira, reconciliação, reconhecimento, conferência,
 *  tentativa, editor aberto, rascunho — continuam num único objeto mutável (`e`), lidas e
 *  escritas nos mesmos pontos e na mesma ordem. Onde ela chamava `controles()` para
 *  repintar os botões, esta chama `repintar()`, que confirma a árvore de forma síncrona:
 *  as travas são parte do protocolo, e entre a decisão e o DOM não pode caber um clique.
 *  O que mudou é só quem desenha: os botões, a lista e os painéis derivam de `e` no render.
 *
 *  A sequência continua: ao montar, reconciliar a época anterior → consultar o catálogo.
 *  Novo registro só com barreira consultada, sem recibo pendente, sem reconciliação ou
 *  reconhecimento em curso e sem tentativa aberta. Gravar exige versão e identificador
 *  devolvidos iguais aos enviados; o recibo é reconhecido logo depois. Resultado incerto
 *  mantém a tentativa e exige conferir; conflito derruba a barreira e exige conferir.
 *
 *  **As superfícies filhas são compostas, não montadas.** Fotos, conversão, relatórios,
 *  ficha do plantão, gestão e localização são componentes desta mesma árvore. Nenhum
 *  `montar*` imperativo é chamado de dentro dela — essa direção (`.tsx` hospedando DOM
 *  escrito à mão num contêiner que o React também governa) foi a que produziu os
 *  `NotFoundError` desta migração. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { EstadoBarreiraExecucaoTurno } from '../packages/contracts/src/turno-execucao-barreira.ts';
import {
  type CatalogoTurnoPublico,
  type ConteudoExecucaoPublico,
  type RegistroExecucaoPublico,
  gravarExecucaoPublicaSchema,
} from '../packages/contracts/src/turno-execucao-http.ts';
import type { Turno } from '../packages/contracts/src/turno.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';
import { Botao } from './componentes/ui/botao.js';
import { confirmarDescarte } from './confirmacao.js';
import './estilos/tema.css';
import { FichaPlantao, type ServicosFichaPlantao } from './ficha-plantao.js';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import { Formulario, valorDe } from './telas/formulario.js';
import { AnexosOcorrencia } from './turno-execucao-arquivos.js';
import {
  CampoTurno,
  EstadoTurno,
  SelecaoTurno,
  dataLocalTurno,
  instanteTurno,
} from './turno-execucao-campos.js';
import { type PortasConversaoOcorrencia, TelaConversao } from './turno-execucao-conversao.js';
import {
  type ClasseExecucao,
  EditorExecucao,
  type PunhoEditor,
  rotulosClasse,
} from './turno-execucao-editor.js';
import { GestaoExecucaoTurno } from './turno-execucao-gestao.js';
import { RegistroTurno } from './turno-execucao-leitura.js';
import { LocalizacaoCoordenacao } from './turno-execucao-localizacao-coordenacao.js';
import { RelatoriosTurno } from './turno-execucao-relatorios.js';

type Opcoes = {
  usuarioId: string;
  administrador: boolean;
  acessoPerdido(erro: unknown): void;
  alteracaoPendente(valor: boolean): void;
  conversao?: PortasConversaoOcorrencia;
  /** FR-073/FR-080. Serviços da ficha de plantão, criados sob demanda para que a seção
   * não faça pedido nenhum enquanto o profissional não a abrir. */
  criarServicosFicha?(): ServicosFichaPlantao;
};
type Consulta = Parameters<ServicoTurnoExecucao['consultar']>[0];
type Cursor = Awaited<ReturnType<ServicoTurnoExecucao['consultar']>>['proximo_cursor'];
type PaginaPrescricoes = Awaited<ReturnType<ServicoTurnoExecucao['prescricoesVigentes']>>;
type Linha = { chave: string; registro: RegistroExecucaoPublico; acoes: boolean };
type Historico = {
  registro: RegistroExecucaoPublico;
  versoes: RegistroExecucaoPublico[];
  proximo: Cursor;
};

/** O estado do protocolo, com os nomes da versão imperativa. */
type Estado = {
  ativa: boolean;
  ocupada: boolean;
  barreira: EstadoBarreiraExecucaoTurno | null;
  reconciliacao: { comando_id: string; chave: string } | null;
  reconhecimento: { epoca: number; recibo_id: string; chave: string } | null;
  conferencia: boolean;
  rascunho: boolean;
  catalogo: CatalogoTurnoPublico[];
  catalogoPronto: boolean;
  prescricoes: RegistroExecucaoPublico[];
  paginaPrescricoes: PaginaPrescricoes | null;
  consulta: Consulta | null;
  proximo: Cursor;
  editor: { classe: ClasseExecucao; atual?: RegistroExecucaoPublico; geracao: number } | null;
  tentativa: {
    entrada: Parameters<ServicoTurnoExecucao['gravar']>[0];
    chave: string;
    consultada: boolean;
  } | null;
  linhas: Linha[];
  serie: number;
  vazio: boolean;
  consultandoSerie: boolean;
  historico: Historico | null;
  status: string;
};

const classeGrupo = 'm-0 grid min-w-0 gap-2 rounded-cartao border border-borda p-4';
const classeLegenda = 'px-1 text-(length:--texto-2) font-semibold';
const classeResumo = 'cursor-pointer text-(length:--texto-2) font-semibold';

function estadoInicial(): Estado {
  return {
    ativa: true,
    ocupada: false,
    barreira: null,
    reconciliacao: null,
    reconhecimento: null,
    conferencia: false,
    rascunho: false,
    catalogo: [],
    catalogoPronto: false,
    prescricoes: [],
    paginaPrescricoes: null,
    consulta: null,
    proximo: null,
    editor: null,
    tentativa: null,
    linhas: [],
    serie: 0,
    vazio: false,
    consultandoSerie: false,
    historico: null,
    status: 'Consultando catálogo da execução…',
  };
}

function periodoDeHoje() {
  const de = new Date();
  de.setHours(0, 0, 0, 0);
  const ate = new Date(de);
  ate.setDate(ate.getDate() + 1);
  return { inicio: dataLocalTurno(de.toISOString()), fim: dataLocalTurno(ate.toISOString()) };
}

export function ExecucaoTurno({
  pacienteId,
  turno,
  servico,
  opcoes,
}: {
  pacienteId: string;
  turno: Turno | null;
  servico: ServicoTurnoExecucao;
  opcoes: Opcoes;
}) {
  const estado = useRef<Estado | null>(null);
  estado.current ??= estadoInicial();
  const e = estado.current;
  const [, marcar] = useState(0);
  const [perdida, definirPerdida] = useState(false);
  const [periodo] = useState(periodoDeHoje);
  const [abertas, definirAbertas] = useState({ ficha: false, gestao: false, localizacao: false });
  const editorPunho = useRef<PunhoEditor | null>(null);
  const opcoesRef = useRef(opcoes);
  opcoesRef.current = opcoes;

  /** O equivalente de `controles()`: as travas derivam de `e` e chegam ao DOM agora. */
  const repintar = useCallback(() => {
    if (estado.current?.ativa) flushSync(() => marcar((n) => n + 1));
  }, []);

  /* As pendências das superfícies filhas, por origem. Uma função estável por origem: as
     filhas guardam a referência, e trocar a cada render não mudaria nada além de ruído. */
  const pendencias = useRef(new Map<string, boolean>());
  const avisos = useRef(new Map<string, (valor: boolean) => void>());
  const pendente = useCallback(
    (origem: string) => {
      let aviso = avisos.current.get(origem);
      if (!aviso) {
        aviso = (valor: boolean) => {
          pendencias.current.set(origem, valor);
          opcoesRef.current.alteracaoPendente([...pendencias.current.values()].some(Boolean));
          repintar();
        };
        avisos.current.set(origem, aviso);
      }
      return aviso;
    },
    [repintar],
  );
  const leituraPendente = () =>
    [...pendencias.current].some(
      ([origem, valor]) =>
        valor && (origem.startsWith('anexo-') || origem.startsWith('conversao-')),
    );

  const servicosFicha = useRef<ServicosFichaPlantao | null>(null);
  const obterServicosFicha = useCallback(() => {
    const criar = opcoesRef.current.criarServicosFicha;
    if (!criar) return null;
    servicosFicha.current ??= criar();
    return servicosFicha.current;
  }, []);
  const fichaDoPlantao = useCallback(
    async (turnoId: string) => {
      const servicos = obterServicosFicha();
      if (!servicos) return null;
      const resultado = await servicos.ficha.consultar(pacienteId, turnoId);
      return { ficha: resultado.ficha, pendencias: resultado.pendencias };
    },
    [obterServicosFicha, pacienteId],
  );
  const acessoPerdidoFilho = useCallback(
    (erro: unknown) => opcoesRef.current.acessoPerdido(erro),
    [],
  );

  function falha(erro: unknown) {
    if (!e.ativa) return;
    if (
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      e.ativa = false;
      e.barreira = null;
      e.reconciliacao = null;
      e.reconhecimento = null;
      e.tentativa = null;
      e.editor = null;
      e.linhas = [];
      flushSync(() => definirPerdida(true));
      opcoesRef.current.acessoPerdido(erro);
      return;
    }
    e.status = mensagemFalha(erro);
  }

  async function carregarSerie(entrada: Consulta, acrescentar = false) {
    if (!e.ativa || e.ocupada) return;
    if (leituraPendente()) {
      e.status = 'Conclua ou recupere o anexo ou a conversão antes de trocar a consulta.';
      repintar();
      return;
    }
    if (!acrescentar) {
      e.consulta = null;
      e.proximo = null;
      e.linhas = [];
      e.vazio = false;
      e.historico = null;
      e.serie += 1;
    }
    e.ocupada = true;
    // A série sumia e voltava; a lista passa a dizer que está em consulta.
    e.consultandoSerie = true;
    e.status = 'Consultando série de registros…';
    repintar();
    try {
      const pagina = await servico.consultar(entrada);
      if (!e.ativa) return;
      if (!acrescentar) {
        e.linhas = [];
        e.historico = null;
      }
      e.vazio = !pagina.itens.length && !acrescentar;
      e.linhas = [
        ...e.linhas,
        ...pagina.itens.map((registro) => ({
          chave: `${e.serie}-${registro.registro_id}-${registro.versao}`,
          registro,
          acoes: true,
        })),
      ];
      e.consulta = { ...entrada };
      e.proximo = pagina.proximo_cursor;
      e.status = e.proximo
        ? 'Página consultada. Há mais registros no período.'
        : 'Consulta da série concluída.';
    } catch (erro) {
      falha(erro);
    } finally {
      e.consultandoSerie = false;
      e.ocupada = false;
      repintar();
    }
  }

  async function historico(registro: RegistroExecucaoPublico, cursor?: NonNullable<Cursor>) {
    if (!e.ativa || e.ocupada) return;
    e.ocupada = true;
    if (!cursor) e.historico = { registro, versoes: [], proximo: null };
    repintar();
    try {
      const pagina = await servico.consultar({
        classe: registro.conteudo.classe,
        historico: true,
        registro_id: registro.registro_id,
        inicio: '1970-01-01T00:00:00Z',
        fim: new Date(Date.now() + 86_400_000).toISOString(),
        limite: 25,
        ...(cursor
          ? { cursor_instante: cursor.instante, cursor_id: cursor.id, cursor_versao: cursor.versao }
          : {}),
      });
      if (!e.ativa) return;
      const anterior = e.historico?.registro === registro ? e.historico.versoes : [];
      e.historico = {
        registro,
        versoes: [...anterior, ...pagina.itens],
        proximo: pagina.proximo_cursor,
      };
      e.status = 'Histórico consultado; versões e executor original preservados.';
    } catch (erro) {
      falha(erro);
    } finally {
      e.ocupada = false;
      repintar();
    }
  }

  async function carregarPrescricoes(cursor?: NonNullable<PaginaPrescricoes['proximo_cursor']>) {
    const pagina = await servico.prescricoesVigentes({
      ...(e.paginaPrescricoes ? { vigente_em: e.paginaPrescricoes.vigente_em } : {}),
      ...(cursor
        ? { cursor_instante: cursor.instante, cursor_id: cursor.id, cursor_versao: cursor.versao }
        : {}),
      limite: 25,
    });
    if (!e.ativa) return;
    e.prescricoes = cursor ? [...e.prescricoes, ...pagina.itens] : pagina.itens;
    e.paginaPrescricoes = pagina;
  }

  async function abrirEditor(classe: ClasseExecucao, atual?: RegistroExecucaoPublico) {
    if (
      !e.ativa ||
      e.ocupada ||
      e.editor ||
      e.tentativa ||
      !e.barreira ||
      e.barreira.resultado_pendente ||
      e.reconciliacao ||
      e.reconhecimento
    )
      return;
    if (!atual && classe !== 'prescricao' && (!turno || turno.situacao !== 'aberto')) {
      e.status = 'Abra seu turno neste caso antes de registrar ou retificar execução.';
      repintar();
      return;
    }
    e.ocupada = true;
    repintar();
    try {
      if (classe === 'administracao') {
        e.paginaPrescricoes = null;
        await carregarPrescricoes();
        if (!e.ativa) return;
      }
      e.editor = { classe, ...(atual ? { atual } : {}), geracao: 0 };
      e.status = 'Preencha o registro. Valores clínicos não são preenchidos pelo histórico.';
    } catch (erro) {
      falha(erro);
    } finally {
      e.ocupada = false;
      repintar();
      if (e.ativa) editorPunho.current?.focar();
    }
  }

  function maisPrescricoes() {
    const proxima = e.paginaPrescricoes?.proximo_cursor;
    if (!proxima) return;
    if (e.rascunho || e.tentativa) {
      e.status =
        'Cancele esta edição antes de ampliar a lista de prescrições; seus campos foram preservados.';
      repintar();
      return;
    }
    if (e.ocupada) return;
    e.ocupada = true;
    repintar();
    void carregarPrescricoes(proxima)
      .then(() => {
        // O editor nasce de novo com a lista ampliada, como a versão imperativa fazia.
        if (e.ativa && e.editor) e.editor = { ...e.editor, geracao: e.editor.geracao + 1 };
      })
      .catch(falha)
      .finally(() => {
        e.ocupada = false;
        repintar();
      });
  }

  function cancelar() {
    void (async () => {
      if (e.tentativa || e.ocupada) return;
      if (e.rascunho && !(await confirmarDescarte('as alterações não enviadas deste registro')))
        return;
      if (e.tentativa || e.ocupada) return;
      e.editor = null;
      e.rascunho = false;
      pendente('editor')(false);
      repintar();
    })();
  }

  function enviarDoEditor(conteudo: ConteudoExecucaoPublico, motivo?: string) {
    if (e.tentativa || e.ocupada) return;
    const atual = e.editor?.atual;
    const validado = gravarExecucaoPublicaSchema.safeParse({
      epoca: e.barreira?.epoca,
      registro_id: atual?.registro_id ?? crypto.randomUUID(),
      versao_esperada: atual?.versao ?? 0,
      conteudo,
      ...(motivo ? { motivo } : {}),
    });
    if (!validado.success) {
      editorPunho.current?.informar('Confira os dados e o motivo obrigatório.');
      return;
    }
    e.tentativa = {
      entrada: structuredClone(validado.data),
      chave: crypto.randomUUID(),
      consultada: false,
    };
    pendente('editor')(true);
    void enviar();
  }

  async function enviar() {
    const tentativa = e.tentativa;
    if (!e.ativa || e.ocupada || !tentativa) return;
    e.ocupada = true;
    tentativa.consultada = false;
    repintar();
    editorPunho.current?.informar('Aguardando confirmação do servidor…');
    try {
      const registro = await servico.gravar(tentativa.entrada, tentativa.chave);
      if (!e.ativa) return;
      if (
        registro.registro_id !== tentativa.entrada.registro_id ||
        registro.versao !== tentativa.entrada.versao_esperada + 1
      )
        throw new FalhaApi('pendencia_externa', 0, true);
      e.reconhecimento = {
        epoca: tentativa.entrada.epoca,
        recibo_id: registro.recibo_id,
        chave: crypto.randomUUID(),
      };
      const reconhecido = await servico.reconhecer(
        { epoca: e.reconhecimento.epoca, recibo_id: e.reconhecimento.recibo_id },
        e.reconhecimento.chave,
      );
      if (e.ativa) {
        e.barreira = reconhecido;
        e.reconhecimento = null;
      }
      if (!e.ativa) return;
      e.tentativa = null;
      e.editor = null;
      e.rascunho = false;
      pendente('editor')(false);
      e.status =
        registro.conteudo.classe === 'ocorrencia'
          ? 'Ocorrência confirmada. Consulte a série de ocorrências para anexar foto ou converter em ação.'
          : 'Registro confirmado; original e histórico preservados.';
      e.linhas = [
        { chave: `confirmado-${registro.registro_id}-${registro.versao}`, registro, acoes: false },
        ...e.linhas,
      ];
      e.vazio = false;
    } catch (erro) {
      const exigeConferencia =
        erro instanceof FalhaApi &&
        (erro.codigo === 'conflito' ||
          erro.codigo === 'conflito_versao' ||
          erro.codigo === 'conflito_idempotencia');
      if (exigeConferencia) e.barreira = null;
      if (!resultadoIncerto(erro) && !exigeConferencia) e.tentativa = null;
      falha(erro);
      if (e.ativa)
        editorPunho.current?.informar(
          e.tentativa
            ? 'Resultado incerto. Confira os envios: a época anterior será encerrada antes de liberar qualquer nova intenção.'
            : 'Envio recusado. Corrija os campos ou consulte a versão atual antes de uma nova revisão.',
        );
    } finally {
      e.ocupada = false;
      repintar();
    }
  }

  async function reconciliarEnvios() {
    if (
      !e.ativa ||
      e.ocupada ||
      (e.editor !== null && e.tentativa === null && e.reconhecimento === null)
    )
      return;
    e.ocupada = true;
    e.conferencia = false;
    repintar();
    e.reconciliacao ??= { comando_id: crypto.randomUUID(), chave: crypto.randomUUID() };
    try {
      const novo = await servico.reconciliar(
        { comando_id: e.reconciliacao.comando_id },
        e.reconciliacao.chave,
      );
      if (!e.ativa) return;
      e.barreira = novo;
      e.reconciliacao = null;
      e.reconhecimento = null;
      e.tentativa = null;
      e.editor = null;
      e.rascunho = false;
      const recibo = novo.resultado_pendente;
      if (recibo) {
        e.status = `Envio confirmado pendente de conferência: ${rotulosClasse[recibo.classe]}, versão ${recibo.versao}, ${new Date(recibo.registrado_em).toLocaleString('pt-BR')}. ${recibo.paciente_id === pacienteId ? 'Caso atual.' : 'Outro caso; somente metadados próprios disponíveis aqui.'}`;
        if (recibo.paciente_id === pacienteId) {
          try {
            const pagina = await servico.consultar({
              classe: recibo.classe,
              registro_id: recibo.registro_id,
              historico: true,
              limite: 100,
            });
            if (!e.ativa) return;
            const registro = pagina.itens.find((item) => item.versao === recibo.versao);
            if (registro)
              e.linhas = [
                {
                  chave: `recibo-${registro.registro_id}-${registro.versao}`,
                  registro,
                  acoes: false,
                },
                ...e.linhas,
              ];
          } catch {
            if (e.ativa)
              e.status +=
                ' Conteúdo indisponível com o acesso atual; recibo operacional preservado.';
          }
        }
        e.conferencia = true;
        pendente('editor')(true);
      } else {
        pendente('editor')(false);
        e.status =
          'Conferência concluída. Envios da época anterior foram encerrados; nenhum resultado pendente. Novo registro exige uma ação explícita.';
      }
    } catch (erro) {
      e.barreira = null;
      falha(erro);
      pendente('editor')(true);
    } finally {
      e.ocupada = false;
      repintar();
    }
  }

  async function reconhecerEnvio() {
    if (!e.ativa || e.ocupada || !e.barreira?.resultado_pendente || !e.conferencia) return;
    e.reconhecimento ??= {
      epoca: e.barreira.epoca,
      recibo_id: e.barreira.resultado_pendente.recibo_id,
      chave: crypto.randomUUID(),
    };
    e.ocupada = true;
    repintar();
    try {
      const novo = await servico.reconhecer(
        { epoca: e.reconhecimento.epoca, recibo_id: e.reconhecimento.recibo_id },
        e.reconhecimento.chave,
      );
      if (!e.ativa) return;
      e.barreira = novo;
      e.reconhecimento = null;
      e.conferencia = false;
      pendente('editor')(false);
      e.status = 'Recibo reconhecido. Novo registro liberado.';
    } catch (erro) {
      falha(erro);
    } finally {
      e.ocupada = false;
      repintar();
    }
  }

  async function preparar() {
    if (!e.ativa || e.ocupada) return;
    e.ocupada = true;
    repintar();
    try {
      e.catalogo = await servico.catalogo();
      if (!e.ativa) return;
      e.catalogoPronto = true;
      if (e.barreira && !e.barreira.resultado_pendente)
        e.status = 'Catálogo consultado. Selecione um registro ou consulte a série por período.';
    } catch (erro) {
      falha(erro);
    } finally {
      e.ocupada = false;
      repintar();
    }
  }

  function consultarSerie(formulario: HTMLFormElement) {
    if (e.ocupada) return;
    try {
      const desde = instanteTurno(valorDe(formulario, 'inicio'));
      const ate = instanteTurno(valorDe(formulario, 'fim'));
      if (Date.parse(ate) <= Date.parse(desde)) throw new Error();
      void carregarSerie({
        classe: valorDe(formulario, 'classe') as ClasseExecucao,
        inicio: desde,
        fim: ate,
        limite: 25,
      });
    } catch {
      e.status = 'Confira as datas e o tipo de registro.';
      repintar();
    }
  }

  function proximaPagina() {
    const { consulta, proximo } = e;
    if (consulta && proximo)
      void carregarSerie(
        {
          ...consulta,
          cursor_instante: proximo.instante,
          cursor_id: proximo.id,
          cursor_versao: proximo.versao,
        },
        true,
      );
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: a abertura do protocolo é só na montagem.
  useEffect(() => {
    // Fora do efeito: o protocolo trava os controles com `flushSync`, que não roda dentro
    // de um ciclo de vida do React.
    queueMicrotask(() => {
      void reconciliarEnvios().then(() => {
        if (e.ativa) void preparar();
      });
    });
    return () => {
      e.ativa = false;
      e.barreira = null;
      e.reconciliacao = null;
      e.reconhecimento = null;
      e.tentativa = null;
      e.editor = null;
      e.catalogo = [];
      e.prescricoes = [];
      pendencias.current.clear();
    };
  }, []);

  const registrarPunho = useCallback((punho: PunhoEditor) => {
    editorPunho.current = punho;
  }, []);
  const aoMudarRascunho = useCallback(
    (valor: boolean) => {
      e.rascunho = valor;
      pendente('editor')(valor);
    },
    [e, pendente],
  );

  if (perdida) return null;

  const turnoAberto = turno?.situacao === 'aberto';
  const travaLeitura = e.ocupada || leituraPendente();
  const travaNovo =
    !e.barreira ||
    e.barreira.resultado_pendente !== null ||
    e.reconciliacao !== null ||
    e.reconhecimento !== null ||
    e.ocupada ||
    e.editor !== null ||
    e.tentativa !== null;
  const recibo = e.barreira?.resultado_pendente;
  const conversao = opcoes.conversao;

  return (
    <section className="turno-execucao">
      <h3>Execução do cuidado</h3>
      <p>
        {turnoAberto
          ? 'Seu turno está aberto. Cada registro preserva autor, instante do servidor e versões anteriores.'
          : 'Registros de execução exigem turno próprio aberto. Prescrições externas, séries e relatórios seguem suas permissões de acesso.'}
      </p>
      <EstadoTurno>{e.status}</EstadoTurno>
      <div>
        <p>
          {recibo
            ? `Recibo pendente: ${rotulosClasse[recibo.classe]}, versão ${recibo.versao}, ${new Date(recibo.registrado_em).toLocaleString('pt-BR')}. ${recibo.paciente_id === pacienteId ? 'Caso atual.' : 'Outro caso. Nenhum conteúdo clínico desse caso é carregado aqui.'} Confira antes de reconhecer.`
            : ''}
        </p>
        <Botao
          disabled={
            e.ocupada || (e.editor !== null && e.tentativa === null && e.reconhecimento === null)
          }
          aoAtivar={() => void reconciliarEnvios()}
        >
          Conferir envios antes de novo registro
        </Botao>
        <Botao
          hidden={!recibo}
          disabled={e.ocupada || !e.conferencia}
          aoAtivar={() => void reconhecerEnvio()}
        >
          Reconhecer recibo conferido e liberar novo registro
        </Botao>
      </div>
      <Botao
        disabled={e.ocupada || e.editor !== null || e.tentativa !== null}
        aoAtivar={() => {
          if (!e.editor && !e.tentativa) void preparar();
        }}
      >
        Atualizar catálogo
      </Botao>
      <div className="turno-execucao__acoes">
        {e.catalogoPronto
          ? (Object.keys(rotulosClasse) as ClasseExecucao[]).map((nome) => (
              <Botao
                key={nome}
                data-exige-turno={String(nome !== 'prescricao')}
                disabled={travaNovo || (nome !== 'prescricao' && !turnoAberto)}
                aoAtivar={() => void abrirEditor(nome)}
              >
                {`Registrar ${rotulosClasse[nome].toLocaleLowerCase('pt-BR')}`}
              </Botao>
            ))
          : null}
      </div>
      <div>
        {e.editor ? (
          <EditorExecucao
            key={`${e.editor.classe}-${e.editor.atual?.registro_id ?? 'novo'}-${e.editor.geracao}`}
            classe={e.editor.classe}
            contexto={{
              turnoId: turno?.turno_id ?? null,
              catalogo: e.catalogo,
              prescricoes: e.prescricoes,
              ...(e.editor.atual ? { atual: e.editor.atual } : {}),
            }}
            opcoes={{
              alteracaoPendente: aoMudarRascunho,
              cancelar,
              enviar: enviarDoEditor,
            }}
            registrar={registrarPunho}
            travado={
              e.ocupada ||
              e.tentativa !== null ||
              !e.barreira ||
              e.barreira.resultado_pendente !== null
            }
          />
        ) : null}
        {e.editor?.classe === 'administracao' && e.paginaPrescricoes?.proximo_cursor ? (
          <Botao aoAtivar={maisPrescricoes}>Mais prescrições vigentes</Botao>
        ) : null}
      </div>
      <Botao hidden={!e.editor || e.tentativa !== null} disabled={e.ocupada} aoAtivar={cancelar}>
        Descartar rascunho não enviado
      </Botao>
      <Botao
        hidden={e.tentativa === null}
        disabled={e.ocupada}
        aoAtivar={() => void reconciliarEnvios()}
      >
        Conferir registro enviado
      </Botao>
      <Formulario aoEnviar={consultarSerie}>
        <fieldset disabled={travaLeitura} className={classeGrupo}>
          <legend className={classeLegenda}>Consultar série de registros</legend>
          <SelecaoTurno
            rotulo="Tipo de registro"
            nome="classe"
            opcoes={Object.entries(rotulosClasse).map(([valor, rotulo]) => ({ valor, rotulo }))}
            valor="afericao"
          />
          <CampoTurno rotulo="Desde" nome="inicio" tipo="datetime-local" valor={periodo.inicio} />
          <CampoTurno rotulo="Até" nome="fim" tipo="datetime-local" valor={periodo.fim} />
          <div>
            <Botao tipo="submit" peso="principal">
              Consultar série
            </Botao>
          </div>
        </fieldset>
      </Formulario>
      <div aria-busy={e.consultandoSerie || undefined}>
        {e.vazio ? <p>Nenhum registro neste período.</p> : null}
        {e.linhas.map(({ chave, registro, acoes }) => (
          <div key={chave} className="grid min-w-0 gap-2">
            <RegistroTurno registro={registro} />
            {acoes ? (
              <>
                <div className="flex min-w-0 flex-wrap gap-3">
                  <Botao aoAtivar={() => void historico(registro)}>
                    Consultar versões anteriores
                  </Botao>
                  {registro.registrador_usuario_id === opcoes.usuarioId ||
                  registro.conteudo.classe === 'prescricao' ? (
                    <Botao aoAtivar={() => void abrirEditor(registro.conteudo.classe, registro)}>
                      Retificar preservando o original
                    </Botao>
                  ) : null}
                </div>
                {registro.conteudo.classe === 'ocorrencia' ? (
                  <>
                    <AnexosOcorrencia
                      registro={registro}
                      servico={servico}
                      podeAnexar={
                        turno?.situacao === 'aberto' &&
                        registro.turno_id === turno.turno_id &&
                        registro.registrador_usuario_id === opcoes.usuarioId
                      }
                      acessoPerdido={acessoPerdidoFilho}
                      alteracaoPendente={pendente(`anexo-${registro.registro_id}`)}
                    />
                    {conversao ? (
                      <TelaConversao
                        pacienteId={pacienteId}
                        origem={registro}
                        servico={servico}
                        portas={conversao}
                        opcoes={{
                          acessoPerdido: acessoPerdidoFilho,
                          alteracaoPendente: pendente(`conversao-${registro.registro_id}`),
                        }}
                      />
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        ))}
      </div>
      <Botao hidden={e.proximo === null} disabled={travaLeitura} aoAtivar={proximaPagina}>
        Próxima página de registros
      </Botao>
      <div>
        {e.historico ? (
          <section className="grid min-w-0 gap-2">
            <h4>Histórico preservado do registro</h4>
            {e.historico.versoes.map((versao) => (
              <RegistroTurno key={`${versao.registro_id}-${versao.versao}`} registro={versao} />
            ))}
            {!e.ocupada && !e.historico.versoes.length ? (
              <p>Nenhuma versão encontrada nesta consulta.</p>
            ) : null}
            {e.historico.proximo ? (
              <Botao
                aoAtivar={() => {
                  const atual = e.historico;
                  if (atual?.proximo) void historico(atual.registro, atual.proximo);
                }}
              >
                Mais versões do registro
              </Botao>
            ) : null}
          </section>
        ) : null}
      </div>
      <details>
        <summary className={classeResumo}>Relatórios e PDF</summary>
        <RelatoriosTurno
          servico={servico}
          turno={turno}
          acessoPerdido={acessoPerdidoFilho}
          alteracaoPendente={pendente('pdf')}
          {...(opcoes.criarServicosFicha ? { fichaDoPlantao } : {})}
        />
      </details>
      {opcoes.criarServicosFicha ? (
        <details
          onToggle={(evento) => {
            if (evento.currentTarget.open && !abertas.ficha && obterServicosFicha())
              definirAbertas((atual) => ({ ...atual, ficha: true }));
          }}
        >
          <summary className={classeResumo}>Ficha do plantão</summary>
          {abertas.ficha && servicosFicha.current ? (
            <FichaPlantao
              servicos={servicosFicha.current}
              pacienteId={pacienteId}
              turno={turnoAberto ? turno : null}
              acessoPerdido={acessoPerdidoFilho}
              alteracaoPendente={pendente('ficha-plantao')}
            />
          ) : null}
        </details>
      ) : null}
      <details
        onToggle={(evento) => {
          if (evento.currentTarget.open && !abertas.gestao)
            definirAbertas((atual) => ({ ...atual, gestao: true }));
        }}
      >
        <summary className={classeResumo}>Fundamento familiar, medicação e catálogo</summary>
        {abertas.gestao ? (
          <GestaoExecucaoTurno
            servico={servico}
            administrador={opcoes.administrador}
            acessoPerdido={acessoPerdidoFilho}
            alteracaoPendente={pendente('gestao')}
          />
        ) : null}
      </details>
      <details
        onToggle={(evento) => {
          if (evento.currentTarget.open && !abertas.localizacao)
            definirAbertas((atual) => ({ ...atual, localizacao: true }));
        }}
      >
        <summary className={classeResumo}>Localização declarada — coordenação</summary>
        {abertas.localizacao ? (
          <LocalizacaoCoordenacao
            servico={servico}
            acessoPerdido={acessoPerdidoFilho}
            alteracaoPendente={pendente('localizacao-restrita')}
          />
        ) : null}
      </details>
    </section>
  );
}
