import { describe, expect, it } from 'vitest';

import {
  criarCifraAutenticada,
  ErroChaveIndisponivel,
  type MetadadosAad,
} from './cifra-autenticada.ts';

const aad: MetadadosAad = {
  tabela: 'cadastro.paciente',
  registro_id: 'd3bc7baf-8868-44ca-97a2-a5dfe73e567a',
  campo: 'nome',
  formato: 1,
};

function criarCifraParaTeste() {
  return criarCifraAutenticada({
    keyIdAtiva: 'pii-v2',
    chavesDeCifra: {
      'pii-v1': new Uint8Array(32).fill(17),
      'pii-v2': new Uint8Array(32).fill(29),
    },
    chaveHmac: new Uint8Array(32).fill(43),
  });
}

describe('cifra autenticada de campos', () => {
  it('recupera o valor fictício no mesmo AAD', async () => {
    const cifra = criarCifraParaTeste();
    const campo = await cifra.cifrar('Pessoa Fictícia', aad);

    expect(campo).toMatchObject({ formato: 1, key_id: 'pii-v2' });
    await expect(cifra.decifrar(campo, aad)).resolves.toBe('Pessoa Fictícia');
  });

  it('gera nonces distintos para o mesmo valor e AAD', async () => {
    const cifra = criarCifraParaTeste();
    const primeiro = await cifra.cifrar('Pessoa Fictícia', aad);
    const segundo = await cifra.cifrar('Pessoa Fictícia', aad);

    expect(primeiro.nonce).not.toBe(segundo.nonce);
    expect(primeiro.ciphertext).not.toBe(segundo.ciphertext);
  });

  it('recusa AAD alterado', async () => {
    const cifra = criarCifraParaTeste();
    const campo = await cifra.cifrar('Pessoa Fictícia', aad);

    await expect(cifra.decifrar(campo, { ...aad, campo: 'nome_preferencia' })).rejects.toThrow(
      'Não foi possível processar o campo cifrado.',
    );
  });

  it('recusa tag adulterada', async () => {
    const cifra = criarCifraParaTeste();
    const campo = await cifra.cifrar('Pessoa Fictícia', aad);
    const tagAdulterada = `${campo.tag.slice(0, -1)}${campo.tag.endsWith('A') ? 'B' : 'A'}`;

    await expect(cifra.decifrar({ ...campo, tag: tagAdulterada }, aad)).rejects.toThrow(
      'Não foi possível processar o campo cifrado.',
    );
  });

  it('recusa ciphertext adulterado ou fora do limite do contrato', async () => {
    const cifra = criarCifraParaTeste();
    const campo = await cifra.cifrar('Pessoa Fictícia', aad);
    const ciphertextAdulterado = `${campo.ciphertext.slice(0, -1)}${campo.ciphertext.endsWith('A') ? 'B' : 'A'}`;

    await expect(
      cifra.decifrar({ ...campo, ciphertext: ciphertextAdulterado }, aad),
    ).rejects.toThrow('Não foi possível processar o campo cifrado.');
    await expect(cifra.decifrar({ ...campo, ciphertext: 'A'.repeat(32_769) }, aad)).rejects.toThrow(
      'Não foi possível processar o campo cifrado.',
    );
  });

  it('recusa nonce adulterado', async () => {
    const cifra = criarCifraParaTeste();
    const campo = await cifra.cifrar('Pessoa Fictícia', aad);
    const nonceAdulterado = `${campo.nonce.slice(0, -1)}${campo.nonce.endsWith('A') ? 'B' : 'A'}`;

    await expect(cifra.decifrar({ ...campo, nonce: nonceAdulterado }, aad)).rejects.toThrow(
      'Não foi possível processar o campo cifrado.',
    );
  });

  it('lê envelope cifrado com a chave anterior', async () => {
    const cifraAnterior = criarCifraAutenticada({
      keyIdAtiva: 'pii-v1',
      chavesDeCifra: { 'pii-v1': new Uint8Array(32).fill(17) },
      chaveHmac: new Uint8Array(32).fill(43),
    });
    const campoAnterior = await cifraAnterior.cifrar('Pessoa Fictícia', aad);
    const cifraComRotacao = criarCifraParaTeste();

    await expect(cifraComRotacao.decifrar(campoAnterior, aad)).resolves.toBe('Pessoa Fictícia');
  });

  it('nega cifra e decifra quando a chave indicada está ausente', async () => {
    expect(() =>
      criarCifraAutenticada({
        keyIdAtiva: 'pii-ausente',
        chavesDeCifra: { 'pii-v1': new Uint8Array(32).fill(17) },
        chaveHmac: new Uint8Array(32).fill(43),
      }),
    ).toThrow(ErroChaveIndisponivel);

    const cifra = criarCifraParaTeste();
    const campo = await cifra.cifrar('Pessoa Fictícia', aad);
    await expect(cifra.decifrar({ ...campo, key_id: 'pii-ausente' }, aad)).rejects.toThrow(
      ErroChaveIndisponivel,
    );

    await expect(cifra.decifrar({ ...campo, key_id: undefined } as never, aad)).rejects.toThrow(
      'Não foi possível processar o campo cifrado.',
    );
  });

  it('nega configuração com HMAC ausente, inválido ou reutilizado para cifra', () => {
    const chavesDeCifra = { 'pii-v1': new Uint8Array(32).fill(17) };

    expect(() =>
      criarCifraAutenticada({
        keyIdAtiva: 'pii-v1',
        chavesDeCifra,
        chaveHmac: new Uint8Array(31).fill(43),
      }),
    ).toThrow(ErroChaveIndisponivel);
    expect(() =>
      criarCifraAutenticada({
        keyIdAtiva: 'pii-v1',
        chavesDeCifra,
        chaveHmac: new Uint8Array(32).fill(17),
      }),
    ).toThrow(ErroChaveIndisponivel);
  });

  it('calcula HMAC estável para o mesmo comando lógico', async () => {
    const cifra = criarCifraParaTeste();
    const comandoLogico = 'concessao:email:pessoa.ficticia@exemplo.test';

    await expect(cifra.calcularHmac(comandoLogico)).resolves.toBe(
      await cifra.calcularHmac(comandoLogico),
    );
  });
});
