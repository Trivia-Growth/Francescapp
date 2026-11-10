import { createHmac } from 'node:crypto';
import { SignJWT } from 'jose';
import type { Pool } from 'pg';
import { expect, it } from 'vitest';
import { prepararComandoCriarPaciente } from '../../../packages/cadastro/src/preparar-paciente.ts';
import { criarAtestadorOperacao } from './atestado-operacao.ts';
import { criarCifraAutenticada } from './cifra-autenticada.ts';
import { criarExecutorPacientePostgresExperimental } from './paciente-postgres-experimental.ts';

const usuario = '61000000-0000-4000-8000-000000000001';
const sessao = '63000000-0000-4000-8000-000000000001';
const request = '64000000-0000-4000-8000-000000000001';
const chave = new Uint8Array(64).fill(9);
const config = {
  issuer: 'https://ficticio.supabase.co/auth/v1',
  audience: 'authenticated',
  algoritmosPermitidos: ['HS256'],
  chaveDeVerificacao: chave,
};
async function jwt(sub = usuario) {
  return new SignJWT({ session_id: sessao })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime('5m')
    .sign(chave);
}
/** Caso novo completo e fictício: todos os campos do contrato são obrigatórios. */
const casoNovo = {
  nome: 'Pessoa fictícia',
  nome_preferencia: 'Nome fictício',
  data_nascimento: '2000-01-01',
  contatos: [
    { tipo: 'email', valor: 'pessoa.ficticia@exemplo.test' },
    { tipo: 'telefone', valor: '+55 11 90000-0000' },
  ],
  situacao: 'entrada',
  responsavel_id: '65000000-0000-4000-8000-000000000001',
};
async function transporte() {
  return prepararComandoCriarPaciente(
    {
      corpo: casoNovo,
      cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
      reserva: { reserva_id: '68000000-0000-4000-8000-000000000001', geracao_reserva: 1 },
      contexto: {
        key_id: 'v1',
        usuario_id: usuario,
        session_id: sessao,
        request_id: request,
        emitido_em: '2026-10-29T12:00:00Z',
        expira_em: '2026-10-29T12:01:00Z',
      },
    },
    {
      cifra: criarCifraAutenticada({
        keyIdAtiva: 'teste',
        chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
        chaveHmac: new Uint8Array(32).fill(2),
      }),
      atestador: criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) }),
      idempotencia: {
        async calcularDigestIdempotencia(v: string) {
          return createHmac('sha256', Buffer.alloc(32, 4)).update(v).digest('base64url');
        },
      },
    },
  );
}
function poolFixture(comando = 'COMMIT', codigo = 'sem_permissao') {
  const consultas: string[] = [];
  let descarte: boolean | undefined;
  const pool = {
    options: { connectionTimeoutMillis: 2000, query_timeout: 15000 },
    async connect() {
      return {
        async query(sql: string) {
          consultas.push(sql);
          return {
            command: sql === 'COMMIT' ? comando : '',
            rows: sql.startsWith('select reserva_fixture.')
              ? [
                  {
                    resultado: {
                      ok: false,
                      request_id: request,
                      erro: { codigo },
                    },
                  },
                ]
              : [],
          };
        },
        release(valor: boolean) {
          descarte = valor;
        },
      };
    },
  } as unknown as Pool;
  return { pool, consultas, descarte: () => descarte };
}
it('nega resultado após ROLLBACK mesmo que SQL tenha respondido', async () => {
  const f = poolFixture('ROLLBACK');
  await expect(
    criarExecutorPacientePostgresExperimental(
      f.pool,
      config,
    )({ jwt: await jwt(), prova: 'A'.repeat(43), geracao: 1, transporte: await transporte() }),
  ).rejects.toMatchObject({ name: 'ResultadoPacientePostgresIncerto' });
  expect(f.descarte()).toBe(true);
});
it('confirma negativa somente após COMMIT e usa wrapper reservado', async () => {
  const f = poolFixture();
  expect(
    await criarExecutorPacientePostgresExperimental(
      f.pool,
      config,
    )({ jwt: await jwt(), prova: 'A'.repeat(43), geracao: 1, transporte: await transporte() }),
  ).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
  expect(
    f.consultas.some((sql) =>
      sql.startsWith('select reserva_fixture.criar_paciente_reservado_fixture('),
    ),
  ).toBe(true);
  expect(f.descarte()).toBe(false);
});
it('não conecta para JWT de outra pessoa', async () => {
  const f = poolFixture();
  await expect(
    criarExecutorPacientePostgresExperimental(
      f.pool,
      config,
    )({
      jwt: await jwt('61000000-0000-4000-8000-000000000002'),
      prova: 'A'.repeat(43),
      geracao: 1,
      transporte: await transporte(),
    }),
  ).rejects.toThrow();
  expect(f.consultas).toHaveLength(0);
});
it('devolve responsavel_invalido do banco somente após COMMIT, sem tratá-lo como incerto', async () => {
  const f = poolFixture('COMMIT', 'responsavel_invalido');
  expect(
    await criarExecutorPacientePostgresExperimental(
      f.pool,
      config,
    )({ jwt: await jwt(), prova: 'A'.repeat(43), geracao: 1, transporte: await transporte() }),
  ).toMatchObject({ ok: false, erro: { codigo: 'responsavel_invalido' } });
  expect(f.consultas).toContain('COMMIT');
  expect(f.descarte()).toBe(false);
});
it('não conecta quando o comando assinado não traz os campos do caso novo', async () => {
  for (const campo of ['contatos', 'situacao', 'responsavel_id', 'nome_preferencia']) {
    const f = poolFixture();
    const completo = await transporte();
    const { [campo]: _removido, ...entrada } = completo.p_entrada.entrada as Record<
      string,
      unknown
    >;
    await expect(
      criarExecutorPacientePostgresExperimental(
        f.pool,
        config,
      )({
        jwt: await jwt(),
        prova: 'A'.repeat(43),
        geracao: 1,
        transporte: { p_entrada: { ...completo.p_entrada, entrada } },
      }),
      `sem ${campo}`,
    ).rejects.toThrow('Cadastro indisponível.');
    expect(f.consultas, `sem ${campo}`).toHaveLength(0);
  }
});
