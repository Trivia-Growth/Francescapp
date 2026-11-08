import { describe, expect, it } from 'vitest';
import { calcularCandidatosConcessao } from './idempotencia-concessao-equipe.ts';

describe('idempotência versionada de concessão', () => {
  it('mantém candidato anterior após rotação e distingue conteúdo', async () => {
    const antiga = new Uint8Array(32).fill(1);
    const nova = new Uint8Array(32).fill(2);
    const antes = await calcularCandidatosConcessao({ v1: antiga }, 'usuario', 'pedido', 'comando');
    const depois = await calcularCandidatosConcessao(
      { v1: antiga, v2: nova },
      'usuario',
      'pedido',
      'comando',
    );
    expect(depois.v1).toEqual(antes.v1);
    expect(depois.v2).not.toEqual(antes.v1);
    const alterado = await calcularCandidatosConcessao(
      { v1: antiga },
      'usuario',
      'pedido',
      'outro',
    );
    expect(alterado.v1?.concessao_id).toBe(antes.v1?.concessao_id);
    expect(alterado.v1?.digest_idempotencia).not.toBe(antes.v1?.digest_idempotencia);
  });
  it('rejeita material ausente ou inválido', async () => {
    await expect(calcularCandidatosConcessao({}, 'usuario', 'pedido', 'comando')).rejects.toThrow();
    await expect(
      calcularCandidatosConcessao({ v1: new Uint8Array(31) }, 'usuario', 'pedido', 'comando'),
    ).rejects.toThrow();
  });
});
