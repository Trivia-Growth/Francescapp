import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { verificarAlvoBootstrap } from './verificar-alvo-bootstrap.mjs';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const dados = {
  projetoRef: 'abcdefghijklmnopqrst',
  projetoRefConfirmado: 'abcdefghijklmnopqrst',
  uuidAuth: '51000000-0000-4000-8000-000000000001',
  email: 'fixture@example.test',
  token: 'segredo-ficticio',
};
const resposta = (value, ok = true) => ({ ok, json: async () => value });

test('verifica projeto e vínculo por consulta parametrizada somente de leitura', async () => {
  const chamadas = [];
  globalThis.fetch = async (...args) => {
    chamadas.push(args);
    return chamadas.length === 1
      ? resposta({ ref: dados.projetoRef })
      : resposta([{ corresponde: true }]);
  };
  await verificarAlvoBootstrap(dados);
  assert.equal(chamadas.length, 2);
  assert.match(chamadas[1][0], /\/database\/query\/read-only$/);
  const corpo = JSON.parse(chamadas[1][1].body);
  assert.deepEqual(corpo.parameters, [dados.uuidAuth, dados.email]);
  assert.equal(corpo.query.includes(dados.email), false);
  assert.equal(chamadas[1][1].redirect, 'error');
});

test('rejeita alvo divergente antes de qualquer acesso e falha fechado em resposta inválida', async () => {
  let chamadas = 0;
  globalThis.fetch = async () => {
    chamadas++;
    return chamadas === 1
      ? resposta({ ref: dados.projetoRef })
      : resposta([{ corresponde: false }]);
  };
  await assert.rejects(verificarAlvoBootstrap({ ...dados, projetoRefConfirmado: 'outro' }));
  assert.equal(chamadas, 0);
  await assert.rejects(verificarAlvoBootstrap(dados), /Não foi possível confirmar/);
});

test('não expõe erros, dados nem token em falha de permissão ou rede', async () => {
  globalThis.fetch = async () => {
    throw new Error(`${dados.token} ${dados.email}`);
  };
  await assert.rejects(
    verificarAlvoBootstrap(dados),
    (erro) => !erro.message.includes(dados.token) && !erro.message.includes(dados.email),
  );
  let chamadas = 0;
  globalThis.fetch = async () =>
    ++chamadas === 1 ? resposta({ ref: dados.projetoRef }) : resposta({}, false);
  await assert.rejects(verificarAlvoBootstrap(dados), /Não foi possível confirmar/);
});
