/* Equipe com acesso ao caso: concessão, lista de vínculos e revogação (VIS-018).
 *
 * Até 27/11/2026 era um módulo imperativo inteiro dentro deste `.tsx`: DOM criado à mão,
 * treze `if (!ativa)`, botões do kit `web/ui/` e a lista e a revogação hospedadas como
 * ilhas. Agora é um componente só, e lista e revogação são compostas na mesma árvore.
 *
 * **O protocolo foi transportado, não reescrito** — é a jornada de concessão e revogação
 * que ativa o valor. As variáveis da versão imperativa continuam num objeto mutável (`e`),
 * lidas e escritas nos mesmos pontos e na mesma ordem; onde ela escrevia no DOM, esta
 * escreve em `e` e chama `repintar()`, que confirma a árvore de forma síncrona. A
 * conferência da barreira (consultar → confirmar o encerramento de reserva aberta →
 * encerrar → reconhecer resultado pendente, conferindo paciente e identidade → atualizar
 * vínculos → liberar) não mudou de passo nem de mensagem. A autorização segue no servidor.
 *
 * O seletor e o motivo da concessão continuam NÃO controlados — o DOM é dono do valor — e
 * `change`/`input` são ouvidos no próprio nó: as provas disparam os eventos sem `bubbles`,
 * e a liberação do botão precisa valer na linha seguinte. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { type ClienteFFCM, mensagemFalha } from './api.js';
import { criarCicloAcesso } from './ciclo-acesso.js';
import { Botao } from './componentes/ui/botao.js';
import { type Coluna, Lista, valor } from './componentes/ui/lista.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { confirmar } from './confirmacao.js';
import './estilos/tema.css';
import { PainelRevogacao, type PunhoInterno } from './revogacao-vinculo.js';

/** Um vínculo profissional como a lista o apresenta. `nome` ausente significa que a
 *  identificação não veio na página consultada — e nesse caso o identificador NÃO entra
 *  no lugar dela: expor o `usuario_id` seria vazar identidade que a consulta não trouxe. */
type VinculoExibido = {
  id: string;
  usuarioId: string;
  revogado: boolean;
  versao: number;
};

type EstadoVinculos = {
  itens: readonly VinculoExibido[];
  nomes: ReadonlyMap<string, string>;
  consultando: boolean;
};

/** Vitrine mínima: a máquina de estado desta tela mora fora do ciclo de render (em `e`), e
 *  a lista precisa apenas ser avisada quando o que ela mostra muda. */
function criarVitrine(inicial: EstadoVinculos) {
  let estado = inicial;
  const ouvintes = new Set<() => void>();
  return {
    ler: () => estado,
    definir(mudanca: Partial<EstadoVinculos>) {
      estado = { ...estado, ...mudanca };
      for (const ouvinte of ouvintes) ouvinte();
    },
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
  };
}

const NOME_INDISPONIVEL = 'Identificação indisponível nesta página';

/** A lista de profissionais com acesso ao caso: linhas sob um cabeçalho, as mesmas
 *  colunas em todas elas (VIS-016). Era uma pilha de `<li>` com três informações coladas
 *  por ` · `, em que nada alinhava com nada e comparar duas linhas exigia reler as duas.
 *
 *  A falha de uma linha degrada só aquela linha: a barreira é da camada de lista, e foi
 *  escrita por causa de 24/11/2026, quando um registro inválido apagou a equipe inteira. */
function ListaVinculos({
  vitrine,
  aoSelecionar,
}: {
  vitrine: ReturnType<typeof criarVitrine>;
  aoSelecionar: (vinculo: VinculoExibido, nome: string) => void;
}) {
  const estado = useSyncExternalStore(vitrine.assinar, vitrine.ler);
  const nomeDe = (vinculo: VinculoExibido) =>
    estado.nomes.get(vinculo.usuarioId.toLowerCase()) ?? NOME_INDISPONIVEL;
  const colunas: ReadonlyArray<Coluna<VinculoExibido>> = [
    // Sem truncamento: numa ação de revogação, quem decide precisa ler o identificador
    // inteiro, não um prefixo cortado por reticência.
    { titulo: 'Profissional', celula: nomeDe, semTruncamento: true },
    {
      titulo: 'Situação do vínculo',
      celula: (vinculo) => (
        <MarcaEstado tom={vinculo.revogado ? 'contorno' : 'padrao'}>
          {vinculo.revogado ? 'Revogado' : 'Ativo'}
        </MarcaEstado>
      ),
    },
    { titulo: 'Versão', celula: (vinculo) => valor(vinculo.versao), secundaria: true },
    {
      // Não é coluna secundária de propósito: revogar acesso é a única ação da lista, e
      // escondê-la no celular tiraria do telefone a capacidade que o desktop tem.
      // Sem truncamento: o botão tem ~220px e era cortado pela célula, sobrando só
      // "Selecionar" em vez de "Selecionar para revogação" — achado C1.
      titulo: 'Alteração',
      semTruncamento: true,
      celula: (vinculo) => {
        if (vinculo.revogado) return null;
        const nome = estado.nomes.get(vinculo.usuarioId.toLowerCase());
        return (
          <Botao
            peso="discreto"
            marca="selecionar-revogacao"
            disabled={nome === undefined}
            rotuloLeitura={`Selecionar para revogação: ${nomeDe(vinculo)}`}
            aoAtivar={() => {
              if (nome !== undefined) aoSelecionar(vinculo, nome);
            }}
          >
            Selecionar para revogação
          </Botao>
        );
      },
    },
  ];
  return (
    <Lista
      itens={estado.itens}
      colunas={colunas}
      chave={(vinculo) => vinculo.id}
      rotulo="Profissionais com acesso ao caso"
      carregando={estado.consultando}
    />
  );
}

type Opcao = { valor: string; rotulo: string };

/** O estado do protocolo, com os nomes da versão imperativa. */
type Estado = {
  ativa: boolean;
  pendenciaConcessao: boolean;
  pendenciaRevogacao: boolean;
  consulta: number;
  cursores: (string | undefined)[];
  pagina: number;
  proximo: string | null;
  status: string;
  opcoes: Opcao[];
  vazio: string;
  selecaoDesabilitada: boolean;
  selecaoOcupada: boolean;
  anteriorDesabilitado: boolean;
  seguinteDesabilitado: boolean;
  paginacaoOculta: boolean;
  tentarOculto: boolean;
  explicacao: string;
  recuperarDesabilitado: boolean;
  recuperando: boolean;
  concederDesabilitado: boolean;
  concedendo: boolean;
  liberado: boolean;
  verificando: boolean;
  estadoVinculos: string;
  maisOculto: boolean;
  maisDesabilitado: boolean;
  tentarVinculosOculto: boolean;
  tentarVinculosDesabilitado: boolean;
  revogacaoVisivel: boolean;
};

function estadoInicial(): Estado {
  return {
    ativa: true,
    pendenciaConcessao: false,
    pendenciaRevogacao: false,
    consulta: 0,
    cursores: [undefined],
    pagina: 0,
    proximo: null,
    status: '',
    opcoes: [],
    vazio: '',
    selecaoDesabilitada: false,
    selecaoOcupada: false,
    anteriorDesabilitado: false,
    seguinteDesabilitado: false,
    // Paginação só aparece quando há mais de uma página: botões soltos sobre lista
    // vazia davam a impressão de tela quebrada.
    paginacaoOculta: true,
    tentarOculto: false,
    explicacao: 'Conferindo se há alguma concessão aguardando resposta…',
    recuperarDesabilitado: false,
    recuperando: false,
    concederDesabilitado: true,
    concedendo: false,
    liberado: false,
    verificando: false,
    estadoVinculos: '',
    maisOculto: true,
    maisDesabilitado: false,
    tentarVinculosOculto: true,
    tentarVinculosDesabilitado: false,
    revogacaoVisivel: false,
  };
}

/** O indicador de ação em curso; a mensagem acessível continua no texto da tela. Substitui
 *  `iniciarAcao` (`web/esqueleto.ts`), que mutava o nó do botão por fora do React. */
function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

export function TelaSelecaoProfissional({
  pacienteId,
  api,
  acessoPerdido,
  alteracaoPendente,
}: {
  pacienteId: string;
  api: ClienteFFCM;
  acessoPerdido: (erro: unknown) => boolean;
  alteracaoPendente: (pendente: boolean) => void;
}) {
  const estado = useRef<Estado | null>(null);
  estado.current ??= estadoInicial();
  const e = estado.current;
  const [, marcar] = useState(0);
  const selecaoRef = useRef<HTMLSelectElement>(null);
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const punhoRevogacao = useRef<PunhoInterno | null>(null);
  const controlador = useRef<AbortController | null>(null);
  controlador.current ??= new AbortController();
  /** O protocolo inteiro vive aqui, criado uma vez por montagem: as funções guardam
   *  referência umas às outras como na versão imperativa. */
  const protocolo = useRef<ReturnType<typeof criarProtocolo> | null>(null);

  function criarProtocolo() {
    const repintar = () => {
      if (e.ativa) flushSync(() => marcar((n) => n + 1));
    };
    const informarPendencia = () => alteracaoPendente(e.pendenciaConcessao || e.pendenciaRevogacao);
    const valorSelecionado = () => selecaoRef.current?.value ?? '';

    const ciclo = criarCicloAcesso({
      identidadeAtual: () => api.identidadeAtual(),
      consultar: () => api.consultarBarreiraAcesso(),
      reservar: async (entrada) => (await api.reservarBarreiraAcesso(entrada)).estado,
      criar: ({ entrada, paciente_id, chave, reserva_id, geracao_reserva }) =>
        api.criarAcessoPaciente(paciente_id, entrada, chave, { reserva_id, geracao_reserva }),
      revogar: ({ paciente_id, acesso_id, entrada, chave, reserva_id, geracao_reserva }) =>
        api.revogarAcessoPaciente(paciente_id, acesso_id, entrada, chave, {
          reserva_id,
          geracao_reserva,
        }),
      encerrar: async (entrada) => (await api.encerrarBarreiraAcesso(entrada)).estado,
      reconhecer: async (entrada) => (await api.reconhecerBarreiraAcesso(entrada)).estado,
    });

    const revogacao = {
      async selecionar(acesso: { id: string; versao: number; nome: string }) {
        // Só revela o painel quando a seleção foi mesmo aceita: recusar o descarte do
        // motivo digitado tem de deixar a tela exatamente como estava.
        if (await punhoRevogacao.current?.selecionar(acesso)) {
          e.revogacaoVisivel = true;
          repintar();
        }
      },
      invalidarSelecao: () => punhoRevogacao.current?.invalidarSelecao(),
      reconciliar: () => punhoRevogacao.current?.reconciliar(),
    };

    const vitrine = criarVitrine({ itens: [], nomes: new Map(), consultando: true });
    const nomesProfissionais = new Map<string, string>();
    let identificacoesCompletas = false;
    let geracaoIdentificacoes = 0;
    let consultaIdentificacoes: Promise<void> | undefined;
    const vinculosExibidos: VinculoExibido[] = [];
    const atualizarIdentificacoes = () => {
      vitrine.definir({ itens: [...vinculosExibidos], nomes: new Map(nomesProfissionais) });
    };
    let cursorVinculos: string | undefined;
    let consultaVinculos: Promise<boolean> | undefined;
    let atualizacaoPendente = false;
    let geracaoAtualizacao = 0;

    async function identificarProfissionais(): Promise<void> {
      if (identificacoesCompletas || !e.ativa) return;
      if (consultaIdentificacoes) return consultaIdentificacoes;
      const geracao = geracaoIdentificacoes;
      const executar = async () => {
        const nomes = new Map<string, string[]>();
        const vistos = new Set<string>();
        let cursor: string | undefined;
        do {
          const pagina = await api.listarProfissionais(cursor);
          if (!e.ativa) return;
          for (const item of pagina.itens) {
            if (item.perfil !== 'profissional' || !item.usuario_id) continue;
            const id = item.usuario_id.toLowerCase();
            const emails = nomes.get(id) ?? [];
            emails.push(item.email);
            nomes.set(id, emails);
          }
          cursor = pagina.proximo_cursor ?? undefined;
          if (cursor && vistos.has(cursor)) throw new Error('Cursor repetido');
          if (cursor) vistos.add(cursor);
        } while (cursor);
        if (geracao !== geracaoIdentificacoes) return;
        nomesProfissionais.clear();
        for (const [id, emails] of nomes) {
          const email = emails[0];
          if (emails.length === 1 && email) nomesProfissionais.set(id, email);
        }
        identificacoesCompletas = true;
        atualizarIdentificacoes();
      };
      const pendente = executar();
      consultaIdentificacoes = pendente;
      try {
        await pendente;
      } finally {
        if (consultaIdentificacoes === pendente) consultaIdentificacoes = undefined;
      }
    }

    async function atualizarVinculos(): Promise<void> {
      revogacao.invalidarSelecao();
      atualizacaoPendente = true;
      geracaoAtualizacao++;
      geracaoIdentificacoes++;
      identificacoesCompletas = false;
      nomesProfissionais.clear();
      atualizarIdentificacoes();
      if (consultaIdentificacoes) await consultaIdentificacoes.catch(() => {});
      if (consultaVinculos) await consultaVinculos;
      if (!e.ativa) return;
      if (!(await carregarVinculos())) throw new Error('Consulta de vínculos indisponível');
    }

    function carregarVinculos(): Promise<boolean> {
      if (consultaVinculos) return consultaVinculos;
      const executar = async (): Promise<boolean> => {
        e.maisDesabilitado = e.tentarVinculosDesabilitado = true;
        e.estadoVinculos = 'Consultando vínculos…';
        repintar();
        vitrine.definir({ consultando: true });
        const reiniciar = atualizacaoPendente;
        const geracao = geracaoAtualizacao;
        try {
          const paginaAtual = await api.listarVinculosProfissionais(
            pacienteId,
            reiniciar ? undefined : cursorVinculos,
          );
          if (!e.ativa) return false;
          if (reiniciar) {
            if (geracao === geracaoAtualizacao) atualizacaoPendente = false;
            vinculosExibidos.length = 0;
          }
          for (const item of paginaAtual.itens)
            vinculosExibidos.push({
              id: item.id,
              usuarioId: item.usuario_id,
              revogado: item.revogado,
              versao: item.versao,
            });
          atualizarIdentificacoes();
          if (paginaAtual.itens.length)
            void identificarProfissionais().catch((erro) => {
              if (e.ativa && !acessoPerdido(erro)) {
                e.estadoVinculos =
                  'Não foi possível identificar profissionais. Tente atualizar a lista.';
                repintar();
              }
            });
          cursorVinculos = paginaAtual.proximo_cursor ?? undefined;
          e.maisOculto = !cursorVinculos;
          e.tentarVinculosOculto = true;
          e.estadoVinculos = vinculosExibidos.length
            ? 'Vínculos consultados.'
            : 'Nenhum vínculo profissional encontrado.';
          return true;
        } catch (erro) {
          if (e.ativa && !acessoPerdido(erro)) {
            e.estadoVinculos = mensagemFalha(erro);
            e.tentarVinculosOculto = false;
          }
          return false;
        } finally {
          vitrine.definir({ consultando: false });
          e.maisDesabilitado = e.tentarVinculosDesabilitado = false;
          repintar();
        }
      };
      const pendente = executar();
      consultaVinculos = pendente;
      void pendente.finally(() => {
        if (consultaVinculos === pendente) consultaVinculos = undefined;
      });
      return pendente;
    }

    async function verificarPendente() {
      const sinal = controlador.current?.signal;
      if (e.verificando) return;
      e.verificando = true;
      e.liberado = false;
      e.concederDesabilitado = e.recuperarDesabilitado = true;
      e.recuperando = true;
      e.explicacao = 'Conferindo acesso…';
      repintar();
      try {
        let estadoBarreira = await ciclo.consultar();
        if (!e.ativa) return;
        if (!estadoBarreira.resultado_pendente) {
          if (
            estadoBarreira.reserva &&
            !(await confirmar(
              {
                titulo: 'Encerrar a tentativa em andamento?',
                detalhe:
                  'A tentativa pode estar aberta em outra aba. Encerrá-la afeta todas as abas desta pessoa.',
                acao: 'Encerrar a tentativa',
                cancelar: 'Deixar como está',
              },
              sinal,
            ))
          )
            throw new Error('Encerramento não confirmado');
          await ciclo.encerrar();
          if (!e.ativa) return;
          estadoBarreira = await ciclo.consultar();
          if (!e.ativa) return;
        }
        if (estadoBarreira.resultado_pendente) {
          const pendente = estadoBarreira.resultado_pendente;
          if (pendente.resultado === 'confirmada') {
            if (pendente.paciente_id.toLowerCase() !== pacienteId.toLowerCase())
              throw new Error('Outro paciente');
            let cursor: string | undefined;
            let encontrado: { usuario_id: string; revogado: boolean } | undefined;
            const vistos = new Set<string>();
            do {
              const pagina = await api.listarVinculosProfissionais(pacienteId, cursor);
              if (!e.ativa) return;
              encontrado ??= pagina.itens.find(
                (item) => item.id.toLowerCase() === pendente.acesso_id.toLowerCase(),
              );
              cursor = pagina.proximo_cursor ?? undefined;
              if (cursor && vistos.has(cursor)) throw new Error('Cursor repetido');
              if (cursor) vistos.add(cursor);
            } while (!encontrado && cursor);
            await identificarProfissionais();
            if (!e.ativa) return;
            const nome = encontrado && nomesProfissionais.get(encontrado.usuario_id.toLowerCase());
            if (
              !encontrado ||
              !nome ||
              !(await confirmar(
                {
                  titulo: `${pendente.acao === 'revogar' ? 'Revogação' : 'Concessão'} anterior para ${nome}: ${encontrado.revogado ? 'revogada' : 'ativa'}. Confere?`,
                  detalhe:
                    'Confirmar encerra a conferência e libera novas alterações de vínculo. Cancelar mantém tudo como está.',
                  acao: 'Confere, pode seguir',
                  cancelar: 'Não confere',
                },
                sinal,
              ))
            )
              throw new Error('Confirmação necessária');
          }
          await ciclo.reconhecer();
          if (!e.ativa) return;
          await ciclo.consultar();
          if (!e.ativa) return;
        }
        await atualizarVinculos();
        if (!e.ativa) return;
        ciclo.liberar();
        if (!e.ativa) return;
        e.liberado = true;
        revogacao.reconciliar();
        e.explicacao = 'Tudo conferido. Você já pode conceder acesso.';
        e.concederDesabilitado = !valorSelecionado();
      } catch (erro) {
        if (!e.ativa || acessoPerdido(erro)) return;
        e.explicacao =
          'Não foi possível concluir a conferência. Confira o paciente correspondente e tente de novo.';
      } finally {
        e.recuperando = false;
        e.verificando = false;
        if (e.ativa) e.recuperarDesabilitado = false;
        repintar();
      }
    }

    function mudarSelecao() {
      e.concederDesabilitado = !e.liberado || !valorSelecionado();
      repintar();
    }

    function mudarMotivo() {
      e.pendenciaConcessao = (motivoRef.current?.value ?? '').trim().length > 0;
      informarPendencia();
    }

    function conceder() {
      const motivo = motivoRef.current;
      if (!e.liberado || !valorSelecionado() || !motivo?.value.trim()) return;
      e.liberado = false;
      e.concederDesabilitado = true;
      e.concedendo = true;
      e.explicacao = 'Enviando concessão…';
      repintar();
      const usuario = valorSelecionado();
      const razao = motivo.value;
      void ciclo
        .criar(pacienteId, { usuario_id: usuario, motivo: razao })
        .then(() => {
          if (!e.ativa) return;
          if (motivo.value === razao) {
            motivo.value = '';
            e.pendenciaConcessao = false;
            informarPendencia();
          }
          e.explicacao = 'Concessão enviada. Confira o resultado antes de continuar.';
          void atualizarVinculos().catch(() => {});
        })
        .catch((erro) => {
          if (e.ativa && !acessoPerdido(erro))
            e.explicacao =
              'Não deu para saber se a concessão foi registrada. Confira antes de tentar de novo.';
        })
        .finally(() => {
          e.concedendo = false;
          repintar();
        });
    }

    async function revogar(acessoId: string, dados: { versao_esperada: number; motivo: string }) {
      if (!e.liberado) throw new Error('Acesso bloqueado');
      e.liberado = false;
      e.concederDesabilitado = true;
      repintar();
      return ciclo.revogar(pacienteId, acessoId, dados);
    }

    function pendenteRevogacao(pendente: boolean) {
      e.pendenciaRevogacao = pendente;
      informarPendencia();
    }

    async function carregar(): Promise<void> {
      const atual = ++e.consulta;
      e.status = 'Consultando equipe…';
      e.selecaoDesabilitada = e.anteriorDesabilitado = e.seguinteDesabilitado = true;
      e.selecaoOcupada = true;
      e.tentarOculto = true;
      e.opcoes = [];
      e.vazio = '';
      repintar();
      try {
        const resultado = await api.listarProfissionais(e.cursores[e.pagina]);
        if (!e.ativa || atual !== e.consulta) return;
        e.proximo = resultado.proximo_cursor;
        const profissionais = resultado.itens.filter(
          (item) =>
            item.perfil === 'profissional' &&
            item.estado === 'vinculada' &&
            item.ativo === true &&
            item.usuario_id !== null,
        );
        const unicaPagina = e.pagina === 0 && !e.proximo;
        e.vazio = profissionais.length
          ? 'Selecione um profissional'
          : unicaPagina
            ? 'Nenhum profissional elegível'
            : 'Nenhum profissional elegível nesta página';
        e.opcoes = profissionais.map((item) => ({
          valor: item.usuario_id ?? '',
          rotulo: item.email,
        }));
        e.selecaoDesabilitada = profissionais.length === 0;
        e.anteriorDesabilitado = e.pagina === 0;
        e.seguinteDesabilitado = !e.proximo;
        e.paginacaoOculta = unicaPagina;
        const paginaAtual = unicaPagina ? '' : `Página ${e.pagina + 1}. `;
        e.status = profissionais.length
          ? `${paginaAtual}Selecione o profissional que vai acompanhar o caso.`
          : `${paginaAtual}Nenhum profissional da equipe pode receber acesso agora.`;
      } catch (erro) {
        if (!e.ativa || atual !== e.consulta || acessoPerdido(erro)) return;
        e.status = mensagemFalha(erro);
        e.tentarOculto = false;
        e.anteriorDesabilitado = e.pagina === 0;
      } finally {
        if (atual === e.consulta) e.selecaoOcupada = false;
        repintar();
      }
    }

    function paginaAnterior() {
      if (e.pagina > 0) {
        e.pagina -= 1;
        void carregar();
      }
    }

    function paginaSeguinte() {
      if (e.proximo) {
        e.cursores = e.cursores.slice(0, e.pagina + 1);
        e.cursores.push(e.proximo);
        e.pagina += 1;
        void carregar();
      }
    }

    function selecionarParaRevogacao(vinculo: VinculoExibido, nome: string) {
      // A guarda é a mesma de antes: sem a conferência liberada, nenhuma alteração de
      // vínculo entra. A lista oferece o controle; quem autoriza é o servidor.
      if (e.liberado) void revogacao.selecionar({ id: vinculo.id, versao: vinculo.versao, nome });
    }

    function iniciar() {
      // A ordem é a da versão imperativa: conferência, vínculos, equipe.
      void verificarPendente();
      void carregarVinculos();
      void carregar();
    }

    return {
      vitrine,
      iniciar,
      verificarPendente,
      mudarSelecao,
      mudarMotivo,
      conceder,
      revogar,
      pendenteRevogacao,
      atualizarVinculos,
      carregarVinculos,
      carregar,
      paginaAnterior,
      paginaSeguinte,
      selecionarParaRevogacao,
    };
  }

  protocolo.current ??= criarProtocolo();
  const p = protocolo.current;

  /* `change` e `input` ouvidos no próprio nó: as provas disparam sem `bubbles`, e a
     liberação do botão de conceder precisa valer na linha seguinte. */
  /* Em captura no invólucro, e não no nó: o seletor nasce de novo a cada consulta da equipe
     (a chave zera a escolha, como a versão imperativa fazia ao repovoá-lo), e a captura
     alcança também evento sem `bubbles`. */
  const envolucroRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const envolucro = envolucroRef.current;
    if (!envolucro) return;
    const aoMudar = (evento: Event) => {
      if (evento.target === selecaoRef.current) p.mudarSelecao();
    };
    const aoDigitar = (evento: Event) => {
      if (evento.target === motivoRef.current) p.mudarMotivo();
    };
    envolucro.addEventListener('change', aoMudar, true);
    envolucro.addEventListener('input', aoDigitar, true);
    return () => {
      envolucro.removeEventListener('change', aoMudar, true);
      envolucro.removeEventListener('input', aoDigitar, true);
    };
  }, [p]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a abertura do protocolo é só na montagem.
  useEffect(() => {
    const sinal = controlador.current;
    // Fora do efeito: o protocolo confirma a árvore com `flushSync`, que não roda dentro
    // de um ciclo de vida do React.
    queueMicrotask(() => {
      if (e.ativa) p.iniciar();
    });
    return () => {
      e.ativa = false;
      e.consulta += 1;
      sinal?.abort();
    };
  }, []);

  return (
    <div ref={envolucroRef} className="contents">
      <section>
        <h3>Vínculos profissionais</h3>
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o que a tela já tinha. */}
        <p role="status">{e.estadoVinculos}</p>
        <div>
          <ListaVinculos vitrine={p.vitrine} aoSelecionar={p.selecionarParaRevogacao} />
        </div>
        <Botao
          hidden={e.maisOculto}
          disabled={e.maisDesabilitado}
          aoAtivar={() => void p.carregarVinculos()}
        >
          Carregar mais vínculos
        </Botao>
        <Botao
          hidden={e.tentarVinculosOculto}
          disabled={e.tentarVinculosDesabilitado}
          aoAtivar={() => void p.carregarVinculos()}
        >
          Tentar consultar vínculos novamente
        </Botao>
        <p>Conclua a conferência acima antes de alterar vínculos.</p>
      </section>
      {/* biome-ignore lint/a11y/useSemanticElements: idem; `.feedback` vem de `web/styles.css`. */}
      <p className="feedback" role="status" aria-live="polite">
        {e.status}
      </p>
      <SelecaoAprimorada
        key={e.consulta}
        ref={selecaoRef}
        id="profissional-selecionado"
        rotulo="Profissional"
        disabled={e.selecaoDesabilitada}
        aria-busy={e.selecaoOcupada || undefined}
        defaultValue=""
      >
        {e.vazio ? <option value="">{e.vazio}</option> : null}
        {e.opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </SelecaoAprimorada>
      <Botao
        hidden={e.paginacaoOculta}
        disabled={e.anteriorDesabilitado}
        aoAtivar={p.paginaAnterior}
      >
        Página anterior
      </Botao>
      <Botao
        hidden={e.paginacaoOculta}
        disabled={e.seguinteDesabilitado}
        aoAtivar={p.paginaSeguinte}
      >
        Próxima página
      </Botao>
      <Botao hidden={e.tentarOculto} aoAtivar={() => void p.carregar()}>
        Tentar novamente
      </Botao>
      <label>
        Motivo da concessão
        <textarea ref={motivoRef} required maxLength={4000} />
      </label>
      <p>{e.explicacao}</p>
      <Botao
        peso="principal"
        disabled={e.concederDesabilitado}
        aria-busy={e.concedendo || undefined}
        aoAtivar={p.conceder}
      >
        Conceder acesso
        {e.concedendo ? <Indicador /> : null}
      </Botao>
      <Botao
        disabled={e.recuperarDesabilitado}
        aria-busy={e.recuperando || undefined}
        aoAtivar={() => void p.verificarPendente()}
      >
        Conferir novamente
        {e.recuperando ? <Indicador /> : null}
      </Botao>
      <section hidden={!e.revogacaoVisivel}>
        <PainelRevogacao
          revogar={p.revogar}
          atualizarVinculos={p.atualizarVinculos}
          acessoPerdido={acessoPerdido}
          alteracaoPendente={p.pendenteRevogacao}
          sinal={controlador.current.signal}
          registrar={(recebido) => {
            punhoRevogacao.current = recebido;
          }}
        />
      </section>
    </div>
  );
}
