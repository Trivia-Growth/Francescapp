import { describe, expect, it, vi } from 'vitest';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { processarCarteiraExperimental } from '../src/carteira-experimental.ts';

const requestId = '64000000-0000-4000-8000-000000000001';
const pacienteId = '66000000-0000-4000-8000-000000000001';
const cifra = criarCifraAutenticada({
  keyIdAtiva: 'ficticia',
  chavesDeCifra: { ficticia: new Uint8Array(32).fill(17) },
  chaveHmac: new Uint8Array(32).fill(43),
});

describe('carteira experimental autorizada', () => {
  it('projeta a página cifrada com cifra real e preserva cursor interno', async () => {
    const nome = await cifra.cifrar('Paciente fictício', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome',
      formato: 1,
    });
    const resposta = {
      ok: true,
      request_id: requestId,
      dados: {
        itens: [{ paciente_id: pacienteId, nome, nome_preferencia: null, versao: 1 }],
        proximo_cursor: pacienteId,
      },
    };
    await expect(
      processarCarteiraExperimental(resposta, { requestId, limite: 1 }, cifra),
    ).resolves.toEqual({
      ok: true,
      request_id: requestId,
      dados: {
        itens: [{ id: pacienteId, nome: 'Paciente fictício', nome_preferencia: null, versao: 1 }],
        proximo_cursor: pacienteId,
      },
    });
  });
  it('não decifra uma negativa autorizada', async () => {
    const decifrar = vi.fn();
    const resposta = { ok: false, request_id: requestId, erro: { codigo: 'sem_permissao' } };
    const resultado = await processarCarteiraExperimental(
      resposta,
      { requestId, limite: 1 },
      { decifrar },
    );
    expect(resultado.ok).toBe(false);
    expect(decifrar).not.toHaveBeenCalled();
  });
  it('rejeita correlação divergente e página maior que o limite', async () => {
    const nome = await cifra.cifrar('Paciente fictício', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome',
      formato: 1,
    });
    const item = { paciente_id: pacienteId, nome, nome_preferencia: null, versao: 1 };
    const resposta = {
      ok: true,
      request_id: requestId,
      dados: { itens: [item, item], proximo_cursor: null },
    };
    await expect(
      processarCarteiraExperimental(resposta, { requestId, limite: 1 }, cifra),
    ).rejects.toThrow('Não foi possível consultar a carteira.');
    await expect(
      processarCarteiraExperimental(
        { ...resposta, request_id: pacienteId },
        { requestId, limite: 2 },
        cifra,
      ),
    ).rejects.toThrow('Não foi possível consultar a carteira.');
  });
  it('não retorna página parcial se um envelope pertencer a outro paciente', async () => {
    const nome = await cifra.cifrar('Paciente fictício', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome',
      formato: 1,
    });
    const item = { paciente_id: pacienteId, nome, nome_preferencia: null, versao: 1 };
    const resposta = {
      ok: true,
      request_id: requestId,
      dados: { itens: [item, { ...item, paciente_id: requestId }], proximo_cursor: null },
    };
    await expect(
      processarCarteiraExperimental(resposta, { requestId, limite: 2 }, cifra),
    ).rejects.toThrow('Não foi possível consultar a carteira.');
  });
});
