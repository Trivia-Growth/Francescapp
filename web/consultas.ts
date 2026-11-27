import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { aoEsquecerSessao } from './api.ts';

/** O cache de LEITURAS da aplicação (decisão 2 do plano visual de 27/11/2026: TanStack
 *  Query só para leituras, em lugar da camada própria do PLANO tópico 8). Envios continuam
 *  nas máquinas de cada tela, com chave de idempotência; aqui só se guarda o que foi lido.
 *
 *  Piloto: só o catálogo Estado emocional usa este módulo. Ele é carregado com a tela, não
 *  na abertura, e se registra em `api.ts` para ser esquecido junto com a sessão.
 *
 *  O controle de segurança é o descarte por identidade, em três camadas:
 *  1. a chave começa SEMPRE pela conta e pela sessão (`chaveDaSessao`), então uma conta
 *     nunca encontra a entrada da outra;
 *  2. pedir chave de outra identidade apaga o cache inteiro antes de devolver a chave;
 *  3. `ClienteFFCM.limpar()` (revogação, novo acesso, fim da saída) e o início de `sair`
 *     chamam `clear()`, que também cancela as consultas em voo — a resposta atrasada da
 *     conta anterior cai numa consulta que não está mais no cache.
 *
 *  Nada vai para disco: não há persistência, de propósito. */
export const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      // Recusa de acesso não se repete: 401/403 derrubam a tela na hora.
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

export type IdentidadeConsulta = { usuario_id: string; session_id: string };

let dono: string | null = null;

export function esquecerConsultas(): void {
  dono = null;
  clienteConsultas.clear();
}

/** A chave de um recurso lido por esta identidade. Mudou a identidade, o cache da
 *  anterior é apagado antes — inclusive o que ainda estava em voo. */
export function chaveDaSessao(identidade: IdentidadeConsulta, ...recurso: string[]): QueryKey {
  const atual = `${identidade.usuario_id}|${identidade.session_id}`;
  if (dono !== atual) {
    clienteConsultas.clear();
    dono = atual;
  }
  return ['sessao', identidade.usuario_id, identidade.session_id, ...recurso];
}

aoEsquecerSessao(esquecerConsultas);
