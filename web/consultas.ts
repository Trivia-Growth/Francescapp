import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { aoEsquecerSessao } from './api.ts';

/** O cache de LEITURAS da aplicação (decisão 2 do plano visual de 27/11/2026: TanStack
 *  Query só para leituras, em lugar da camada própria do PLANO tópico 8). Envios continuam
 *  nas máquinas de cada tela, com chave de idempotência; aqui só se guarda o que foi lido.
 *
 *  Usam este módulo os catálogos administrados (Estado emocional, piloto; Papéis declarados
 *  e Modelo da ficha de plantão, fatia 9a), e Equipe, Plano de cuidado e Auditoria (fatia
 *  9b, com política própria). Ele é carregado com a tela, não na abertura, e se registra em
 *  `api.ts` para ser esquecido junto com a sessão.
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

/** Uma leitura guardada por identidade, no formato que a máquina dos catálogos usa
 *  (`LeituraRetida` em `telas/catalogo-administrado.tsx`).
 *
 *  `consultar` sempre vai ao servidor (`staleTime: 0`) — é o que Atualizar, salvar e
 *  repetir chamam —, mas consultas simultâneas da mesma chave viram um GET só. `retida`
 *  devolve o que a identidade já leu, e `descartar` esquece a entrada (recusa de acesso).
 *
 *  Políticas de retenção (a entrada some sempre antes com a identidade):
 *  - catálogos de vocabulário: 5 min desde a última leitura (`gcTime` padrão); a volta
 *    não relê;
 *  - Equipe e Plano de cuidado: 60 s; a volta mostra o guardado e relê em seguida;
 *  - Auditoria: `gcTime: 0`, nada guardado, só a consulta em voo é compartilhada. */
export function leituraPorSessao<D>(
  identidade: IdentidadeConsulta,
  recurso: readonly string[],
  consultar: () => Promise<D>,
  /** Quanto a entrada sobrevive depois da última leitura. Equipe e Plano de cuidado
   *  usam 60 s (decisão da fatia 9b); `0` não guarda nada além da consulta em voo. */
  gcTime?: number,
) {
  const queryKey = chaveDaSessao(identidade, ...recurso);
  return {
    consultar: () =>
      clienteConsultas.fetchQuery({
        queryKey,
        queryFn: consultar,
        staleTime: 0,
        ...(gcTime === undefined ? {} : { gcTime }),
      }),
    leitura: {
      retida: () => clienteConsultas.getQueryData<D>(queryKey),
      descartar: () => clienteConsultas.removeQueries({ queryKey, exact: true }),
    },
  };
}

/** A chave da primeira página da Equipe (`concessao-equipe.tsx`), descartada por
 *  `convidar-equipe.tsx` depois de cada convite. */
export const RECURSO_EQUIPE = ['admin', 'equipe'] as const;

/** Esquece uma leitura desta identidade: chamada depois de uma escrita que a envelhece. */
export function descartarLeitura(identidade: IdentidadeConsulta, ...recurso: string[]): void {
  clienteConsultas.removeQueries({ queryKey: chaveDaSessao(identidade, ...recurso), exact: true });
}

aoEsquecerSessao(esquecerConsultas);
