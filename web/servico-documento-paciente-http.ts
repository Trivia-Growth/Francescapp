import type { z } from 'zod';
import {
  sucessoRespostaSchema,
  erroRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };

export type ServicoDocumentoPaciente<T> = {
  consultar(pacienteId: string): Promise<{ versao: number; conteudo: T } | null>;
  salvar(
    pacienteId: string,
    versaoEsperada: number,
    conteudo: unknown,
    chave: string,
  ): Promise<{ versao: number; conteudo: T } | null>;
};

/** Cliente das rotas de documento versionado por paciente (FR-005 e FR-002).
 * A sessão e a autorização continuam sendo verificadas no servidor; aqui só
 * garantimos que a identidade não trocou entre o envio e a leitura da resposta. */
export function criarServicoDocumentoPacienteHttp<T>(
  identidadeAtual: () => Identidade | null,
  segmento: string,
  saidaSchema: z.ZodType<{ versao: number; conteudo: T } | null, unknown>,
  campoCorpo: string,
): ServicoDocumentoPaciente<T> {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  const enviar = async (
    metodo: 'GET' | 'PATCH',
    pacienteId: string,
    corpo?: unknown,
    chave?: string,
  ) => {
    const atual = identidadeAtual();
    if (
      !atual ||
      atual.usuario_id !== identidade.usuario_id ||
      atual.session_id !== identidade.session_id
    )
      throw new FalhaApi('nao_autenticado', 401);
    const caminho = `/api/pacientes/${encodeURIComponent(uuidSchema.parse(pacienteId))}/${segmento}`;
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
    if (metodo !== 'GET') headers.set('Content-Type', 'application/json');
    try {
      const resposta = await fetch(caminho, {
        method: metodo,
        headers,
        ...(metodo === 'GET' ? {} : { body: JSON.stringify(corpo) }),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20_000),
      });
      if (metodo !== 'GET' && resposta.status === 202) throw new Error();
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
        throw new FalhaApi('nao_autenticado', metodo === 'GET' ? 401 : 0, true);
      if (!resposta.ok) {
        const erro = erroRespostaSchema.safeParse(envelope);
        if (
          !erro.success ||
          (metodo !== 'GET' && statusErroHttp[erro.data.erro.codigo] !== resposta.status)
        )
          throw new Error();
        throw new FalhaApi(erro.data.erro.codigo, resposta.status);
      }
      return sucessoRespostaSchema(saidaSchema).parse(envelope).dados;
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi('servico_indisponivel');
    }
  };
  return {
    consultar: (pacienteId) => enviar('GET', pacienteId),
    salvar: (pacienteId, versaoEsperada, conteudo, chave) =>
      enviar(
        'PATCH',
        pacienteId,
        { versao_esperada: versaoEsperada, [campoCorpo]: conteudo },
        chave,
      ),
  };
}
