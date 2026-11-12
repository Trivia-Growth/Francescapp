import { contratosRotas } from '../packages/contracts/src/rotas.ts';
import type { RegraAtendimento } from '../packages/contracts/src/regras-atendimento.ts';
import { erroRespostaSchema, sucessoRespostaSchema } from '../packages/contracts/src/comum.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };

export type ServicoRegrasAtendimento = { consultar(): Promise<RegraAtendimento[]> };

/** Serviço da tela de regras (FR-041). Leitura para qualquer sessão autenticada; o banco
 * confere sessão e devolve só as chaves de exposição 'publica'. */
export function criarServicoRegrasAtendimentoHttp(
  identidadeAtual: () => Identidade | null,
): ServicoRegrasAtendimento {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  return {
    consultar: async () => {
      const rota = contratosRotas.consultarRegrasAtendimento;
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
      try {
        const resposta = await fetch(rota.caminho, {
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
        return sucessoRespostaSchema(rota.saida).parse(envelope).dados as RegraAtendimento[];
      } catch (erro) {
        if (erro instanceof FalhaApi) throw erro;
        throw new FalhaApi('servico_indisponivel');
      }
    },
  };
}
