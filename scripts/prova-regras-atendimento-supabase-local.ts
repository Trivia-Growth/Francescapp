/** Prova de ponta a ponta de `api.consultar_regras_atendimento` contra o **Supabase local**
 * (tarefas 0.2 e 2.3).
 *
 * Roda sob Deno, o runtime do isolate, e atravessa o **Supavisor em transaction mode**
 * (D8) quando `PROVA_PG_PORT` aponta para a porta do pooler. O atestado de operação é
 * gerado pelo mesmo `criarAtestadorOperacao` que o servidor usa, e verificado pela
 * `identidade.verificar_assinatura_atestado` do banco, que lê a chave do Vault. Nada aqui
 * é simulado: a RPC é a da migration, a chave é a do Vault local e a sessão é a das tabelas.
 *
 * Fixture: `scripts/fixture-regras-atendimento-supabase-local.sql`.
 * Positivos e negativos exercitados estão em `casos`, abaixo. */

import pg from 'pg';
import { criarAtestadorOperacao } from '../supabase/functions/_shared/atestado-operacao.ts';

const ambiente = (nome: string): string => {
  const valor = Deno.env.get(nome);
  if (!valor) throw new Error(`Variável ausente: ${nome}`);
  return valor;
};

const USUARIO = '10000000-0000-4000-8000-00000000f001';
const SESSAO = '20000000-0000-4000-8000-00000000f001';
const OUTRO_USUARIO = '10000000-0000-4000-8000-00000000f0ff';
const OPERACAO = 'api.consultar_regras_atendimento';

const atestador = criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(7) });

async function montarTransporte(opcoes: {
  usuario?: string;
  sessao?: string;
  operacao?: string;
  adulterarMac?: boolean;
  expirado?: boolean;
}) {
  const request_id = crypto.randomUUID();
  const agora = Date.now();
  const emitido = new Date(agora - (opcoes.expirado ? 60_000 : 1_000));
  const expira = new Date(emitido.getTime() + 20_000);
  const { atestado, entradaCanonica, dadosCanonicos } = await atestador.atestarEntrada(
    {
      key_id: 'teste',
      usuario_id: opcoes.usuario ?? USUARIO,
      session_id: opcoes.sessao ?? SESSAO,
      emitido_em: emitido.toISOString(),
      expira_em: expira.toISOString(),
      request_id,
      operacao: opcoes.operacao ?? OPERACAO,
    },
    { request_id },
  );
  const mac = opcoes.adulterarMac
    ? `${atestado.mac.slice(0, 42)}${atestado.mac.slice(42) === 'A' ? 'B' : 'A'}`
    : atestado.mac;
  return {
    entrada: { request_id, atestado: { ...atestado, mac } },
    entrada_canonica: entradaCanonica,
    dados_canonicos: dadosCanonicos,
  };
}

const conexao = {
  host: ambiente('PROVA_PG_HOST'),
  port: Number(ambiente('PROVA_PG_PORT')),
  database: ambiente('PROVA_PG_DB'),
  user: ambiente('PROVA_PG_USER'),
  password: ambiente('PROVA_PG_PASSWORD'),
  ssl: false as const,
  connectionTimeoutMillis: 5_000,
};

/** Uma invocação = uma conexão = uma transação, como no isolate em transaction mode. */
async function chamar(papel: string, claims: Record<string, unknown>, transporte: unknown) {
  const cliente = new pg.Client(conexao);
  await cliente.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query("SET LOCAL statement_timeout = '10s'");
    await cliente.query(`SET LOCAL ROLE "${papel}"`);
    await cliente.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims),
    ]);
    const resultado = await cliente.query<{ r: unknown }>(
      'select api.consultar_regras_atendimento($1::jsonb) as r',
      [JSON.stringify(transporte)],
    );
    await cliente.query('COMMIT');
    return { ok: true as const, corpo: resultado.rows[0]?.r };
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    return { ok: false as const, erro: String(erro) };
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

const claimsValidos = {
  sub: USUARIO,
  role: 'authenticated',
  session_id: SESSAO,
  aud: 'authenticated',
};

const falhas: string[] = [];
const registro: Record<string, unknown> = {};
const conferir = (nome: string, condicao: boolean, visto: unknown) => {
  registro[nome] = visto;
  if (!condicao) falhas.push(nome);
};

// POSITIVO: sessão viva, atestado íntegro, papel `authenticated`.
{
  const r = await chamar('authenticated', claimsValidos, await montarTransporte({}));
  const corpo = r.corpo as { ok?: boolean; dados?: Array<{ chave: string }> } | undefined;
  const chaves = (corpo?.dados ?? []).map((d) => d.chave).sort();
  conferir(
    'positivo_sessao_valida_le_regras_publicas',
    corpo?.ok === true &&
      [
        'ffcm.regras.canais',
        'ffcm.regras.diario',
        'ffcm.regras.funcionamento',
        'ffcm.regras.periodos',
      ].every((c) => chaves.includes(c)),
    { ok: corpo?.ok, chaves },
  );
  conferir(
    'positivo_nao_vaza_chave_de_exposicao_servidor',
    !chaves.includes('ffcm.prova.interruptor_fixture'),
    chaves.includes('ffcm.prova.interruptor_fixture'),
  );
}

// NEGATIVO: MAC adulterado — atestado inválido é `sem_permissao`, não exceção vazando detalhe.
{
  const r = await chamar(
    'authenticated',
    claimsValidos,
    await montarTransporte({ adulterarMac: true }),
  );
  const corpo = r.corpo as { ok?: boolean; erro?: { codigo?: string } } | undefined;
  conferir(
    'negativo_mac_adulterado',
    r.ok === false ? /SEM_PERMISSAO/.test(r.erro ?? '') : corpo?.ok === false,
    r.ok === false ? r.erro?.slice(0, 120) : corpo,
  );
}

// NEGATIVO: atestado emitido para OUTRA operação não vale nesta.
{
  const r = await chamar(
    'authenticated',
    claimsValidos,
    await montarTransporte({ operacao: 'api.listar_pacientes' }),
  );
  const corpo = r.corpo as { ok?: boolean } | undefined;
  conferir(
    'negativo_atestado_de_outra_operacao',
    r.ok === false ? /SEM_PERMISSAO/.test(r.erro ?? '') : corpo?.ok === false,
    r.ok === false ? r.erro?.slice(0, 120) : corpo,
  );
}

// NEGATIVO: atestado já expirado.
{
  const r = await chamar(
    'authenticated',
    claimsValidos,
    await montarTransporte({ expirado: true }),
  );
  const corpo = r.corpo as { ok?: boolean } | undefined;
  conferir(
    'negativo_atestado_expirado',
    r.ok === false ? /SEM_PERMISSAO/.test(r.erro ?? '') : corpo?.ok === false,
    r.ok === false ? r.erro?.slice(0, 120) : corpo,
  );
}

// NEGATIVO: atestado de outro usuário com a sessão de quem chama.
{
  const r = await chamar(
    'authenticated',
    claimsValidos,
    await montarTransporte({ usuario: OUTRO_USUARIO }),
  );
  const corpo = r.corpo as { ok?: boolean } | undefined;
  conferir(
    'negativo_atestado_de_outro_usuario',
    r.ok === false ? /SEM_PERMISSAO/.test(r.erro ?? '') : corpo?.ok === false,
    r.ok === false ? r.erro?.slice(0, 120) : corpo,
  );
}

// NEGATIVO: papel `anon` não pode nem executar o wrapper.
{
  const r = await chamar('anon', { ...claimsValidos, role: 'anon' }, await montarTransporte({}));
  conferir(
    'negativo_anon_sem_execute',
    r.ok === false && /permission denied|permissão negada/i.test(r.erro ?? ''),
    r.ok === false ? r.erro?.slice(0, 120) : r.corpo,
  );
}

// NEGATIVO: `service_role` também não.
{
  const r = await chamar(
    'service_role',
    { ...claimsValidos, role: 'service_role' },
    await montarTransporte({}),
  );
  conferir(
    'negativo_service_role_sem_execute',
    r.ok === false && /permission denied|permissão negada/i.test(r.erro ?? ''),
    r.ok === false ? r.erro?.slice(0, 120) : r.corpo,
  );
}

// NEGATIVO: sessão encerrada no banco deixa de autorizar, com o mesmo atestado íntegro.
{
  const administrativo = new pg.Client(conexao);
  await administrativo.connect();
  await administrativo.query(
    'update identidade.sessao set encerrada_em = clock_timestamp() where session_id = $1',
    [SESSAO],
  );
  await administrativo.end();
  const r = await chamar('authenticated', claimsValidos, await montarTransporte({}));
  const corpo = r.corpo as { ok?: boolean; erro?: { codigo?: string } } | undefined;
  conferir(
    'negativo_sessao_encerrada',
    corpo?.ok === false && corpo?.erro?.codigo === 'sem_permissao',
    r.ok === false ? r.erro?.slice(0, 120) : corpo,
  );
  const restaurar = new pg.Client(conexao);
  await restaurar.connect();
  await restaurar.query('update identidade.sessao set encerrada_em = null where session_id = $1', [
    SESSAO,
  ]);
  await restaurar.end();
}

// A trilha de auditoria precisa ter registrado permitido e negado.
{
  const auditor = new pg.Client(conexao);
  await auditor.connect();
  const linhas = await auditor.query<{ resultado: string; total: string }>(
    'select resultado, count(*)::text as total from auditoria.evento where acao = $1 group by resultado order by resultado',
    [OPERACAO],
  );
  await auditor.end();
  const porResultado = Object.fromEntries(
    linhas.rows.map((l: { resultado: string; total: string }) => [l.resultado, Number(l.total)]),
  );
  conferir(
    'auditoria_registrou_permitido_e_negado',
    (porResultado.permitido ?? 0) >= 1 && (porResultado.negado ?? 0) >= 1,
    porResultado,
  );
}

console.log(JSON.stringify({ falhas, registro }, null, 2));
if (falhas.length > 0) Deno.exit(1);
