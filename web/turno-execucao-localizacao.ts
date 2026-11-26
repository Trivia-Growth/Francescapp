import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';
import { elementoTurno as el, botaoTurno, estadoTurno } from './turno-execucao-campos.ts';

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

export function montarConsentimentoTurno(
  raiz: HTMLElement,
  servico: PortasLocalizacaoTurno,
  opcoes: { acessoPerdido(erro: unknown): void; alteracaoPendente?(valor: boolean): void },
) {
  let ativa = true;
  let ocupada = false;
  let carregado = false;
  let consentimento: ConsentimentoLocalizacao = null;
  let tentativa: {
    entrada: Parameters<PortasLocalizacaoTurno['gravar']>[0];
    chave: string;
  } | null = null;
  let declaracaoPendente: {
    entrada: Parameters<PortasLocalizacaoTurno['registrar']>[0];
    chave: string;
  } | null = null;
  const controle = new AbortController();
  const secao = el('section');
  secao.className = 'turno-execucao';
  const status = estadoTurno('Consultando consentimento de localização…');
  const texto = el(
    'p',
    `${finalidadeLocalizacao} Audiência: ${audienciaLocalizacao} Retenção: 90 dias após o turno. Localização é declarada pelo aparelho, sem comprovar presença. Recusar ou revogar não impede o cuidado.`,
  );
  const aceitar = botaoTurno('Consentir localização', () => void salvar(true));
  const revogar = botaoTurno('Revogar consentimento', () => void salvar(false));
  const atualizar = botaoTurno('Consultar consentimento', () => void carregar());
  const recuperar = botaoTurno('Repetir confirmação de consentimento', () => void enviar());
  recuperar.hidden = true;
  const repetirDeclaracao = botaoTurno(
    'Conferir registro da localização',
    () => void enviarDeclaracao(),
  );
  repetirDeclaracao.hidden = true;
  secao.append(
    el('h3', 'Localização opcional'),
    texto,
    status,
    aceitar,
    revogar,
    atualizar,
    recuperar,
    repetirDeclaracao,
  );
  raiz.replaceChildren(secao);
  const atualizarControles = () => {
    aceitar.disabled =
      ocupada || !carregado || Boolean(consentimento?.concedido) || Boolean(tentativa);
    revogar.disabled = ocupada || !carregado || !consentimento?.concedido || Boolean(tentativa);
    atualizar.disabled = ocupada;
    recuperar.disabled = ocupada;
    repetirDeclaracao.disabled = ocupada;
    recuperar.hidden = tentativa === null;
    repetirDeclaracao.hidden = declaracaoPendente === null;
  };
  const falha = (erro: unknown) => {
    if (!ativa) return;
    if (
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      ativa = false;
      controle.abort();
      raiz.replaceChildren();
      opcoes.acessoPerdido(erro);
      return;
    }
    status.textContent = `${mensagemFalha(erro)} O turno pode continuar sem localização.`;
  };
  async function carregar() {
    if (ocupada || !ativa) return;
    ocupada = true;
    atualizarControles();
    try {
      const recebido = await servico.consultar();
      if (!ativa) return;
      consentimento = recebido;
      carregado = true;
      status.textContent = recebido?.concedido
        ? 'Consentimento vigente. A coleta ocorrerá somente ao abrir ou encerrar turno.'
        : 'Sem consentimento vigente. O cuidado continua sem coleta de localização.';
      if (
        tentativa &&
        recebido &&
        recebido.versao === tentativa.entrada.versao_esperada + 1 &&
        recebido.concedido === tentativa.entrada.concedido
      ) {
        tentativa = null;
        opcoes.alteracaoPendente?.(false);
      }
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) atualizarControles();
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
    opcoes.alteracaoPendente?.(true);
    await enviar();
  }
  async function enviar() {
    if (ocupada || !tentativa || !ativa) return;
    ocupada = true;
    atualizarControles();
    status.textContent = 'Registrando decisão de consentimento…';
    try {
      await servico.gravar(tentativa.entrada, tentativa.chave);
      if (!ativa) return;
      tentativa = null;
      opcoes.alteracaoPendente?.(false);
    } catch (erro) {
      if (!resultadoIncerto(erro)) tentativa = null;
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) {
        atualizarControles();
        if (!tentativa) await carregar();
      }
    }
  }
  async function enviarDeclaracao() {
    if (!declaracaoPendente || ocupada || !ativa) return;
    ocupada = true;
    atualizarControles();
    try {
      await servico.registrar(declaracaoPendente.entrada, declaracaoPendente.chave);
      if (!ativa) return;
      declaracaoPendente = null;
      status.textContent = 'Decisão de localização registrada. O turno permanece disponível.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) atualizarControles();
    }
  }
  atualizarControles();
  void carregar();
  return {
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
        status.textContent =
          'Existe uma confirmação de localização pendente. Confira antes de enviar outra; isso não impede o turno.';
        return;
      }
      declaracaoPendente = {
        entrada: { turno_id: turnoId, momento, ...dados },
        chave: crypto.randomUUID(),
      };
      await enviarDeclaracao();
    },
    desmontar() {
      ativa = false;
      controle.abort();
      tentativa = null;
      declaracaoPendente = null;
      raiz.replaceChildren();
    },
  };
}
