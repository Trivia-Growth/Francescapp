/** Função Edge mínima para medir a **partida a frio do Edge Runtime do Supabase** (tarefa 1.4).
 *
 * Não vive em `supabase/functions/`: é instrumento de medição, não rota de domínio. O
 * roteiro `scripts/medir-partida-frio-edge.sh` a copia para o projeto local antes de medir.
 *
 * `inicioDoModulo` é avaliado quando o isolate carrega o módulo — isto é, na partida a frio.
 * A resposta devolve quanto tempo passou entre esse instante e o atendimento da requisição,
 * e quantas requisições este isolate já atendeu. Um isolate novo responde `atendidas: 1`. */

const inicioDoModulo = performance.now();
const nascido = new Date().toISOString();
let atendidas = 0;

Deno.serve((_requisicao: Request) => {
  atendidas += 1;
  return new Response(
    JSON.stringify({
      atendidas,
      isolate_nascido_em: nascido,
      ms_desde_o_carregamento_do_modulo: Number((performance.now() - inicioDoModulo).toFixed(1)),
    }),
    { headers: { 'content-type': 'application/json' } },
  );
});
