/** Prova de paridade do lote 1 entre a plataforma antiga e as Edge Functions publicadas.
 *
 * Lado antigo: o próprio módulo de rota de `netlify/functions/<rota>.ts`, executado neste
 * processo com o mesmo ambiente. Lado novo: a Edge Function publicada, chamada por HTTP.
 * Nada é simulado do lado novo — é a plataforma real respondendo.
 *
 * Compara status, corpo (com `request_id` normalizado, que é aleatório por resposta) e os
 * cabeçalhos que a rota emite. Cabeçalhos acrescentados pela plataforma são listados à
 * parte, porque são achado, não falha da composição.
 *
 * Variáveis: FFCM_EDGE_BASE (origem das Edge Functions) e FFCM_EDGE_INVOCACAO (credencial
 * de invocação). Nenhuma das duas é impressa. */

import { casarCaminho } from '../supabase/functions/_shared/edge/caminho-edge.ts';
import { tabelaEncaminhamentoApi } from '../netlify/functions/_shared/encaminhamento-api.ts';
import configuracaoSistema from '../netlify/functions/configuracao-sistema.ts';
import regrasAtendimento from '../netlify/functions/regras-atendimento.ts';
import auditoria from '../netlify/functions/auditoria.ts';
import preautorizacoesFamiliares from '../netlify/functions/preautorizacoes-familiares.ts';
import solicitacoesTitular from '../netlify/functions/solicitacoes-titular.ts';

type Caso = Readonly<{
  funcao: string;
  caminho: string;
  metodo: string;
  cabecalhos?: Readonly<Record<string, string>>;
  corpo?: string;
  antiga: (request: Request) => Promise<Response>;
}>;

const base = Deno.env.get('FFCM_EDGE_BASE') ?? '';
const invocacao = Deno.env.get('FFCM_EDGE_INVOCACAO') ?? '';
if (!base || !invocacao) {
  console.error('FFCM_EDGE_BASE e FFCM_EDGE_INVOCACAO são obrigatórios.');
  Deno.exit(2);
}

const sessaoFicticia = '11111111-1111-4111-8111-111111111111';
const outraSessaoFicticia = '22222222-2222-4222-8222-222222222222';

const casos: readonly Caso[] = [
  {
    funcao: 'configuracao-sistema',
    caminho: '/api/admin/configuracao-sistema',
    metodo: 'GET',
    antiga: configuracaoSistema,
  },
  {
    funcao: 'regras-atendimento',
    caminho: '/api/regras-atendimento',
    metodo: 'GET',
    antiga: regrasAtendimento,
  },
  { funcao: 'auditoria', caminho: '/api/admin/auditoria', metodo: 'GET', antiga: auditoria },
  {
    funcao: 'preautorizacoes-familiares',
    caminho: '/api/admin/preautorizacoes-familiares',
    metodo: 'GET',
    antiga: preautorizacoesFamiliares,
  },
  {
    funcao: 'solicitacoes-titular',
    caminho: '/api/admin/solicitacoes-titular',
    metodo: 'GET',
    antiga: solicitacoesTitular,
  },
];

/** Variações de identidade: ausência de sessão, sessão malformada, sessão de outro perfil,
 * e um caminho que não é o da rota. A rota tem de responder a mesma coisa nas duas
 * plataformas em todas elas. */
const variacoes: readonly Readonly<{
  nome: string;
  cabecalhos?: Record<string, string>;
  sufixo?: string;
  metodo?: string;
}>[] = [
  { nome: 'sem sessão' },
  { nome: 'sessão malformada', cabecalhos: { 'x-sessao': 'nao-e-uuid' } },
  { nome: 'sessão de outro perfil', cabecalhos: { 'x-sessao': outraSessaoFicticia } },
  { nome: 'sessão fictícia viva', cabecalhos: { 'x-sessao': sessaoFicticia } },
  { nome: 'método não previsto', metodo: 'DELETE' },
];

const cabecalhosDeRota = [
  'cache-control',
  'x-content-type-options',
  'referrer-policy',
  'content-type',
];

function normalizar(texto: string): string {
  return texto.replace(/"request_id":"[0-9a-f-]{36}"/g, '"request_id":"<uuid>"');
}

function extrair(headers: Headers): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const nome of cabecalhosDeRota) {
    const valor = headers.get(nome);
    if (valor !== null) saida[nome] = valor;
  }
  return saida;
}

function acrescentados(nova: Headers): string[] {
  const conhecidos = new Set([
    ...cabecalhosDeRota,
    'date',
    'content-length',
    'vary',
    'server',
    'alt-svc',
  ]);
  return [...nova.keys()].filter((nome) => !conhecidos.has(nome)).sort();
}

/** O sufixo desconhecido é o único ponto em que as duas plataformas divergem por
 * construção, e a divergência não é observável pelo cliente: na Netlify o roteamento é da
 * plataforma (`config.path`), e um caminho que não casa nunca chega à função; na Edge o
 * roteamento é da própria função, que responde `nao_encontrado`. O proxy casa o caminho
 * contra a tabela ANTES de encaminhar, logo um caminho fora da tabela continua sendo
 * respondido pela Netlify e nunca alcança a Edge Function. Isto é provado, não suposto. */
const sufixosDesconhecidos = casos.map((caso) => `${caso.caminho}/inexistente`);
const padroes = tabelaEncaminhamentoApi.map((rota) => rota.padrao);
const roteamento = sufixosDesconhecidos.map((caminho) => ({
  caminho,
  casa_na_tabela_do_proxy: casarCaminho(padroes, caminho) !== null,
}));

const falhas: string[] = [];
const registro: unknown[] = [];
const acrescentadosVistos = new Set<string>();

for (const caso of casos) {
  for (const variacao of variacoes) {
    const metodo = variacao.metodo ?? caso.metodo;
    const caminho = `${caso.caminho}${variacao.sufixo ?? ''}`;
    const cabecalhos = { ...(caso.cabecalhos ?? {}), ...(variacao.cabecalhos ?? {}) };

    const respostaAntiga = await caso.antiga(
      new Request(`https://app.exemplo/${caminho.slice(1)}`, {
        method: metodo,
        headers: cabecalhos,
      }),
    );
    const corpoAntigo = normalizar(await respostaAntiga.text());

    const inicio = performance.now();
    const respostaNova = await fetch(`${base}/functions/v1/${caso.funcao}${caminho}`, {
      method: metodo,
      headers: { ...cabecalhos, authorization: `Bearer ${invocacao}` },
    });
    const corpoNovo = normalizar(await respostaNova.text());
    const ms = Math.round((performance.now() - inicio) * 10) / 10;

    const cabAntigos = extrair(respostaAntiga.headers);
    const cabNovos = extrair(respostaNova.headers);
    for (const nome of acrescentados(respostaNova.headers)) acrescentadosVistos.add(nome);

    const rotulo = `${caso.funcao} ${metodo} ${caminho} [${variacao.nome}]`;
    if (respostaAntiga.status !== respostaNova.status)
      falhas.push(`${rotulo}: status ${respostaAntiga.status} != ${respostaNova.status}`);
    if (corpoAntigo !== corpoNovo) falhas.push(`${rotulo}: corpo ${corpoAntigo} != ${corpoNovo}`);
    if (JSON.stringify(cabAntigos) !== JSON.stringify(cabNovos))
      falhas.push(
        `${rotulo}: cabeçalho ${JSON.stringify(cabAntigos)} != ${JSON.stringify(cabNovos)}`,
      );

    registro.push({
      caso: rotulo,
      status: respostaNova.status,
      status_antigo: respostaAntiga.status,
      corpo: corpoNovo,
      cabecalhos_de_rota: cabNovos,
      ms_edge: ms,
    });
  }
}

for (const linha of roteamento)
  if (linha.casa_na_tabela_do_proxy)
    falhas.push(`${linha.caminho}: o proxy encaminharia um sufixo desconhecido`);

console.log(
  JSON.stringify(
    {
      casos: registro,
      cabecalhos_acrescentados_pela_plataforma: [...acrescentadosVistos].sort(),
      sufixo_desconhecido_nao_atravessa_o_proxy: roteamento,
      falhas,
    },
    null,
    2,
  ),
);
Deno.exit(falhas.length === 0 ? 0 : 1);
