import { describe, expect, it } from 'vitest';
import { criarCursorReconciliacao } from '../src/cursor-reconciliacao.ts';

const identidade = {
  usuarioId: '10000000-0000-4000-8000-000000000001',
  sessaoId: '20000000-0000-4000-8000-000000000001',
};
const id = '30000000-0000-4000-8000-000000000001';

describe('cursor protegido de reconciliação', () => {
  it('recupera o cursor apenas para a mesma identidade e sessão', async () => {
    const cursor = criarCursorReconciliacao(new Uint8Array(32).fill(7));
    const token = await cursor.emitir(id, identidade);
    expect(token).not.toContain(id);
    await expect(cursor.abrir(token, identidade)).resolves.toBe(id);
    await expect(
      cursor.abrir(token, { ...identidade, usuarioId: '10000000-0000-4000-8000-000000000002' }),
    ).rejects.toThrow('Cursor inválido.');
    await expect(
      cursor.abrir(token, { ...identidade, sessaoId: '20000000-0000-4000-8000-000000000002' }),
    ).rejects.toThrow('Cursor inválido.');
  });
  it('recusa alterações e chave diferente, sem expor o cursor', async () => {
    const primeiro = criarCursorReconciliacao(new Uint8Array(32).fill(7));
    const outro = criarCursorReconciliacao(new Uint8Array(32).fill(8));
    const token = await primeiro.emitir(id, identidade);
    const alterado = `${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`;
    await expect(primeiro.abrir(alterado, identidade)).rejects.toThrow('Cursor inválido.');
    await expect(outro.abrir(token, identidade)).rejects.toThrow('Cursor inválido.');
    await expect(primeiro.abrir(`${token}=`, identidade)).rejects.toThrow('Cursor inválido.');
    expect(() => criarCursorReconciliacao(new Uint8Array(31))).toThrow('Cursor inválido.');
  });
});
