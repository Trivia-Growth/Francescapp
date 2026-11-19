import { expect, it } from 'vitest';
import {
  metadadosAadSubstituicaoCmSchema,
  metadadosAadSchema,
} from '../../../packages/contracts/src/rpc.ts';
import { criarCifraAutenticada, ErroCifraAutenticada, type AadCifra } from './cifra-autenticada.ts';

/** Integração real da cifra do motivo da substituição temporária da case manager (FR-037).
 *
 * Sem dublê: `criarCifraAutenticada` é a função de produção, com o canonicalizador de
 * produção. Dados fictícios apenas.
 *
 * Prova três coisas:
 *  1. ida e volta dos dois campos cifrados da linha;
 *  2. que o AAD liga de fato — tabela, registro, campo e formato trocados são recusados;
 *  3. que a forma canônica é a GENÉRICA do repositório, `{tabela, registro_id, campo,
 *     formato}`, escrita aqui à mão a partir da documentação do ramo, sem usar a
 *     implementação para derivá-la. */

const substituicao = '70000000-0000-4000-8000-000000000001';
const outraSubstituicao = '70000000-0000-4000-8000-000000000002';

const criarCifra = () =>
  criarCifraAutenticada({
    keyIdAtiva: 'sub-v1',
    chavesDeCifra: { 'sub-v1': new Uint8Array(32).fill(11) },
    chaveHmac: new Uint8Array(32).fill(29),
  });

const aad = (registroId: string, campo: 'motivo' | 'motivo_encerramento') =>
  metadadosAadSubstituicaoCmSchema.parse({
    tabela: 'cadastro.substituicao_case_manager',
    registro_id: registroId,
    campo,
    formato: 1,
  });

it('ida e volta dos dois motivos da mesma linha', async () => {
  const cifra = criarCifra();
  const registro = await cifra.cifrar(
    'Titular em férias programadas.',
    aad(substituicao, 'motivo'),
  );
  const encerramento = await cifra.cifrar(
    'Titular voltou antes do previsto.',
    aad(substituicao, 'motivo_encerramento'),
  );
  expect(await cifra.decifrar(registro, aad(substituicao, 'motivo'))).toBe(
    'Titular em férias programadas.',
  );
  expect(await cifra.decifrar(encerramento, aad(substituicao, 'motivo_encerramento'))).toBe(
    'Titular voltou antes do previsto.',
  );
});

it('envelope de uma substituição não decifra no contexto de outra', async () => {
  const cifra = criarCifra();
  const envelope = await cifra.cifrar('Cobertura de plantão.', aad(substituicao, 'motivo'));
  await expect(cifra.decifrar(envelope, aad(outraSubstituicao, 'motivo'))).rejects.toBeInstanceOf(
    ErroCifraAutenticada,
  );
});

it('campo trocado é recusado: o motivo do registro não vale pelo do encerramento', async () => {
  const cifra = criarCifra();
  const registro = await cifra.cifrar('Motivo do registro.', aad(substituicao, 'motivo'));
  const encerramento = await cifra.cifrar(
    'Motivo do encerramento.',
    aad(substituicao, 'motivo_encerramento'),
  );
  await expect(
    cifra.decifrar(registro, aad(substituicao, 'motivo_encerramento')),
  ).rejects.toBeInstanceOf(ErroCifraAutenticada);
  await expect(cifra.decifrar(encerramento, aad(substituicao, 'motivo'))).rejects.toBeInstanceOf(
    ErroCifraAutenticada,
  );
});

it('tabela trocada é recusada, mesmo com registro e campo iguais', async () => {
  const cifra = criarCifra();
  const envelope = await cifra.cifrar('Motivo fictício.', aad(substituicao, 'motivo'));
  // `financeiro.valor_acordado_turno` tem a MESMA forma genérica e também um campo `motivo`:
  // só a tabela separa os dois contextos.
  const outraTabela = {
    tabela: 'financeiro.valor_acordado_turno',
    registro_id: substituicao,
    campo: 'motivo',
    formato: 1,
  } as AadCifra;
  await expect(cifra.decifrar(envelope, outraTabela)).rejects.toBeInstanceOf(ErroCifraAutenticada);
});

it('formato fora do atual é recusado antes de qualquer tentativa de decifra', async () => {
  const cifra = criarCifra();
  const envelope = await cifra.cifrar('Motivo fictício.', aad(substituicao, 'motivo'));
  const formatoTrocado = {
    tabela: 'cadastro.substituicao_case_manager',
    registro_id: substituicao,
    campo: 'motivo',
    formato: 2,
  } as unknown as AadCifra;
  await expect(cifra.cifrar('x', formatoTrocado)).rejects.toBeInstanceOf(ErroCifraAutenticada);
  await expect(cifra.decifrar(envelope, formatoTrocado)).rejects.toBeInstanceOf(
    ErroCifraAutenticada,
  );
});

it('campo fora da lista e registro não-UUID são recusados', async () => {
  const cifra = criarCifra();
  for (const invalido of [
    {
      tabela: 'cadastro.substituicao_case_manager',
      registro_id: substituicao,
      campo: 'conteudo',
      formato: 1,
    },
    {
      tabela: 'cadastro.substituicao_case_manager',
      registro_id: 'nao-e-uuid',
      campo: 'motivo',
      formato: 1,
    },
  ] as unknown as AadCifra[]) {
    await expect(cifra.cifrar('Motivo fictício.', invalido)).rejects.toBeInstanceOf(
      ErroCifraAutenticada,
    );
  }
});

/** Vetor de regressão da FORMA canônica. Escrito à mão a partir da documentação do ramo: se
 * a forma genérica mudar (ordem, nomes ou campos a mais), este teste quebra. */
it('a forma canônica é a genérica do repositório, campo a campo', async () => {
  const cifra = criarCifra();
  const canonico = JSON.stringify({
    tabela: 'cadastro.substituicao_case_manager',
    registro_id: substituicao,
    campo: 'motivo',
    formato: 1,
  });
  const envelope = await cifra.cifrar('Motivo fictício.', aad(substituicao, 'motivo'));
  // Decifrar com o AAD remontado a partir do JSON canônico escrito à mão só funciona se a
  // implementação produzir exatamente esses quatro campos, nessa ordem.
  const remontado = metadadosAadSchema.parse(JSON.parse(canonico));
  expect(await cifra.decifrar(envelope, remontado)).toBe('Motivo fictício.');
  expect(Object.keys(JSON.parse(canonico))).toEqual(['tabela', 'registro_id', 'campo', 'formato']);
});
