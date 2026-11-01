import { describe, expect, it } from 'vitest';
import { criarAutorizacaoCurta } from './autorizacao-curta.ts';

describe('autorização curta experimental', () => {
  it('assina e verifica a autorização vinculada à operação e entrada', async () => {
    const modulo = criarAutorizacaoCurta({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    const contexto = {
      usuario_id: '10000000-0000-4000-8000-000000000001',
      session_id: '10000000-0000-4000-8000-000000000002',
      geracao: 1,
      operacao: 'cadastro.criar_paciente',
      audiencia: 'banco',
    };
    const agora = Date.parse('2026-11-01T12:00:00Z');
    const { autorizacao } = await modulo.emitir(contexto, { campo: 'fictício' }, agora);
    await expect(
      modulo.verificar(autorizacao, contexto, { campo: 'fictício' }, agora),
    ).resolves.toBe(true);
    await expect(modulo.verificar(autorizacao, contexto, { campo: 'outro' }, agora)).resolves.toBe(
      false,
    );
  });

  it('recusa adulteração, contexto diferente e prazos fora da janela', async () => {
    const modulo = criarAutorizacaoCurta({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    const outro = criarAutorizacaoCurta({ keyId: 'v1', chave: new Uint8Array(32).fill(8) });
    const contexto = {
      usuario_id: '10000000-0000-4000-8000-000000000001',
      session_id: '10000000-0000-4000-8000-000000000002',
      geracao: 1,
      operacao: 'cadastro.criar_paciente',
      audiencia: 'banco',
    };
    const agora = Date.parse('2026-11-01T12:00:00Z');
    const entrada = { campo: 'fictício' };
    const { autorizacao: token } = await modulo.emitir(contexto, entrada, agora);
    for (const diferente of [
      { ...contexto, geracao: 2 },
      { ...contexto, operacao: 'outra' },
      { ...contexto, audiencia: 'outra' },
      { ...contexto, session_id: contexto.usuario_id },
      { ...contexto, usuario_id: contexto.session_id },
    ]) {
      expect(await modulo.verificar(token, diferente, entrada, agora)).toBe(false);
    }
    expect(
      await modulo.verificar({ ...token, id: crypto.randomUUID() }, contexto, entrada, agora),
    ).toBe(false);
    expect(
      await modulo.verificar({ ...token, mac: 'A'.repeat(43) }, contexto, entrada, agora),
    ).toBe(false);
    expect(await outro.verificar(token, contexto, entrada, agora)).toBe(false);
    expect(await modulo.verificar(token, contexto, entrada, agora - 1)).toBe(false);
    expect(await modulo.verificar(token, contexto, entrada, agora + 60_000)).toBe(false);
    expect(
      await modulo.verificar({ ...token, expira_em: agora + 600_000 }, contexto, entrada, agora),
    ).toBe(false);
    const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const ultimo = alfabeto.indexOf(token.mac.slice(-1));
    const macAlternativo = `${token.mac.slice(0, -1)}${alfabeto[ultimo + 1]}`;
    expect(
      await modulo.verificar({ ...token, mac: macAlternativo }, contexto, entrada, agora),
    ).toBe(false);
    expect((await modulo.emitir(contexto, entrada, agora)).autorizacao.id).not.toBe(token.id);
  });

  it('assina o snapshot original mesmo se o chamador alterar a entrada', async () => {
    const modulo = criarAutorizacaoCurta({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    const contexto = {
      usuario_id: '10000000-0000-4000-8000-000000000001',
      session_id: '10000000-0000-4000-8000-000000000002',
      geracao: 1,
      operacao: 'cadastro.criar_paciente',
      audiencia: 'banco',
    };
    const agora = Date.parse('2026-11-01T12:00:00Z');
    const entrada = { campo: 'antes' };
    const promessa = modulo.emitir(contexto, entrada, agora);
    entrada.campo = 'depois';
    const { autorizacao: token, entradaCanonica } = await promessa;
    expect(entradaCanonica).toBe('{"campo":"antes"}');
    expect(await modulo.verificar(token, contexto, { campo: 'antes' }, agora)).toBe(true);
    expect(await modulo.verificar(token, contexto, entrada, agora)).toBe(false);
    expect(await modulo.verificar(null, contexto, entrada, agora)).toBe(false);
  });
});
