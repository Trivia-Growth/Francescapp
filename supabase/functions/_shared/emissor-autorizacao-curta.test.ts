import { describe, expect, it, vi } from 'vitest';
import { criarProvaGeracao } from './sessao/prova-geracao.ts';
import { criarEmissorAutorizacaoCurta } from './emissor-autorizacao-curta.ts';
import { criarAutorizacaoCurta } from './autorizacao-curta.ts';

const config = { keyId: 'v1', chave: new Uint8Array(32).fill(7) };
const contexto = {
  usuario_id: '10000000-0000-4000-8000-000000000001',
  session_id: '10000000-0000-4000-8000-000000000002',
  geracao: 1,
  operacao: 'cadastro.criar_paciente',
  audiencia: 'banco',
};
const instante = Date.parse('2026-11-01T12:00:00Z');

describe('emissor experimental de autorização curta', () => {
  it('emite somente após comprovar a prova, sem enviá-la ao consultor', async () => {
    const { prova, provaHash } = await criarProvaGeracao();
    const consultar = vi.fn(async () => provaHash);
    const emissor = criarEmissorAutorizacaoCurta({ ...config, consultar, agora: () => instante });
    const resultado = await emissor(contexto, prova, { nome: 'fictício' });
    expect(consultar).toHaveBeenCalledWith({
      usuario_id: contexto.usuario_id,
      session_id: contexto.session_id,
      geracao: 1,
    });
    expect(
      await criarAutorizacaoCurta(config).verificar(
        resultado.autorizacao,
        contexto,
        { nome: 'fictício' },
        instante,
      ),
    ).toBe(true);
  });

  it('nega prova inválida, incorreta, verificador ausente ou malformado e indisponibilidade', async () => {
    const { prova, provaHash } = await criarProvaGeracao();
    const outra = await criarProvaGeracao();
    const consultar = vi.fn(async () => provaHash);
    const emissor = criarEmissorAutorizacaoCurta({ ...config, consultar, agora: () => instante });
    await expect(emissor(contexto, 'invalida', {})).rejects.toThrow('Autorização indisponível.');
    expect(consultar).not.toHaveBeenCalled();
    await expect(emissor(contexto, outra.prova, {})).rejects.toThrow('Autorização indisponível.');
    for (const consultarFalha of [
      async () => null,
      async () => 'inválido',
      async () => {
        throw new Error('segredo fictício');
      },
    ]) {
      await expect(
        criarEmissorAutorizacaoCurta({
          ...config,
          consultar: consultarFalha,
          agora: () => instante,
        })(contexto, prova, {}),
      ).rejects.toThrow('Autorização indisponível.');
    }
  });

  it('isola o snapshot durante espera e emite identificadores distintos para chamadas concorrentes', async () => {
    const { prova, provaHash } = await criarProvaGeracao();
    let liberar!: (valor: string) => void;
    const espera = new Promise<string>((resolve) => {
      liberar = resolve;
    });
    const emissor = criarEmissorAutorizacaoCurta({
      ...config,
      consultar: () => espera,
      agora: () => instante,
    });
    const entrada = { nome: 'antes' };
    const a = emissor(contexto, prova, entrada);
    const b = emissor(contexto, prova, entrada);
    entrada.nome = 'depois';
    liberar(provaHash);
    const [primeiro, segundo] = await Promise.all([a, b]);
    expect(primeiro.entradaCanonica).toBe('{"nome":"antes"}');
    expect(primeiro.autorizacao.id).not.toBe(segundo.autorizacao.id);
    expect(
      await criarAutorizacaoCurta(config).verificar(
        primeiro.autorizacao,
        contexto,
        entrada,
        instante,
      ),
    ).toBe(false);
  });
});
