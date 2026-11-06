import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arquivoPrivado, prepararBootstrap } from './preparar-bootstrap-tecnico.mjs';

const ref = 'abcdefghijklmnopqrst';
const entrada = {
  projetoRef: ref,
  projetoRefConfirmado: ref,
  uuidAuth: '11111111-1111-4111-8111-111111111111',
  concessaoId: '22222222-2222-4222-8222-222222222222',
  requestId: '33333333-3333-4333-8333-333333333333',
  email: 'fixture@example.test',
  token: 'fixture',
  motivo: 'fixture',
  keyId: 'fixture',
  referenciaCifra: 'ffcmapp.cifra.fixture',
  arquivo: '/tmp/fixture-bootstrap',
  conexao: { host: `db.${ref}.supabase.co`, usuario: 'operador' },
};

test('arquivo privado preserva o envelope original na repetição', async () => {
  const pasta = await mkdtemp(join(tmpdir(), 'bootstrap-teste-'));
  const caminho = join(pasta, 'envelope.json');
  try {
    const primeiro = { ciphertext: 'fixture' };
    assert.deepEqual(await arquivoPrivado(caminho, primeiro), primeiro);
    assert.equal((await stat(caminho)).mode & 0o777, 0o600);
    assert.deepEqual(await arquivoPrivado(caminho, { ciphertext: 'outro' }), primeiro);
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
});

test('prévia consulta API sem abrir SQL e confirmação incorreta falha', async () => {
  const anterior = globalThis.fetch;
  let chamadas = 0;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => (++chamadas % 2 ? { ref } : [{ corresponde: true }]),
  });
  try {
    assert.match(await prepararBootstrap(entrada), /nenhuma conexão SQL/);
    await assert.rejects(prepararBootstrap({ ...entrada, confirmacao: 'sim' }));
    await assert.rejects(
      prepararBootstrap({
        ...entrada,
        conexao: { ...entrada.conexao, host: 'outro.example.test' },
      }),
    );
    assert.equal(chamadas, 4);
  } finally {
    globalThis.fetch = anterior;
  }
});
