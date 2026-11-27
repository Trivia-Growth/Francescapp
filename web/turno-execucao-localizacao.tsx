/** Consentimento e coleta de localização do turno, reconstruído em React sobre a ilha
 *  (`web/ponte/ilha.ts`). VIS-018.
 *
 *  O contrato exportado NÃO muda: `montarConsentimentoTurno(raiz, servico, opcoes)`
 *  devolve `{ coletar, registrar, desmontar }`. `turno-execucao-integracao.tsx` usa o mesmo
 *  controlador por `usarConsentimentoTurno` e compõe `ConsentimentoTurno` na sua árvore,
 *  passando esse mesmo objeto ao turno próprio.
 *
 *  **Por que a lógica mora fora do componente.** `coletar` e `registrar` são chamados por
 *  código imperativo na linha seguinte à montagem e no meio do protocolo de barreira —
 *  `turno-proprio.tsx` pede a coleta depois de o cuidado já estar confirmado. Um estado
 *  que vivesse dentro do React só estaria disponível depois do primeiro efeito, e a
 *  reconciliação clínica não pode esperar repintura. Então a máquina de consentimento é
 *  um objeto simples com assinantes, e a tela a lê por `useSyncExternalStore`. A ilha
 *  cuida do desenho; o protocolo continua síncrono.
 *
 *  **O que a migração entrega (VIS-012).** Os treze `if (!ativa)` da versão imperativa
 *  existiam porque cada um deles protegia uma escrita em DOM possivelmente já removido.
 *  Escrever situação agora é escrever estado, e estado de árvore desmontada não é
 *  defeito. Sobraram quatro, todos em travessia de fronteira: os dois avisos que saem
 *  para `opcoes` (reunidos em `fora()`) e as duas portas pelas quais o chamador
 *  imperativo entra aqui, `coletar` e `registrar`.
 *
 *  **O que NÃO mudou, de propósito.** Nunca há `watchPosition`: a consulta é pontual e só
 *  quando abrir ou encerrar foi confirmado. O consentimento é revalidado antes de cada
 *  coleta, e a revalidação que não responde dentro do prazo recusa a coleta em vez de
 *  buscar coordenada. `pendencia_externa` não derruba o acesso. E os textos de
 *  finalidade, audiência e retenção continuam literais no código, palavra por palavra —
 *  `web/textos-obrigatorios-nao-configuraveis.test.ts` trava isso, porque a retenção de
 *  90 dias é a promessa aceita, não um parâmetro de configuração. */
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Botao } from './componentes/ui/botao.js';
import { Superficie } from './componentes/ui/superficie.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import { EstadoTurno } from './turno-execucao-campos.js';

export const finalidadeLocalizacao =
  'Registrar localização declarada pelo aparelho na abertura e encerramento do turno.' as const;
export const audienciaLocalizacao = 'Administrador e case manager do caso.' as const;
export type DeclaracaoLocalizacao =
  | { latitude: number; longitude: number; precisao_metros: number }
  | {
      motivo_ausencia:
        | 'permissao_negada'
        | 'indisponivel'
        | 'falha'
        | 'consentimento_ausente'
        | 'consentimento_revogado';
    };
export type ConsentimentoLocalizacao = {
  versao: number;
  concedido: boolean;
  registrado_em?: string;
} | null;
export type PortasLocalizacaoTurno = {
  consultar(): Promise<ConsentimentoLocalizacao>;
  gravar(
    entrada: {
      versao_esperada: number;
      concedido: boolean;
      finalidade: typeof finalidadeLocalizacao;
      audiencia: typeof audienciaLocalizacao;
      retencao_dias: 90;
    },
    chave: string,
  ): Promise<unknown>;
  registrar(
    entrada: DeclaracaoLocalizacao & { turno_id: string; momento: 'abertura' | 'encerramento' },
    chave: string,
  ): Promise<unknown>;
};

/** Nunca usa watchPosition: consulta pontual somente quando abrir/encerrar é confirmado. */
export function coletarLocalizacaoTurno(
  consentimento: ConsentimentoLocalizacao,
  sinal: AbortSignal,
  geolocalizacao: Pick<Geolocation, 'getCurrentPosition'> | undefined = typeof navigator ===
  'undefined'
    ? undefined
    : navigator.geolocation,
): Promise<DeclaracaoLocalizacao> {
  if (!consentimento?.concedido)
    return Promise.resolve({
      motivo_ausencia: consentimento ? 'consentimento_revogado' : 'consentimento_ausente',
    });
  if (sinal.aborted) return Promise.resolve({ motivo_ausencia: 'falha' });
  if (!geolocalizacao) return Promise.resolve({ motivo_ausencia: 'indisponivel' });
  return new Promise((resolve) => {
    let encerrada = false;
    const concluir = (dados: DeclaracaoLocalizacao) => {
      if (encerrada) return;
      encerrada = true;
      clearTimeout(prazo);
      sinal.removeEventListener('abort', abortar);
      resolve(dados);
    };
    const prazo = setTimeout(() => concluir({ motivo_ausencia: 'falha' }), 5_000);
    const abortar = () => concluir({ motivo_ausencia: 'falha' });
    sinal.addEventListener('abort', abortar, { once: true });
    try {
      geolocalizacao.getCurrentPosition(
        (posicao) => {
          const { latitude, longitude, accuracy } = posicao.coords;
          if (
            sinal.aborted ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            !Number.isFinite(accuracy) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180 ||
            accuracy < 0
          )
            return concluir({ motivo_ausencia: 'falha' });
          concluir({ latitude, longitude, precisao_metros: accuracy });
        },
        (erro) =>
          concluir({
            motivo_ausencia:
              erro.code === 1 ? 'permissao_negada' : erro.code === 2 ? 'indisponivel' : 'falha',
          }),
        { enableHighAccuracy: false, maximumAge: 0, timeout: 5_000 },
      );
    } catch {
      concluir({ motivo_ausencia: 'falha' });
    }
  });
}

/** O que a tela mostra. É tudo derivado da máquina abaixo — nenhum destes campos é
 *  decidido no componente. */
type VistaConsentimento = {
  status: string;
  ocupada: boolean;
  podeConsentir: boolean;
  podeRevogar: boolean;
  temTentativa: boolean;
  temDeclaracaoPendente: boolean;
  encerrada: boolean;
};

function TelaConsentimento({
  ler,
  assinar,
  consentir,
  revogar,
  atualizar,
  repetirConfirmacao,
  conferirRegistro,
}: {
  ler(): VistaConsentimento;
  assinar(ouvinte: () => void): () => void;
  consentir(): void;
  revogar(): void;
  atualizar(): void;
  repetirConfirmacao(): void;
  conferirRegistro(): void;
}) {
  const vista = useSyncExternalStore(assinar, ler, ler);
  if (vista.encerrada) return null;
  return (
    <Superficie
      className="turno-execucao"
      titulo="Localização opcional"
      descricao={`${finalidadeLocalizacao} Audiência: ${audienciaLocalizacao} Retenção: 90 dias após o turno. Localização é declarada pelo aparelho, sem comprovar presença. Recusar ou revogar não impede o cuidado.`}
    >
      <div className="grid min-w-0 gap-4">
        <EstadoTurno>{vista.status}</EstadoTurno>
        <div className="flex min-w-0 flex-wrap gap-3">
          <Botao disabled={!vista.podeConsentir} aoAtivar={consentir}>
            Consentir localização
          </Botao>
          <Botao disabled={!vista.podeRevogar} aoAtivar={revogar}>
            Revogar consentimento
          </Botao>
          <Botao disabled={vista.ocupada} aoAtivar={atualizar}>
            Consultar consentimento
          </Botao>
          <Botao
            hidden={!vista.temTentativa}
            disabled={vista.ocupada}
            aoAtivar={repetirConfirmacao}
          >
            Repetir confirmação de consentimento
          </Botao>
          <Botao
            hidden={!vista.temDeclaracaoPendente}
            disabled={vista.ocupada}
            aoAtivar={conferirRegistro}
          >
            Conferir registro da localização
          </Botao>
        </div>
      </div>
    </Superficie>
  );
}

type OpcoesConsentimento = {
  acessoPerdido(erro: unknown): void;
  alteracaoPendente?(valor: boolean): void;
};

/** A máquina do consentimento, sem desenho. Quem compõe a tela usa `usarConsentimentoTurno`
 *  e `ConsentimentoTurno`; quem tem só uma raiz usa `montarConsentimentoTurno`. A coleta e
 *  o registro saem daqui para o turno próprio, que os chama na abertura e no encerramento. */
export function criarConsentimentoTurno(
  servico: PortasLocalizacaoTurno,
  opcoes: OpcoesConsentimento,
) {
  let ativa = true;
  let ocupada = false;
  let carregado = false;
  let consentimento: ConsentimentoLocalizacao = null;
  let status = 'Consultando consentimento de localização…';
  let tentativa: {
    entrada: Parameters<PortasLocalizacaoTurno['gravar']>[0];
    chave: string;
  } | null = null;
  let declaracaoPendente: {
    entrada: Parameters<PortasLocalizacaoTurno['registrar']>[0];
    chave: string;
  } | null = null;
  const controle = new AbortController();

  /* Instantâneo memorizado: `useSyncExternalStore` compara por identidade e entraria em
     laço se cada leitura devolvesse um objeto novo. Trocar só quando algo mudou é
     requisito da API, não otimização. */
  let vista: VistaConsentimento = montarVista();
  const ouvintes = new Set<() => void>();
  function montarVista(): VistaConsentimento {
    return {
      status,
      ocupada,
      podeConsentir: !ocupada && carregado && !consentimento?.concedido && !tentativa && ativa,
      podeRevogar: !ocupada && carregado && Boolean(consentimento?.concedido) && !tentativa,
      temTentativa: tentativa !== null,
      temDeclaracaoPendente: declaracaoPendente !== null,
      encerrada: !ativa,
    };
  }
  function anunciar() {
    const nova = montarVista();
    const mudou = (Object.keys(nova) as (keyof VistaConsentimento)[]).some(
      (chave) => nova[chave] !== vista[chave],
    );
    if (!mudou) return;
    vista = nova;
    for (const ouvinte of ouvintes) ouvinte();
  }

  /** Tudo que mora FORA da ilha continua precisando do sinal: desmontar a raiz React não
   *  alcança o chamador. É onde os `if (!ativa)` legitimamente sobrevivem (VIS-012). */
  const fora = <T,>(acao: () => T): T | undefined => (ativa ? acao() : undefined);

  const falha = (erro: unknown) => {
    if (
      ativa &&
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      ativa = false;
      controle.abort();
      anunciar();
      opcoes.acessoPerdido(erro);
      return;
    }
    status = `${mensagemFalha(erro)} O turno pode continuar sem localização.`;
    anunciar();
  };

  async function carregar() {
    if (ocupada || !ativa) return;
    ocupada = true;
    anunciar();
    try {
      const recebido = await servico.consultar();
      consentimento = recebido;
      carregado = true;
      status = recebido?.concedido
        ? 'Consentimento vigente. A coleta ocorrerá somente ao abrir ou encerrar turno.'
        : 'Sem consentimento vigente. O cuidado continua sem coleta de localização.';
      if (
        tentativa &&
        recebido &&
        recebido.versao === tentativa.entrada.versao_esperada + 1 &&
        recebido.concedido === tentativa.entrada.concedido
      ) {
        tentativa = null;
        fora(() => opcoes.alteracaoPendente?.(false));
      }
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      anunciar();
    }
  }

  async function salvar(concedido: boolean) {
    if (ocupada || tentativa || !carregado) return;
    tentativa = {
      entrada: {
        versao_esperada: consentimento?.versao ?? 0,
        concedido,
        finalidade: finalidadeLocalizacao,
        audiencia: audienciaLocalizacao,
        retencao_dias: 90,
      },
      chave: crypto.randomUUID(),
    };
    fora(() => opcoes.alteracaoPendente?.(true));
    anunciar();
    await enviar();
  }

  async function enviar() {
    if (ocupada || !tentativa || !ativa) return;
    ocupada = true;
    status = 'Registrando decisão de consentimento…';
    anunciar();
    try {
      await servico.gravar(tentativa.entrada, tentativa.chave);
      tentativa = null;
      fora(() => opcoes.alteracaoPendente?.(false));
    } catch (erro) {
      // Resultado incerto preserva a mesma tentativa e a mesma chave: repetir com chave
      // nova criaria uma segunda decisão de consentimento.
      if (!resultadoIncerto(erro)) tentativa = null;
      falha(erro);
    } finally {
      ocupada = false;
      anunciar();
      if (!tentativa) await carregar();
    }
  }

  async function enviarDeclaracao() {
    if (!declaracaoPendente || ocupada || !ativa) return;
    ocupada = true;
    anunciar();
    try {
      await servico.registrar(declaracaoPendente.entrada, declaracaoPendente.chave);
      declaracaoPendente = null;
      status = 'Decisão de localização registrada. O turno permanece disponível.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      anunciar();
    }
  }

  let iniciada = false;
  return {
    ler: () => vista,
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
    consentir: () => void salvar(true),
    revogar: () => void salvar(false),
    atualizar: () => void carregar(),
    repetirConfirmacao: () => void enviar(),
    conferirRegistro: () => void enviarDeclaracao(),
    /** A primeira consulta, uma vez só, depois de a tela existir. */
    iniciar() {
      if (iniciada) return;
      iniciada = true;
      void carregar();
    },
    async coletar(): Promise<DeclaracaoLocalizacao> {
      if (!ativa) return { motivo_ausencia: 'falha' };
      // Revalidar consentimento antes de cada coleta; falha não busca coordenadas.
      try {
        const consulta = servico.consultar();
        const recebido = await new Promise<ConsentimentoLocalizacao | undefined>(
          (resolve, rejeitar) => {
            const concluir = (valor: ConsentimentoLocalizacao | undefined) => {
              clearTimeout(prazo);
              controle.signal.removeEventListener('abort', abortar);
              resolve(valor);
            };
            const abortar = () => concluir(undefined);
            const prazo = setTimeout(() => concluir(undefined), 2_000);
            controle.signal.addEventListener('abort', abortar, { once: true });
            consulta.then(concluir, (erro) => {
              clearTimeout(prazo);
              controle.signal.removeEventListener('abort', abortar);
              rejeitar(erro);
            });
          },
        );
        if (recebido === undefined) return { motivo_ausencia: 'falha' };
        consentimento = recebido;
      } catch {
        return { motivo_ausencia: 'falha' };
      }
      if (!ativa || controle.signal.aborted) return { motivo_ausencia: 'falha' };
      return coletarLocalizacaoTurno(consentimento, controle.signal);
    },
    async registrar(
      turnoId: string,
      momento: 'abertura' | 'encerramento',
      dados: DeclaracaoLocalizacao,
    ) {
      if (!ativa) return;
      if (declaracaoPendente) {
        status =
          'Existe uma confirmação de localização pendente. Confira antes de enviar outra; isso não impede o turno.';
        anunciar();
        return;
      }
      declaracaoPendente = {
        entrada: { turno_id: turnoId, momento, ...dados },
        chave: crypto.randomUUID(),
      };
      anunciar();
      await enviarDeclaracao();
    },
    desmontar() {
      ativa = false;
      controle.abort();
      tentativa = null;
      declaracaoPendente = null;
    },
  };
}

export type ControleConsentimentoTurno = ReturnType<typeof criarConsentimentoTurno>;

export function ConsentimentoTurno({ controle }: { controle: ControleConsentimentoTurno }) {
  return (
    <TelaConsentimento
      ler={controle.ler}
      assinar={controle.assinar}
      consentir={controle.consentir}
      revogar={controle.revogar}
      atualizar={controle.atualizar}
      repetirConfirmacao={controle.repetirConfirmacao}
      conferirRegistro={controle.conferirRegistro}
    />
  );
}

/** O consentimento com o ciclo de vida do componente que o compõe: consulta ao montar,
 *  encerra ao desmontar. As opções valem as da primeira montagem, como antes. */
export function usarConsentimentoTurno(
  servico: PortasLocalizacaoTurno,
  opcoes: OpcoesConsentimento,
): ControleConsentimentoTurno {
  const controle = useRef<ControleConsentimentoTurno | null>(null);
  controle.current ??= criarConsentimentoTurno(servico, opcoes);
  useEffect(() => {
    const atual = controle.current;
    atual?.iniciar();
    return () => atual?.desmontar();
  }, []);
  return controle.current;
}

/** Contrato de quem tem só uma raiz: monta a tela numa ilha e devolve coleta, registro e
 *  desmontagem, como antes. */
export function montarConsentimentoTurno(
  raiz: HTMLElement,
  servico: PortasLocalizacaoTurno,
  opcoes: OpcoesConsentimento,
) {
  const controle = criarConsentimentoTurno(servico, opcoes);
  const desmontarIlha = ilha(raiz, <ConsentimentoTurno controle={controle} />);
  controle.iniciar();
  return {
    coletar: controle.coletar,
    registrar: controle.registrar,
    desmontar() {
      controle.desmontar();
      desmontarIlha();
    },
  };
}
