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
  describe('situação do caso na lista', () => {
    const pagina = async (situacao: unknown) => ({
      ok: true,
      request_id: requestId,
      dados: {
        itens: [
          {
            paciente_id: pacienteId,
            nome: await cifra.cifrar('Paciente fictício', {
              tabela: 'cadastro.paciente',
              registro_id: pacienteId,
              campo: 'nome',
              formato: 1,
            }),
            nome_preferencia: null,
            versao: 1,
            ...(situacao === undefined ? {} : { situacao }),
          },
        ],
        proximo_cursor: null,
      },
    });
    const contexto = (situacaoPermitida?: boolean) => ({
      requestId,
      limite: 1,
      ...(situacaoPermitida === undefined ? {} : { situacaoPermitida }),
    });

    it('entrega a situação, inclusive nula, quando o chamador a permite', async () => {
      const ativo = await processarCarteiraExperimental(
        await pagina('ativo'),
        contexto(true),
        cifra,
      );
      expect(ativo.ok && ativo.dados.itens[0]).toMatchObject({ id: pacienteId, situacao: 'ativo' });
      const completar = await processarCarteiraExperimental(
        await pagina(null),
        contexto(true),
        cifra,
      );
      expect(completar.ok && completar.dados.itens[0]).toHaveProperty('situacao', null);
    });
    it('não inventa a chave quando a resposta não a traz', async () => {
      const resultado = await processarCarteiraExperimental(
        await pagina(undefined),
        contexto(true),
        cifra,
      );
      expect(resultado.ok && Object.keys(resultado.dados.itens[0] ?? {})).toEqual([
        'id',
        'nome',
        'nome_preferencia',
        'versao',
      ]);
    });
    it('falha fechado quando a resposta traz situação que o chamador não permitiu', async () => {
      for (const situacao of ['ativo', null]) {
        for (const permissao of [undefined, false]) {
          await expect(
            processarCarteiraExperimental(await pagina(situacao), contexto(permissao), cifra),
          ).rejects.toThrow('Não foi possível consultar a carteira.');
        }
      }
    });
    it('recusa situação fora do conjunto', async () => {
      await expect(
        processarCarteiraExperimental(await pagina('invalida'), contexto(true), cifra),
      ).rejects.toThrow('Não foi possível consultar a carteira.');
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
