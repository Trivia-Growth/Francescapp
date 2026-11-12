import { contratosRotas } from '../packages/contracts/src/rotas.ts';
import type { PaginaAuditoria } from '../packages/contracts/src/auditoria.ts';
import { erroRespostaSchema, sucessoRespostaSchema } from '../packages/contracts/src/comum.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };
export type FiltrosAuditoria = {
  limite?: number;
  cursor?: string;
  ator_id?: string;
  objeto_id?: string;
  paciente_id?: string;
  acao?: string;
  resultado?: 'permitido' | 'negado' | 'falhou';
  instante_de?: string;
  instante_ate?: string;
};

export type ServicoAuditoria = { consultar(filtros: FiltrosAuditoria): Promise<PaginaAuditoria> };

/** Serviço isolado da consulta de auditoria. Perfil, sessão e atestado continuam sendo
 * verificados no servidor e no banco: esconder a tela não é autorização. */
export function criarServicoAuditoriaHttp(
  identidadeAtual: () => Identidade | null,
): ServicoAuditoria {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  return {
    consultar: async (filtros) => {
      const rota = contratosRotas.consultarAuditoria;
      const corpo = rota.entrada.parse({ limite: filtros.limite ?? 25, ...semVazios(filtros) });
      const atual = identidadeAtual();
      if (
        !atual ||
        atual.usuario_id !== identidade.usuario_id ||
        atual.session_id !== identidade.session_id
      )
        throw new FalhaApi('nao_autenticado', 401);
      const parametros = new URLSearchParams();
      for (const [chave, valor] of Object.entries(corpo))
        if (valor !== undefined) parametros.set(chave, String(valor));
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
      try {
        const resposta = await fetch(`${rota.caminho}?${parametros.toString()}`, {
          method: 'GET',
          headers,
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: AbortSignal.timeout(20_000),
        });
        if (!resposta.headers.get('content-type')?.includes('application/json')) throw new Error();
        const envelope: unknown = await resposta.json();
        const depois = identidadeAtual();
        if (
          !depois ||
          depois.usuario_id !== identidade.usuario_id ||
          depois.session_id !== identidade.session_id
        )
          throw new FalhaApi('nao_autenticado', 401, true);
        if (!resposta.ok) {
          const erro = erroRespostaSchema.safeParse(envelope);
          if (!erro.success) throw new Error();
          throw new FalhaApi(erro.data.erro.codigo, resposta.status);
        }
        return sucessoRespostaSchema(rota.saida).parse(envelope).dados as PaginaAuditoria;
      } catch (erro) {
        if (erro instanceof FalhaApi) throw erro;
        throw new FalhaApi('servico_indisponivel');
      }
    },
  };
}

function semVazios(filtros: FiltrosAuditoria): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(filtros))
    if (chave !== 'limite' && valor !== undefined && valor !== '') saida[chave] = valor;
  return saida;
}
