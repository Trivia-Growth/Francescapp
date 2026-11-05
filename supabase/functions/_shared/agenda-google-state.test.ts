import { describe, expect, it } from 'vitest';
import { criarStateAgenda, type RepositorioStateAgenda } from './agenda-google-state.ts';

// Exercita vínculo e consumo do núcleo; o repositório fictício não prova SQL ou sessão real.
describe('state de consentimento da agenda', () => {
  it('vincula o conteúdo selado à sessão e impede repetição após consumo', async () => {
    const linhas = new Map<string, { usuarioId: string; sessaoId: string; selado: string }>();
    const repositorio: RepositorioStateAgenda = {
      async registrar({ hash, ...linha }) {
        linhas.set(hash, linha);
      },
      async consumir({ hash, usuarioId, sessaoId }) {
        const linha = linhas.get(hash);
        if (!linha || linha.usuarioId !== usuarioId || linha.sessaoId !== sessaoId) return null;
        linhas.delete(hash);
        return { selado: linha.selado, geracao: '0' };
      },
    };
    const estado = criarStateAgenda(crypto.getRandomValues(new Uint8Array(32)), repositorio);
    const state = 'a'.repeat(43);
    await estado.registrar({
      state,
      verificador: 'b'.repeat(43),
      nonce: 'c'.repeat(43),
      usuarioId: 'usuario',
      sessaoId: 'sessao',
    });
    await expect(
      estado.consumir({ state, usuarioId: 'usuario', sessaoId: 'outra' }),
    ).rejects.toThrow('Consentimento indisponível.');
    await expect(
      estado.consumir({ state, usuarioId: 'usuario', sessaoId: 'sessao' }),
    ).resolves.toEqual({ verificador: 'b'.repeat(43), nonce: 'c'.repeat(43), geracao: '0' });
    await expect(
      estado.consumir({ state, usuarioId: 'usuario', sessaoId: 'sessao' }),
    ).rejects.toThrow('Consentimento indisponível.');
  });
});
