import { fichaPlantaoHttp } from '../packages/contracts/src/ficha-plantao-http.ts';
import type {
  PendenciaPlantaoHttp,
  RascunhoFichaPlantaoProjetado,
  ResultadoFichaPlantao,
} from '../packages/contracts/src/ficha-plantao-http.ts';
import type {
  ConteudoFichaPlantao,
  ResolucaoPendenciaEscrita,
  SubmissaoFichaPlantao,
} from '../packages/contracts/src/ficha-plantao.ts';
import {
  erroRespostaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };
type Nome = keyof typeof fichaPlantaoHttp;

export type ServicoFichaPlantao = {
  consultar(paciente: string, turno: string): Promise<ResultadoFichaPlantao>;
  /** FR-077 / decisão 0.5: pendências ESCRITAS do caso, de todos os plantões, para a
   * carteira mostrá-las ao lado das quatro derivadas com a origem visível. */
  listarPendencias(paciente: string): Promise<PendenciaPlantaoHttp[]>;
  consultarRascunho(paciente: string, turno: string): Promise<RascunhoFichaPlantaoProjetado>;
  salvarRascunho(
    paciente: string,
    turno: string,
    conteudo: ConteudoFichaPlantao,
  ): Promise<RascunhoFichaPlantaoProjetado>;
  publicar(
    paciente: string,
    submissao: SubmissaoFichaPlantao,
    chave: string,
  ): Promise<ResultadoFichaPlantao>;
  resolverPendencia(
    paciente: string,
    resolucao: ResolucaoPendenciaEscrita,
    chave: string,
  ): Promise<ResultadoFichaPlantao>;
};

/** FR-073 a FR-077. Serviço isolado da ficha de plantão. Autorização é do servidor e do
 * banco; aqui só se confere que a identidade não trocou entre o começo e o fim da chamada.
 * O rascunho vive no servidor, cifrado: nada de conteúdo clínico em `localStorage`. */
export function criarServicoFichaPlantaoHttp(
  identidadeAtual: () => Identidade | null,
): ServicoFichaPlantao {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  const enviar = async (
    nome: Nome,
    entrada: unknown,
    alvo: { paciente: string; turno?: string },
    chave?: string,
  ) => {
    const rota = fichaPlantaoHttp[nome];
    // Recusa do próprio contrato é ENTRADA INVÁLIDA, não serviço fora do ar: deixar o
    // ZodError cair no `catch` genérico lá embaixo devolvia `servico_indisponivel` para um
    // dado que o aplicativo deixou digitar, e a pessoa lia uma mensagem enganosa.
    const lido = rota.entrada.safeParse(entrada);
    if (!lido.success) throw new FalhaApi('entrada_invalida', statusErroHttp.entrada_invalida);
    const corpo = lido.data;
    const atual = identidadeAtual();
    if (
      !atual ||
      atual.usuario_id !== identidade.usuario_id ||
      atual.session_id !== identidade.session_id
    )
      throw new FalhaApi('nao_autenticado', 401);
    let caminho = rota.caminho.replace(
      ':paciente_id',
      encodeURIComponent(uuidSchema.parse(alvo.paciente)),
    );
    if (caminho.includes(':turno_id'))
      caminho = caminho.replace(
        ':turno_id',
        encodeURIComponent(uuidSchema.parse(alvo.turno ?? '')),
      );
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
    try {
      // Caminho absoluto: dublês de rede de outras telas já quebraram com caminho relativo.
      const resposta = await fetch(new URL(caminho, window.location.origin).toString(), {
        method: rota.metodo,
        headers,
        ...(rota.metodo === 'GET' ? {} : { body: JSON.stringify(corpo) }),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20_000),
      });
      if (rota.metodo !== 'GET' && resposta.status === 202) throw new Error();
      if (!resposta.headers.get('content-type')?.includes('application/json')) throw new Error();
      if (!resposta.body) throw new Error();
      const leitor = resposta.body.getReader();
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      try {
        while (true) {
          const parte = await leitor.read();
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          if (tamanho > 1_048_576) throw new Error();
          partes.push(parte.value);
        }
      } catch (erro) {
        void leitor.cancel().catch(() => {});
        throw erro;
      } finally {
        leitor.releaseLock();
      }
      const bytes = new Uint8Array(tamanho);
      let posicao = 0;
      for (const parte of partes) {
        bytes.set(parte, posicao);
        posicao += parte.length;
      }
      const envelope: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
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
      throw new FalhaApi('servico_indisponivel');
    }
  };
  return {
    consultar: async (paciente, turno) =>
      (await enviar('consultar', {}, { paciente, turno })) as ResultadoFichaPlantao,
    listarPendencias: async (paciente) =>
      (
        (await enviar('listarPendencias', {}, { paciente })) as {
          pendencias: PendenciaPlantaoHttp[];
        }
      ).pendencias,
    consultarRascunho: async (paciente, turno) =>
      (await enviar('consultarRascunho', {}, { paciente, turno })) as RascunhoFichaPlantaoProjetado,
    salvarRascunho: async (paciente, turno, conteudo) =>
      (await enviar(
        'salvarRascunho',
        { turno_id: turno, conteudo },
        { paciente, turno },
        crypto.randomUUID(),
      )) as RascunhoFichaPlantaoProjetado,
    publicar: async (paciente, submissao, chave) =>
      (await enviar('submeter', submissao, { paciente }, chave)) as ResultadoFichaPlantao,
    resolverPendencia: async (paciente, resolucao, chave) =>
      (await enviar('resolverPendencia', resolucao, { paciente }, chave)) as ResultadoFichaPlantao,
  };
}
