import { z } from 'zod';
import {
  acessoSchema,
  criarAcessoSchema,
  listaAcessosSchema,
  solicitarConfirmacaoInternaSchema,
  verificarConfirmacaoInternaSchema,
  type CriarAcesso,
} from '../packages/contracts/src/acessos.ts';
import {
  erroRespostaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };
/** A lista só contém metadados. Corpo limitado também durante uma resposta interrompida. */
async function lerResposta(resposta: Response, sinal: AbortSignal): Promise<unknown> {
  if (
    resposta.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json' ||
    !resposta.body
  )
    throw new Error();
  const leitor = resposta.body.getReader();
  let abortar!: () => void;
  const cancelamento = new Promise<never>((_, rejeitar) => {
    abortar = () => rejeitar(new Error());
    sinal.addEventListener('abort', abortar, { once: true });
  });
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  try {
    if (sinal.aborted) throw new Error();
    while (true) {
      const parte = await Promise.race([leitor.read(), cancelamento]);
      if (sinal.aborted) throw new Error();
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > 131_072) throw new Error();
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (erro) {
    void leitor.cancel().catch(() => {});
    throw erro;
  } finally {
    sinal.removeEventListener('abort', abortar);
    leitor.releaseLock();
  }
}

export function criarServicoAcessosHttp(identidadeAtual: () => Identidade | null) {
  const inicial = identidadeAtual();
  const montagem = inicial ? { ...inicial } : null;
  const controles = new Set<AbortController>();
  let ativa = true;
  const verificar = () => {
    const atual = identidadeAtual();
    if (
      !ativa ||
      !atual ||
      !montagem ||
      atual.usuario_id !== montagem.usuario_id ||
      atual.session_id !== montagem.session_id
    )
      throw new FalhaApi('nao_autenticado', 401);
    return atual;
  };
  async function enviar<T>(
    caminho: string,
    schema: z.ZodType<T>,
    corpo?: CriarAcesso,
    chave?: string,
  ): Promise<T> {
    const identidade = verificar();
    const modo = sessionStorage.getItem('modo-acesso');
    if (!['google', 'interno', 'tecnica'].includes(modo ?? ''))
      throw new FalhaApi('nao_autenticado', 401);
    const fluxo = sessionStorage.getItem(
      modo === 'interno' ? 'fluxo-interno' : modo === 'tecnica' ? 'fluxo-tecnico' : 'fluxo-google',
    );
    if (!fluxo || !/^[A-Za-z0-9_-]{22}$/.test(fluxo)) throw new FalhaApi('nao_autenticado', 401);
    const controle = new AbortController();
    controles.add(controle);
    let enviada = false;
    try {
      const sinal = AbortSignal.any([controle.signal, AbortSignal.timeout(20_000)]);
      enviada = corpo !== undefined;
      const resposta = await fetch(caminho, {
        method: corpo ? 'POST' : 'GET',
        headers: {
          Accept: 'application/json',
          'x-sessao': identidade.session_id,
          'x-fluxo': fluxo,
          ...(corpo
            ? {
                'Content-Type': 'application/json',
                'x-chave-idempotencia': uuidSchema.parse(chave),
              }
            : {}),
        },
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: sinal,
      });
      if (enviada && resposta.status === 202) {
        if (resposta.body) void resposta.body.cancel().catch(() => {});
        throw new FalhaApi('pendencia_externa', 503);
      }
      const envelope = await lerResposta(resposta, sinal);
      verificar();
      if (!resposta.ok) {
        const erro = erroRespostaSchema.parse(envelope).erro;
        if (resposta.status !== statusErroHttp[erro.codigo]) throw new Error();
        throw new FalhaApi(erro.codigo, resposta.status);
      }
      return sucessoRespostaSchema(schema).parse(envelope).dados;
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi(enviada ? 'pendencia_externa' : 'servico_indisponivel');
    } finally {
      controles.delete(controle);
    }
  }
  return {
    listar: (cursor?: string) =>
      enviar(
        `/api/acessos${cursor ? `?cursor_id=${encodeURIComponent(uuidSchema.parse(cursor))}` : ''}`,
        listaAcessosSchema,
      ),
    criar: (entrada: CriarAcesso, chave: string) =>
      enviar('/api/acessos', acessoSchema, criarAcessoSchema.parse(entrada), chave),
    consultarOperacao: (id: string) =>
      enviar(`/api/acessos/operacoes/${uuidSchema.parse(id)}`, acessoSchema.nullable()),
    desmontar() {
      ativa = false;
      for (const controle of controles) controle.abort();
      controles.clear();
    },
  };
}
export type ServicoAcessos = ReturnType<typeof criarServicoAcessosHttp>;

/** Confirmação de e-mail não abre sessão, não conserva senha e nunca usa cookies Auth. */
export function criarServicoConfirmacaoInterna() {
  const controles = new Set<AbortController>();
  let ativa = true;
  async function enviar(caminho: string, corpo: unknown) {
    if (!ativa) throw new FalhaApi('servico_indisponivel');
    const controle = new AbortController();
    controles.add(controle);
    try {
      const sinal = AbortSignal.any([controle.signal, AbortSignal.timeout(20_000)]);
      const resposta = await fetch(`/api/auth/interno/confirmacao/${caminho}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: sinal,
      });
      const envelope = await lerResposta(resposta, sinal);
      if (!ativa) throw new Error();
      if (!resposta.ok) {
        const erro = erroRespostaSchema.parse(envelope).erro;
        if (resposta.status !== statusErroHttp[erro.codigo]) throw new Error();
        throw new FalhaApi(erro.codigo, resposta.status);
      }
      sucessoRespostaSchema(z.object({ recebido: z.literal(true) }).strict()).parse(envelope);
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi('servico_indisponivel');
    } finally {
      controles.delete(controle);
    }
  }
  return {
    solicitar: (email: string) =>
      enviar('solicitar', solicitarConfirmacaoInternaSchema.parse({ email })),
    verificar: (email: string, codigo: string) =>
      enviar('verificar', verificarConfirmacaoInternaSchema.parse({ email, codigo })),
    cancelar() {
      for (const controle of controles) controle.abort();
      controles.clear();
    },
    desmontar() {
      ativa = false;
      for (const controle of controles) controle.abort();
      controles.clear();
    },
  };
}
