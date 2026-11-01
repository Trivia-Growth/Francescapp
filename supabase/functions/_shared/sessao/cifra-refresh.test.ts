import { describe, expect, it } from 'vitest';

import { criarCifraAutenticada } from '../cifra-autenticada.ts';
import { criarCifraRefresh } from './cifra-refresh.ts';

const usuario = 'd3bc7baf-8868-44ca-97a2-a5dfe73e567a';
const sessao = 'a36f9a17-a408-495a-aa87-37099a304bd3';

describe('cifra de refresh no servidor', () => {
  it('recupera refresh fictício apenas para a sessão e usuário vinculados', async () => {
    const cifra = criarCifraRefresh(
      criarCifraAutenticada({
        keyIdAtiva: 'v1',
        chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
        chaveHmac: new Uint8Array(32).fill(29),
      }),
    );
    const envelope = await cifra.cifrar('refresh-ficticio', { usuario, sessao });
    expect(JSON.stringify(envelope)).not.toContain('refresh-ficticio');
    await expect(cifra.decifrar(envelope, { usuario, sessao })).resolves.toBe('refresh-ficticio');
    await expect(cifra.decifrar(envelope, { usuario: sessao, sessao })).rejects.toThrow();
    await expect(cifra.decifrar(envelope, { usuario, sessao: usuario })).rejects.toThrow();
  });

  it('recusa refresh grande demais para ser recuperado pelo formato de cifra', async () => {
    const cifra = criarCifraRefresh(
      criarCifraAutenticada({
        keyIdAtiva: 'v1',
        chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
        chaveHmac: new Uint8Array(32).fill(29),
      }),
    );
    await expect(cifra.cifrar('x'.repeat(24_577), { usuario, sessao })).rejects.toThrow();
  });

  it('fecha em identidade inválida ou envelope adulterado', async () => {
    const cifra = criarCifraRefresh(
      criarCifraAutenticada({
        keyIdAtiva: 'v1',
        chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
        chaveHmac: new Uint8Array(32).fill(29),
      }),
    );
    const envelope = await cifra.cifrar('refresh-ficticio', { usuario, sessao });
    await expect(cifra.cifrar('refresh-ficticio', { usuario: '', sessao })).rejects.toThrow();
    await expect(
      cifra.decifrar({ ...envelope, tag: 'invalida' }, { usuario, sessao }),
    ).rejects.toThrow();
  });

  it('rejeita credencial Unicode inválida sem alterá-la silenciosamente', async () => {
    const cifra = criarCifraRefresh(
      criarCifraAutenticada({
        keyIdAtiva: 'v1',
        chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
        chaveHmac: new Uint8Array(32).fill(29),
      }),
    );
    await expect(cifra.cifrar('ficticio\ud800', { usuario, sessao })).rejects.toThrow(
      'Não foi possível processar o campo cifrado.',
    );
  });

  it('falha sanitizada para identidade ausente ao cifrar ou decifrar', async () => {
    const cifra = criarCifraRefresh(
      criarCifraAutenticada({
        keyIdAtiva: 'v1',
        chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
        chaveHmac: new Uint8Array(32).fill(29),
      }),
    );
    const envelope = await cifra.cifrar('refresh-ficticio', { usuario, sessao });
    await expect(cifra.cifrar('refresh-ficticio', null as never)).rejects.toThrow(
      'Não foi possível processar o campo cifrado.',
    );
    await expect(cifra.decifrar(envelope, undefined as never)).rejects.toThrow(
      'Não foi possível processar o campo cifrado.',
    );
  });
});
