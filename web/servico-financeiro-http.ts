import {
  financeiroHttp,
  type ApuracaoRepasse,
  type ConcessaoFinanceira,
  type ConsultarApuracao,
  type Despesa,
  type DespesaVersao,
  type EnvioComprovante,
  type GravarConcessaoFinanceira,
  type RegistrarDespesa,
  type RegistrarValorAcordado,
  type ValorAcordado,
} from '../packages/contracts/src/index.ts';
import {
  erroRespostaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };

export type ServicoFinanceiro = {
  consultarAudiencia(): Promise<boolean>;
  listarConcessoes(): Promise<ConcessaoFinanceira[]>;
  gravarConcessao(entrada: GravarConcessaoFinanceira, chave: string): Promise<ConcessaoFinanceira>;
  listarValores(profissionalId: string): Promise<ValorAcordado[]>;
  registrarValor(entrada: RegistrarValorAcordado, chave: string): Promise<ValorAcordado>;
  listarDespesas(pacienteId: string): Promise<DespesaVersao[]>;
  registrarDespesa(entrada: RegistrarDespesa, chave: string): Promise<Despesa>;
  enviarComprovante(
    pacienteId: string,
    despesaId: string,
    envio: EnvioComprovante,
    chave: string,
  ): Promise<void>;
  baixarComprovante(pacienteId: string, despesaId: string): Promise<Blob>;
  consultarApuracao(entrada: ConsultarApuracao): Promise<ApuracaoRepasse>;
};

/** Nome do objeto do comprovante. Precisa coincidir com o que o servidor exige; o servidor
 * recusa qualquer outro, então isto é conveniência da tela, não autorização. */
export function nomeComprovante(despesaId: string): string {
  return `${despesaId.toLowerCase()}/comprovante`;
}

/** Serviço isolado do financeiro do cuidado (FR-068, FR-069, FR-070). Sessão, audiência
 * financeira e atestado continuam sendo verificados no servidor e no banco: esconder botão
 * não autoriza nada, e toda chamada daqui pode voltar `sem_permissao`. */
export function criarServicoFinanceiroHttp(
  identidadeAtual: () => Identidade | null,
): ServicoFinanceiro {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);

  const cabecalhos = (metodo: string, chave?: string) => {
    const atual = identidadeAtual();
    if (
      !atual ||
      atual.usuario_id !== identidade.usuario_id ||
      atual.session_id !== identidade.session_id
    )
      throw new FalhaApi('nao_autenticado', 401);
    const headers = new Headers({ 'x-sessao': atual.session_id });
    let modo: string | null;
    let fluxo: string | null;
    try {
      modo = sessionStorage.getItem('modo-acesso');
      fluxo = sessionStorage.getItem(
        modo === 'interno'
          ? 'fluxo-interno'
          : modo === 'tecnica'
            ? 'fluxo-tecnico'
            : 'fluxo-google',
      );
    } catch {
      throw new FalhaApi('nao_autenticado', 401);
    }
    if (
      (modo !== 'google' && modo !== 'interno' && modo !== 'tecnica') ||
      !fluxo ||
      !/^[A-Za-z0-9_-]{22}$/.test(fluxo)
    )
      throw new FalhaApi('nao_autenticado', 401);
    headers.set('x-fluxo', fluxo);
    if (chave) headers.set('x-chave-idempotencia', uuidSchema.parse(chave));
    if (metodo !== 'GET') headers.set('Content-Type', 'application/json');
    return headers;
  };

  const conferirIdentidade = (metodo: string) => {
    const depois = identidadeAtual();
    if (
      !depois ||
      depois.usuario_id !== identidade.usuario_id ||
      depois.session_id !== identidade.session_id
    )
      throw new FalhaApi('nao_autenticado', metodo === 'GET' ? 401 : 0, true);
  };

  const pedir = async (
    metodo: string,
    caminho: string,
    corpo?: unknown,
    chave?: string,
    aceitar = 'application/json',
  ) => {
    const headers = cabecalhos(metodo, chave);
    headers.set('Accept', aceitar);
    // `URL` absoluta na mesma origem, como em `api.ts`: o alvo fica explícito e não depende
    // de resolução relativa.
    const resposta = await fetch(new URL(caminho, window.location.origin), {
      method: metodo,
      headers,
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(30_000),
    });
    if (metodo !== 'GET' && resposta.status === 202) throw new Error();
    return resposta;
  };

  const enviar = async <T>(
    rota: { metodo: string; caminho: string; saida: { parse(valor: unknown): T } },
    caminho: string,
    corpo?: unknown,
    chave?: string,
  ): Promise<T> => {
    try {
      const resposta = await pedir(rota.metodo, caminho, corpo, chave);
      if (!resposta.headers.get('content-type')?.includes('application/json')) throw new Error();
      const envelope: unknown = await resposta.json();
      conferirIdentidade(rota.metodo);
      if (!resposta.ok) {
        const erro = erroRespostaSchema.safeParse(envelope);
        if (
          !erro.success ||
          (rota.metodo !== 'GET' && statusErroHttp[erro.data.erro.codigo] !== resposta.status)
        )
          throw new Error();
        throw new FalhaApi(erro.data.erro.codigo, resposta.status);
      }
      return sucessoRespostaSchema(rota.saida as never).parse(envelope).dados as T;
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi('servico_indisponivel');
    }
  };

  const caminhoDespesas = (pacienteId: string) =>
    `/api/financeiro/casos/${encodeURIComponent(uuidSchema.parse(pacienteId))}/despesas`;
  const caminhoComprovante = (pacienteId: string, despesaId: string) =>
    `${caminhoDespesas(pacienteId)}/${encodeURIComponent(uuidSchema.parse(despesaId))}/comprovante`;

  return {
    consultarAudiencia: async () => {
      const dados = await enviar(
        financeiroHttp.consultarAudiencia,
        financeiroHttp.consultarAudiencia.caminho,
      );
      return dados.permitida;
    },
    // Administração da audiência financeira (FR-068). Esconder a área não autoriza nada: as
    // duas chamadas abaixo podem voltar `sem_permissao` do banco a quem não é Administrador.
    listarConcessoes: async () =>
      enviar(financeiroHttp.listarConcessoes, financeiroHttp.listarConcessoes.caminho),
    gravarConcessao: async (entrada, chave) =>
      enviar(
        financeiroHttp.gravarConcessao,
        financeiroHttp.gravarConcessao.caminho,
        financeiroHttp.gravarConcessao.entrada.parse(entrada),
        chave,
      ),
    listarValores: async (profissionalId) =>
      enviar(
        financeiroHttp.consultarValoresAcordados,
        `/api/financeiro/profissionais/${encodeURIComponent(uuidSchema.parse(profissionalId))}/valores-acordados`,
      ),
    registrarValor: async (entrada, chave) =>
      enviar(
        financeiroHttp.registrarValorAcordado,
        financeiroHttp.registrarValorAcordado.caminho,
        financeiroHttp.registrarValorAcordado.entrada.parse(entrada),
        chave,
      ),
    listarDespesas: async (pacienteId) =>
      enviar(financeiroHttp.consultarDespesas, caminhoDespesas(pacienteId)),
    registrarDespesa: async (entrada, chave) =>
      enviar(
        financeiroHttp.registrarDespesa,
        financeiroHttp.registrarDespesa.caminho,
        financeiroHttp.registrarDespesa.entrada.parse(entrada),
        chave,
      ),
    enviarComprovante: async (pacienteId, despesaId, envio, chave) => {
      await enviar(
        financeiroHttp.enviarComprovante,
        caminhoComprovante(pacienteId, despesaId),
        financeiroHttp.enviarComprovante.entrada.parse(envio),
        chave,
      );
    },
    baixarComprovante: async (pacienteId, despesaId) => {
      // Bytes a cada leitura, sem URL guardada em lugar nenhum: a resposta é consumida como
      // Blob e descartada pela tela assim que o download termina.
      try {
        const resposta = await pedir(
          'GET',
          caminhoComprovante(pacienteId, despesaId),
          undefined,
          undefined,
          'application/octet-stream',
        );
        conferirIdentidade('GET');
        if (!resposta.ok) {
          const envelope: unknown = await resposta.json().catch(() => null);
          const erro = erroRespostaSchema.safeParse(envelope);
          throw new FalhaApi(
            erro.success ? erro.data.erro.codigo : 'servico_indisponivel',
            resposta.status,
          );
        }
        return await resposta.blob();
      } catch (erro) {
        if (erro instanceof FalhaApi) throw erro;
        throw new FalhaApi('servico_indisponivel');
      }
    },
    consultarApuracao: async (entrada) => {
      const consulta = financeiroHttp.consultarApuracao.entrada.parse(entrada);
      const parametros = new URLSearchParams({
        profissional_usuario_id: consulta.profissional_usuario_id,
        periodo_inicio: consulta.periodo_inicio,
        periodo_fim: consulta.periodo_fim,
      });
      return enviar(
        financeiroHttp.consultarApuracao,
        `${financeiroHttp.consultarApuracao.caminho}?${parametros.toString()}`,
      );
    },
  };
}
