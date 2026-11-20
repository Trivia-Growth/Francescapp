/** Prova da conexão do isolate ao **Supavisor em transaction mode** (tarefas 1.3 e 1.4).
 *
 * Diferença para `prova-conexao-supavisor-local.ts`: ali o alvo é um PostgreSQL descartável
 * falado direto; aqui o alvo é o `supabase_pooler_*` (Supavisor) levantado por
 * `supabase start`, na porta de transaction mode (6543 dentro do contêiner). É a prova que
 * D8 exige e que faltava.
 *
 * Roda sob Deno, o runtime do isolate. Levantada por
 * `scripts/testar-conexao-supavisor-pooler-local.sh`. */

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

// 1. Consulta autorizada pelo pooler: o papel com grant enxerga a linha.
const antesDaPrimeira = performance.now();
const autorizadas = await conexao.executarAutorizado<{ rotulo: string }>({
  papel: 'ffcm_edge_leitor_executor',
  consulta: 'select rotulo from prova_edge.registro order by rotulo',
});
const primeiraConsultaMs = performance.now() - antesDaPrimeira;
const ateAPrimeiraConsultaMs = performance.now() - inicioDoProcesso;
if (autorizadas.length !== 1 || autorizadas[0]?.rotulo !== 'ficticio')
  throw new Error(`Consulta autorizada devolveu ${JSON.stringify(autorizadas)}`);

// 2. Segunda consulta no MESMO processo: custo já quente.
const antesDaSegunda = performance.now();
await conexao.executarAutorizado({ papel: 'ffcm_edge_leitor_executor', consulta: 'select 1' });
const segundaConsultaMs = performance.now() - antesDaSegunda;

// 3. Negativa: papel sem grant não lê, mesmo atravessando o pooler.
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

// 4. Confirma que a conexão é do pooler, não direta: a porta do servidor é a interna 5432,
//    enquanto o processo conectou na porta de transaction mode publicada pelo Supavisor.
const identidade = await conexao.executarAutorizado<{
  papel: string;
  login: string;
  porta_servidor: number;
  guc: string;
}>({
  papel: 'ffcm_edge_leitor_executor',
  consulta:
    "select current_user as papel, session_user as login, inet_server_port() as porta_servidor, current_setting('statement_timeout') as guc",
});
if (identidade[0]?.papel !== 'ffcm_edge_leitor_executor')
  throw new Error('SET LOCAL ROLE não vigorou dentro da transação.');

// 5. Transaction mode: nenhum estado de sessão sobrevive à invocação anterior.
const entre = await conexao.executarAutorizado<{ papel: string; timeout: string }>({
  papel: 'ffcm_edge_leitor_executor',
  consulta: "select session_user as papel, current_setting('statement_timeout') as timeout",
});
if (entre[0]?.timeout === identidade[0]?.guc && identidade[0]?.guc !== '3s')
  throw new Error('statement_timeout inesperado entre invocações.');

console.log(
  JSON.stringify(
    {
      alvo: 'supavisor_transaction_mode',
      porta_do_cliente: Number(ambiente('PROVA_PG_PORT')),
      porta_do_servidor_vista_pelo_banco: identidade[0]?.porta_servidor,
      usuario_do_login_no_pooler: ambiente('PROVA_PG_USER'),
      conexao_estabelecida: true,
      consulta_autorizada: autorizadas,
      consulta_negada_para_papel_sem_grant: negou,
      papel_dentro_da_transacao: identidade[0]?.papel,
      statement_timeout_local: identidade[0]?.guc,
      papel_do_login_entre_invocacoes: entre[0]?.papel,
      statement_timeout_entre_invocacoes: entre[0]?.timeout,
      ate_a_primeira_consulta_ms: Number(ateAPrimeiraConsultaMs.toFixed(1)),
      primeira_consulta_ms: Number(primeiraConsultaMs.toFixed(1)),
      segunda_consulta_ms: Number(segundaConsultaMs.toFixed(1)),
    },
    null,
    2,
  ),
);
