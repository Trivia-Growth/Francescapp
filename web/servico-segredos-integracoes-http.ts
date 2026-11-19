import { contratosSegredos as contratosRotas } from '../packages/contracts/src/segredos-integracoes.ts';
import type {
  SegredosIntegracoes,
  EstadoExpurgoAudio,
  ValorSegredo,
} from '../packages/contracts/src/segredos-integracoes.ts';
import {
  erroRespostaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };

export type ServicoSegredosIntegracoes = {
  listar(): Promise<SegredosIntegracoes[]>;
  consultarExpurgo?(): Promise<EstadoExpurgoAudio>;
  gravar(entrada: {
    segredo_chave: string;
    valor: ValorSegredo;
    versao_esperada: number;
  }): Promise<SegredosIntegracoes>;
};

/** Metadados de quatro credenciais: corpo limitado, inclusive se a origem não o encerrar. */
async function lerMetadados(resposta: Response, sinal: AbortSignal): Promise<unknown> {
  if (!resposta.body) throw new Error();
  const leitor = resposta.body.getReader();
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  let abortar!: () => void;
  const expiracao = new Promise<never>((_, rejeitar) => {
    abortar = () => rejeitar(new Error());
    sinal.addEventListener('abort', abortar, { once: true });
  });
  try {
    if (sinal.aborted) throw new Error();
    while (true) {
      const parte = await Promise.race([leitor.read(), expiracao]);
      if (sinal.aborted) throw new Error();
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > 65_536) throw new Error();
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

/** BFF com cookie e fluxo/sessão existentes; valor só segue no corpo POST. */
export function criarServicoSegredosIntegracoesHttp(
  identidadeAtual: () => Identidade | null,
): ServicoSegredosIntegracoes {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  const enviar = async (
    rota:
      | typeof contratosRotas.consultarExpurgoAudio
      | typeof contratosRotas.listarSegredosIntegracoes
      | typeof contratosRotas.gravarSegredosIntegracoes,
    entrada: unknown,
    chave?: string,
  ) => {
    const corpo = rota.entrada.parse(entrada);
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
    if (rota.metodo !== 'GET') headers.set('Content-Type', 'application/json');
    let resposta: Response;
    const sinal = AbortSignal.timeout(20_000);
    try {
      resposta = await fetch(rota.caminho, {
        method: rota.metodo,
        headers,
        ...(rota.metodo === 'GET' ? {} : { body: JSON.stringify(corpo) }),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: sinal,
      });
      if (rota.metodo !== 'GET' && resposta.status === 202) throw new Error();
      if (
        resposta.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
      )
        throw new Error();
      const envelope = await lerMetadados(resposta, sinal);
      const depois = identidadeAtual();
      if (
        !depois ||
        depois.usuario_id !== identidade.usuario_id ||
        depois.session_id !== identidade.session_id
      )
        throw new FalhaApi('nao_autenticado', rota.metodo === 'GET' ? 401 : 0, true);
      if (!resposta.ok) {
        const erro = erroRespostaSchema.safeParse(envelope);
        if (
          !erro.success ||
          (rota.metodo !== 'GET' && statusErroHttp[erro.data.erro.codigo] !== resposta.status)
        )
          throw new Error();
        throw new FalhaApi(erro.data.erro.codigo, resposta.status);
      }
      return sucessoRespostaSchema(rota.saida).parse(envelope).dados;
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi(
        rota.metodo === 'GET' ? 'servico_indisponivel' : 'pendencia_externa',
        0,
        rota.metodo !== 'GET',
      );
    }
  };
  return {
    consultarExpurgo: async () =>
      (await enviar(contratosRotas.consultarExpurgoAudio, {})) as EstadoExpurgoAudio,
    listar: async () =>
      (await enviar(contratosRotas.listarSegredosIntegracoes, {})) as SegredosIntegracoes[],
    gravar: async (entrada) =>
      (await enviar(
        contratosRotas.gravarSegredosIntegracoes,
        entrada,
        crypto.randomUUID(),
      )) as SegredosIntegracoes,
  };
}
