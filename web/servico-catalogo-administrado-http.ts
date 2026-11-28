import { z } from 'zod';
import {
  campoExtraCatalogoGeneralizadoSchema,
  gravarCampoExtraEscopoSchema,
  ordenarModelo,
  type CampoExtraCatalogoGeneralizado,
  type EscopoCampoExtra,
  type GravarCampoExtraEscopo,
} from '../packages/contracts/src/campo-extra-catalogo.ts';
import {
  gravarPapelDeclaradoSchema,
  papelDeclaradoSchema,
  type GravarPapelDeclarado,
  type PapelDeclarado,
} from '../packages/contracts/src/papel-declarado.ts';
import {
  estadoEmocionalSchema,
  gravarEstadoEmocionalSchema,
  type EstadoEmocional,
  type GravarEstadoEmocional,
} from '../packages/contracts/src/estado-emocional.ts';
import {
  erroRespostaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };

/** A identidade que criou o serviço; é dela, e só dela, a chave do cache de leitura
 *  (`web/consultas.ts`). Quem só lê o catálogo para preencher a ficha não precisa dela. */
export type ComIdentidade = { identidade: Identidade };

/** Catálogos administrados pelo Administrador: o modelo da ficha de plantão (FR-078), os
 * papéis declarados (FR-079) e os termos de estado emocional observado (FR-076/FR-081). Os
 * três têm a mesma forma — ler a lista, gravar um item sob versão esperada —, por isso um
 * módulo só. A autorização continua sendo decidida no
 * servidor e no banco; aqui não há nenhuma decisão de acesso. */
async function enviar(
  identidadeAtual: () => Identidade | null,
  identidade: Identidade,
  pedido: {
    metodo: 'GET' | 'POST';
    caminho: string;
    saida: z.ZodType;
    corpo?: unknown;
    chave?: string;
  },
): Promise<unknown> {
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
  if (pedido.chave) headers.set('x-chave-idempotencia', uuidSchema.parse(pedido.chave));
  if (pedido.metodo !== 'GET') headers.set('Content-Type', 'application/json');
  try {
    const resposta = await fetch(pedido.caminho, {
      method: pedido.metodo,
      headers,
      ...(pedido.metodo === 'GET' ? {} : { body: JSON.stringify(pedido.corpo) }),
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(20_000),
    });
    if (pedido.metodo !== 'GET' && resposta.status === 202) throw new Error();
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
      throw new FalhaApi('nao_autenticado', pedido.metodo === 'GET' ? 401 : 0, true);
    if (!resposta.ok) {
      const erro = erroRespostaSchema.safeParse(envelope);
      if (
        !erro.success ||
        (pedido.metodo !== 'GET' && statusErroHttp[erro.data.erro.codigo] !== resposta.status)
      )
        throw new Error();
      throw new FalhaApi(erro.data.erro.codigo, resposta.status);
    }
    return sucessoRespostaSchema(pedido.saida).parse(envelope).dados;
  } catch (erro) {
    if (erro instanceof FalhaApi) throw erro;
    throw new FalhaApi('servico_indisponivel');
  }
}

export type ServicoModeloFormulario = {
  consultar(): Promise<CampoExtraCatalogoGeneralizado[]>;
  gravar(entrada: GravarCampoExtraEscopo, chave: string): Promise<void>;
};

export function criarServicoModeloFormularioHttp(
  identidadeAtual: () => Identidade | null,
  escopo: EscopoCampoExtra,
): ServicoModeloFormulario & ComIdentidade {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  return {
    identidade,
    consultar: async () =>
      ordenarModelo(
        (await enviar(identidadeAtual, identidade, {
          metodo: 'GET',
          caminho: `/api/admin/campo-extra-plano?escopo=${encodeURIComponent(escopo)}`,
          saida: z.array(campoExtraCatalogoGeneralizadoSchema),
        })) as CampoExtraCatalogoGeneralizado[],
      ),
    gravar: async (entrada, chave) => {
      await enviar(identidadeAtual, identidade, {
        metodo: 'POST',
        caminho: '/api/admin/campo-extra-plano',
        saida: campoExtraCatalogoGeneralizadoSchema,
        corpo: gravarCampoExtraEscopoSchema.parse({ ...entrada, escopo }),
        chave,
      });
    },
  };
}

export type ServicoPapelDeclarado = {
  consultar(): Promise<PapelDeclarado[]>;
  gravar(entrada: GravarPapelDeclarado, chave: string): Promise<void>;
};

export function criarServicoPapelDeclaradoHttp(
  identidadeAtual: () => Identidade | null,
): ServicoPapelDeclarado & ComIdentidade {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  return {
    identidade,
    consultar: async () =>
      (
        (await enviar(identidadeAtual, identidade, {
          metodo: 'GET',
          caminho: '/api/admin/papel-declarado',
          saida: z.array(papelDeclaradoSchema),
        })) as PapelDeclarado[]
      )
        .slice()
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    gravar: async (entrada, chave) => {
      await enviar(identidadeAtual, identidade, {
        metodo: 'POST',
        caminho: '/api/admin/papel-declarado',
        saida: papelDeclaradoSchema,
        corpo: gravarPapelDeclaradoSchema.parse(entrada),
        chave,
      });
    },
  };
}

export type ServicoEstadoEmocional = ComIdentidade & {
  consultar(): Promise<EstadoEmocional[]>;
  gravar(entrada: GravarEstadoEmocional, chave: string): Promise<void>;
};

/** Ordenação alfabética, JAMAIS por gravidade: a lista é vocabulário de observação e não
 * admite escala (FR-076/FR-081). */
export function criarServicoEstadoEmocionalHttp(
  identidadeAtual: () => Identidade | null,
): ServicoEstadoEmocional {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  return {
    identidade,
    consultar: async () =>
      (
        (await enviar(identidadeAtual, identidade, {
          metodo: 'GET',
          caminho: '/api/admin/estado-emocional',
          saida: z.array(estadoEmocionalSchema),
        })) as EstadoEmocional[]
      )
        .slice()
        .sort((a, b) => a.estado.localeCompare(b.estado, 'pt-BR')),
    gravar: async (entrada, chave) => {
      await enviar(identidadeAtual, identidade, {
        metodo: 'POST',
        caminho: '/api/admin/estado-emocional',
        saida: estadoEmocionalSchema,
        corpo: gravarEstadoEmocionalSchema.parse(entrada),
        chave,
      });
    },
  };
}
