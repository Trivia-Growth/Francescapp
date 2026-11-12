import {
  sucessoRespostaSchema,
  erroRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import {
  listaPreautorizacoesFamiliaresSchema,
  type cancelarPreautorizacaoFamiliarSchema,
} from '../packages/contracts/src/identidade.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.ts';
import type { ServicoPreautorizacoes } from './preautorizacoes-familiares.ts';
import type { z } from 'zod';

type Identidade = { usuario_id: string; session_id: string };
type Cancelamento = z.infer<typeof cancelarPreautorizacaoFamiliarSchema>;
const rota = '/api/admin/preautorizacoes-familiares';

/** Serviço isolado das pré-autorizações familiares. Autorização é do servidor; aqui
 * só conferimos que a identidade não trocou entre o começo e o fim da chamada. */
export function criarServicoPreautorizacoesHttp(
  identidadeAtual: () => Identidade | null,
): ServicoPreautorizacoes {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  const enviar = async (metodo: 'GET' | 'POST', caminho: string, corpo?: Cancelamento) => {
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
    if (metodo === 'POST') {
      headers.set('Content-Type', 'application/json');
      headers.set('x-chave-idempotencia', crypto.randomUUID());
    }
    let resposta: Response;
    try {
      resposta = await fetch(caminho, {
        method: metodo,
        headers,
        ...(metodo === 'GET' ? {} : { body: JSON.stringify(corpo) }),
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
        if (
          !erro.success ||
          (metodo === 'POST' && statusErroHttp[erro.data.erro.codigo] !== resposta.status)
        )
          throw new Error();
        throw new FalhaApi(erro.data.erro.codigo, resposta.status);
      }
      return envelope;
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi('servico_indisponivel');
    }
  };
  return {
    listar: async (pacienteId) => {
      const envelope = await enviar(
        'GET',
        `${rota}?paciente_id=${encodeURIComponent(uuidSchema.parse(pacienteId))}`,
      );
      return sucessoRespostaSchema(listaPreautorizacoesFamiliaresSchema).parse(envelope).dados
        .itens;
    },
    cancelar: async (entrada) => {
      await enviar('POST', rota, entrada);
    },
  };
}
