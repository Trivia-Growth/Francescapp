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
  consultar(paciente: string): Promise<DocumentoCaso[]>;
  gravar(
    paciente: string,
    entrada: {
      documento_id: string;
      versao_esperada: number;
      metadado: MetadadoDocumento;
      conteudo: ConteudoDocumento;
      arquivo?: File;
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
    nome: keyof typeof documentoCasoHttp,
    paciente: string,
    corpo?: { json: unknown } | { formulario: FormData },
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
      fluxo = sessionStorage.getItem(modo === 'tecnica' ? 'fluxo-tecnico' : 'fluxo-google');
    } catch {
      throw new FalhaApi('nao_autenticado', 401);
    }
    if ((modo !== 'google' && modo !== 'tecnica') || !fluxo || !/^[A-Za-z0-9_-]{22}$/.test(fluxo))
      throw new FalhaApi('nao_autenticado', 401);
    headers.set('x-fluxo', fluxo);
    if (rota.metodo !== 'GET') headers.set('x-chave-idempotencia', crypto.randomUUID());
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
    consultar: async (paciente) => (await enviar('consultar', paciente)).documentos,
    gravar: async (paciente, entrada) => {
      const base = {
        documento_id: entrada.documento_id,
        versao_esperada: entrada.versao_esperada,
        metadado: entrada.metadado,
        conteudo: entrada.conteudo,
      };
      if (!entrada.arquivo) return (await enviar('gravar', paciente, { json: base })).documentos;
      const formulario = new FormData();
      formulario.set('documento_id', base.documento_id);
      formulario.set('versao_esperada', String(base.versao_esperada));
      formulario.set('metadado', JSON.stringify(base.metadado));
      formulario.set('conteudo', JSON.stringify(base.conteudo));
      formulario.set('arquivo', entrada.arquivo, entrada.arquivo.name);
      return (await enviar('gravar', paciente, { formulario })).documentos;
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
