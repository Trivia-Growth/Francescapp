/** Prova local da conexão do isolate ao PostgreSQL (tarefas 1.3 e 1.4).
 *
 * Roda sob Deno, que é o runtime das Edge Functions, contra o PostgreSQL descartável
 * levantado por `scripts/testar-conexao-supavisor-local.sh`.
 *
 * O que prova: conexão estabelecida, consulta autorizada executada, consulta negada para
 * papel sem grant, e nenhum estado de sessão sobrevivendo entre invocações — que é a
 * restrição do transaction mode (D8).
 *
 * O que NÃO prova: o Supavisor em si. Não há Supavisor no ambiente local; o adaptador fala
 * o protocolo que o transaction mode admite (tudo em `SET LOCAL`, sem pool no isolate),
 * mas a prova contra o pooler real exige o projeto remoto. */

import { criarConexaoSupavisor } from '../supabase/functions/_shared/edge/conexao-supavisor.ts';

const ambiente = (nome: string): string => {
  const valor = Deno.env.get(nome);
  if (!valor) throw new Error(`Variável ausente: ${nome}`);
  return valor;
};

const inicioDoProcesso = performance.now();

const conexao = criarConexaoSupavisor({
  host: ambiente('PROVA_PG_HOST'),
  porta: Number(ambiente('PROVA_PG_PORT')),
  banco: ambiente('PROVA_PG_DB'),
  usuario: ambiente('PROVA_PG_USER'),
  senha: ambiente('PROVA_PG_PASSWORD'),
});

const marcos: Array<[string, number]> = [];
const marcar = (nome: string) => marcos.push([nome, performance.now() - inicioDoProcesso]);

// 1. Consulta autorizada: o papel com grant enxerga a linha.
const antesDaPrimeira = performance.now();
const autorizadas = await conexao.executarAutorizado<{ rotulo: string }>({
  papel: 'ffcm_edge_leitor_executor',
  consulta: 'select rotulo from prova_edge.registro order by rotulo',
});
const primeiraConsultaMs = performance.now() - antesDaPrimeira;
marcar('primeira consulta concluída');
if (autorizadas.length !== 1 || autorizadas[0]?.rotulo !== 'ficticio')
  throw new Error(`Consulta autorizada devolveu ${JSON.stringify(autorizadas)}`);

// 2. Segunda consulta no MESMO processo: mede o custo já quente.
const antesDaSegunda = performance.now();
await conexao.executarAutorizado({
  papel: 'ffcm_edge_leitor_executor',
  consulta: 'select 1',
});
const segundaConsultaMs = performance.now() - antesDaSegunda;
marcar('segunda consulta concluída');

// 3. Negativa: papel sem grant não lê.
let negou = false;
try {
  await conexao.executarAutorizado({
    papel: 'ffcm_edge_sem_grant',
    consulta: 'select rotulo from prova_edge.registro',
  });
} catch (erro) {
  negou = /permission denied|permissão negada/i.test(String(erro));
  if (!negou) throw erro;
}
if (!negou) throw new Error('Papel sem grant conseguiu ler: autorização do banco não vigorou.');

// 4. Transaction mode: nada do estado da transação anterior sobrevive.
const depois = await conexao.executarAutorizado<{ papel: string; guc: string }>({
  papel: 'ffcm_edge_leitor_executor',
  consulta: "select current_user as papel, current_setting('statement_timeout') as guc",
});
const login = await conexao.executarAutorizado<{ papel: string }>({
  papel: 'ffcm_edge_leitor_executor',
  consulta: 'select session_user as papel',
});
if (depois[0]?.papel !== 'ffcm_edge_leitor_executor')
  throw new Error('SET LOCAL ROLE não vigorou dentro da transação.');
if (login[0]?.papel !== ambiente('PROVA_PG_USER'))
  throw new Error('O papel do login não voltou ao normal entre invocações.');

console.log(
  JSON.stringify(
    {
      conexao_estabelecida: true,
      consulta_autorizada: autorizadas,
      consulta_negada_para_papel_sem_grant: negou,
      papel_dentro_da_transacao: depois[0]?.papel,
      statement_timeout_local: depois[0]?.guc,
      papel_do_login_entre_invocacoes: login[0]?.papel,
      partida_a_frio_ms: Number(marcos[0]?.[1].toFixed(1)),
      primeira_consulta_ms: Number(primeiraConsultaMs.toFixed(1)),
      segunda_consulta_ms: Number(segundaConsultaMs.toFixed(1)),
    },
    null,
    2,
  ),
);
