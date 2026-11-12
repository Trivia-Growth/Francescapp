import {
  paginaSolicitacaoTitularSchema,
  solicitacaoTitularSchema,
  type PaginaSolicitacaoTitular,
  type RegistrarSolicitacaoTitular,
  type ResponderSolicitacaoTitular,
  type SolicitacaoTitular,
} from '../packages/contracts/src/solicitacao-titular.ts';
import {
  erroRespostaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };
const CAMINHO = '/api/admin/solicitacoes-titular';

export type ServicoSolicitacaoTitular = {
  listar(filtros: {
    limite?: number;
    cursor?: string;
    paciente_id?: string;
  }): Promise<PaginaSolicitacaoTitular>;
  registrar(entrada: RegistrarSolicitacaoTitular): Promise<SolicitacaoTitular>;
  responder(
    entrada: ResponderSolicitacaoTitular & { paciente_id: string },
  ): Promise<SolicitacaoTitular>;
};

/** Serviço da tela de solicitações do titular (FR-040). Administrador-only; a autorização real
 * é verificada no servidor e no banco. O texto da solicitação é cifrado no servidor — o
 * navegador manda em claro pelo canal TLS e nunca recebe de volta o conteúdo de outra pessoa. */
export function criarServicoSolicitacaoTitularHttp(
  identidadeAtual: () => Identidade | null,
): ServicoSolicitacaoTitular {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);

  const enviar = async (
    metodo: 'GET' | 'POST',
    alvo: string,
    corpo?: unknown,
    chave?: string,
  ): Promise<unknown> => {
    const atual = identidadeAtual();
    if (
      !atual ||
      atual.usuario_id !== identidade.usuario_id ||
      atual.session_id !== identidade.session_id
    )
      throw new FalhaApi('nao_autenticado', 401);
    const headers = new Headers({ Accept: 'application/json', 'x-sessao': atual.session_id });
    let modo: string | null;
    let fluxo: string | null;
    try {
      modo = sessionStorage.getItem('modo-acesso');
      fluxo = sessionStorage.getItem(modo === 'tecnica' ? 'fluxo-tecnico' : 'fluxo-google');
    } catch {
      throw new FalhaApi('nao_autenticado', 401);
    }
    if ((modo !== 'google' && modo !== 'tecnica') || !fluxo || !/^[A-Za-z0-9_-]{22}$/.test(fluxo))
      throw new FalhaApi('nao_autenticado', 401);
    headers.set('x-fluxo', fluxo);
    if (chave) headers.set('x-chave-idempotencia', uuidSchema.parse(chave));
    if (metodo === 'POST') headers.set('Content-Type', 'application/json');
    try {
      const resposta = await fetch(alvo, {
        method: metodo,
        headers,
        ...(metodo === 'POST' ? { body: JSON.stringify(corpo) } : {}),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20_000),
      });
      if (metodo === 'POST' && resposta.status === 202) throw new Error();
      if (!resposta.headers.get('content-type')?.includes('application/json')) throw new Error();
      const envelope: unknown = await resposta.json();
      const depois = identidadeAtual();
      if (
        !depois ||
        depois.usuario_id !== identidade.usuario_id ||
        depois.session_id !== identidade.session_id
      )
        throw new FalhaApi('nao_autenticado', metodo === 'GET' ? 401 : 0, true);
      if (!resposta.ok) {
        const erro = erroRespostaSchema.safeParse(envelope);
        if (!erro.success) throw new Error();
        throw new FalhaApi(erro.data.erro.codigo, resposta.status);
      }
      return envelope;
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi('servico_indisponivel');
    }
  };

  return {
    listar: async (filtros) => {
      const parametros = new URLSearchParams({ limite: String(filtros.limite ?? 25) });
      if (filtros.cursor) parametros.set('cursor', filtros.cursor);
      if (filtros.paciente_id) parametros.set('paciente_id', filtros.paciente_id);
      const envelope = await enviar('GET', `${CAMINHO}?${parametros.toString()}`);
      return sucessoRespostaSchema(paginaSolicitacaoTitularSchema).parse(envelope).dados;
    },
    registrar: async (entrada) => {
      const envelope = await enviar('POST', CAMINHO, entrada, crypto.randomUUID());
      return sucessoRespostaSchema(solicitacaoTitularSchema).parse(envelope).dados;
    },
    responder: async (entrada) => {
      const envelope = await enviar('POST', CAMINHO, entrada, crypto.randomUUID());
      return sucessoRespostaSchema(solicitacaoTitularSchema).parse(envelope).dados;
    },
  };
}
