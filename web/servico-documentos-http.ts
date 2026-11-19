import { documentoCasoHttp } from '../packages/contracts/src/documento-caso-http.ts';
import type {
  ConteudoDocumento,
  DocumentoCaso,
  MetadadoDocumento,
} from '../packages/contracts/src/documento-caso.ts';
import {
  sucessoRespostaSchema,
  erroRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { FalhaApi } from './api.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';

type Identidade = { usuario_id: string; session_id: string };

export type ServicoDocumentos = {
  baixar?(paciente: string, documento: string): Promise<Blob>;
  consultar(paciente: string): Promise<DocumentoCaso[]>;
  gravar(
    paciente: string,
    entrada: {
      documento_id: string;
      versao_esperada: number;
      metadado: MetadadoDocumento;
      conteudo: ConteudoDocumento;
      arquivo?: File;
      chave_idempotencia?: string;
    },
  ): Promise<DocumentoCaso[]>;
};

/** Serviço isolado da fatia de documentos (FR-029 a FR-031). Autorização é do servidor; aqui
 * só verificamos que a identidade não trocou entre o começo e o fim da chamada. */
export function criarServicoDocumentosHttp(
  identidadeAtual: () => Identidade | null,
): ServicoDocumentos {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  const enviar = async (
    nome: 'consultar' | 'gravar',
    paciente: string,
    corpo?: { json: unknown } | { formulario: FormData },
    chaveIdempotencia?: string,
  ) => {
    const rota = documentoCasoHttp[nome];
    const atual = identidadeAtual();
    if (
      !atual ||
      atual.usuario_id !== identidade.usuario_id ||
      atual.session_id !== identidade.session_id
    )
      throw new FalhaApi('nao_autenticado', 401);
    const caminho = rota.caminho.replace(
      ':paciente_id',
      encodeURIComponent(uuidSchema.parse(paciente)),
    );
    const headers = new Headers({ Accept: 'application/json', 'x-sessao': atual.session_id });
    let modo: string | null;
    let fluxo: string | null;
    try {
      modo = sessionStorage.getItem('modo-acesso');
      // Leitura (`ler_documentos`) já tem a trilha familiar no banco (filtro por `audiencia`,
      // ver migration `20261124120000`); família também passa por aqui para consultar anexos.
      fluxo = sessionStorage.getItem(
        modo === 'interno'
          ? 'fluxo-interno'
          : modo === 'tecnica'
            ? 'fluxo-tecnico'
            : modo === 'familiar'
              ? 'fluxo-familiar'
              : 'fluxo-google',
      );
    } catch {
      throw new FalhaApi('nao_autenticado', 401);
    }
    if (
      (modo !== 'google' && modo !== 'interno' && modo !== 'tecnica' && modo !== 'familiar') ||
      !fluxo ||
      !/^[A-Za-z0-9_-]{22}$/.test(fluxo)
    )
      throw new FalhaApi('nao_autenticado', 401);
    headers.set('x-fluxo', fluxo);
    if (rota.metodo !== 'GET')
      headers.set('x-chave-idempotencia', chaveIdempotencia ?? crypto.randomUUID());
    // `FormData` define o próprio `content-type` com o limite do multipart; defini-lo à mão
    // quebraria o corpo.
    if (corpo && 'json' in corpo) headers.set('Content-Type', 'application/json');
    let resposta: Response;
    try {
      resposta = await fetch(caminho, {
        method: rota.metodo,
        headers,
        ...(corpo ? { body: 'json' in corpo ? JSON.stringify(corpo.json) : corpo.formulario } : {}),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(60_000),
      });
      if (rota.metodo !== 'GET' && resposta.status === 202) throw new Error();
      if (!resposta.headers.get('content-type')?.includes('application/json')) throw new Error();
      const envelope: unknown = await resposta.json();
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
    baixar: async (paciente, documento) => {
      const atual = identidadeAtual();
      if (
        !atual ||
        atual.usuario_id !== identidade.usuario_id ||
        atual.session_id !== identidade.session_id
      )
        throw new FalhaApi('nao_autenticado', 401);
      try {
        const modo = sessionStorage.getItem('modo-acesso');
        if (!['google', 'interno', 'tecnica', 'familiar'].includes(modo ?? ''))
          throw new FalhaApi('nao_autenticado', 401);
        const fluxo = sessionStorage.getItem(
          modo === 'interno'
            ? 'fluxo-interno'
            : modo === 'tecnica'
              ? 'fluxo-tecnico'
              : modo === 'familiar'
                ? 'fluxo-familiar'
                : 'fluxo-google',
        );
        if (!fluxo || !/^[A-Za-z0-9_-]{22}$/.test(fluxo))
          throw new FalhaApi('nao_autenticado', 401);
        const caminho = documentoCasoHttp.arquivo.caminho
          .replace(':paciente_id', encodeURIComponent(uuidSchema.parse(paciente)))
          .replace(':documento_id', encodeURIComponent(uuidSchema.parse(documento)));
        const resposta = await fetch(caminho, {
          headers: {
            Accept: 'application/octet-stream',
            'x-sessao': atual.session_id,
            'x-fluxo': fluxo,
          },
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: AbortSignal.timeout(60_000),
        });
        if (!resposta.ok) {
          const erro = erroRespostaSchema.safeParse(await resposta.json());
          if (!erro.success || statusErroHttp[erro.data.erro.codigo] !== resposta.status)
            throw new Error();
          throw new FalhaApi(erro.data.erro.codigo, resposta.status);
        }
        if (
          resposta.headers.get('content-type') !== 'application/octet-stream' ||
          !resposta.headers.get('content-disposition')?.startsWith('attachment;')
        )
          throw new Error();
        const blob = await resposta.blob();
        const depois = identidadeAtual();
        if (
          !depois ||
          depois.usuario_id !== identidade.usuario_id ||
          depois.session_id !== identidade.session_id
        )
          throw new FalhaApi('nao_autenticado', 401);
        if (!blob.size || blob.size > 8 * 1024 * 1024) throw new Error();
        return blob;
      } catch (erro) {
        if (erro instanceof FalhaApi) throw erro;
        throw new FalhaApi('servico_indisponivel');
      }
    },
    consultar: async (paciente) => (await enviar('consultar', paciente)).documentos,
    gravar: async (paciente, entrada) => {
      const base = {
        documento_id: entrada.documento_id,
        versao_esperada: entrada.versao_esperada,
        metadado: entrada.metadado,
        conteudo: entrada.conteudo,
      };
      if (!entrada.arquivo)
        return (await enviar('gravar', paciente, { json: base }, entrada.chave_idempotencia))
          .documentos;
      const formulario = new FormData();
      formulario.set('documento_id', base.documento_id);
      formulario.set('versao_esperada', String(base.versao_esperada));
      formulario.set('metadado', JSON.stringify(base.metadado));
      formulario.set('conteudo', JSON.stringify(base.conteudo));
      formulario.set('arquivo', entrada.arquivo, entrada.arquivo.name);
      return (await enviar('gravar', paciente, { formulario }, entrada.chave_idempotencia))
        .documentos;
    },
  };
}

/** Disponibilidade do serviço; a tela some em vez de oferecer um envio que falharia. */
export async function consultarDisponibilidadeDocumentos(): Promise<{
  disponivel: boolean;
  categorias: readonly string[];
}> {
  try {
    const resposta = await fetch('/api/documentos/disponibilidade', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(10_000),
    });
    if (!resposta.ok) return { disponivel: false, categorias: [] };
    const envelope: unknown = await resposta.json();
    const dados = (envelope as { dados?: { disponivel?: unknown; categorias?: unknown } } | null)
      ?.dados;
    const categorias = Array.isArray(dados?.categorias)
      ? dados.categorias.filter((item): item is string => typeof item === 'string')
      : [];
    return { disponivel: dados?.disponivel === true, categorias };
  } catch {
    return { disponivel: false, categorias: [] };
  }
}
