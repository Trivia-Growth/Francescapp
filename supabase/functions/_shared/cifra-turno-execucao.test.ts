import { describe, it, expect } from 'vitest';
import { criarCifraAutenticada } from './cifra-autenticada.ts';
import type { MetadadosAad } from '../../../packages/contracts/src/rpc.ts';
const aad = {
  tabela: 'cadastro.turno_ocorrencia_versao' as const,
  paciente_id: 'c0000000-0000-4000-8000-000000000003',
  turno_id: 'e0000000-0000-4000-8000-000000000005',
  registro_id: 'd0000000-0000-4000-8000-000000000004',
  versao: 1,
  campo: 'descricao' as const,
  formato: 1 as const,
};
const cifra = () =>
  criarCifraAutenticada({
    keyIdAtiva: 'teste',
    chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
    chaveHmac: new Uint8Array(32).fill(4),
  });
describe('AAD canônico execução de turno', () => {
  it('ida e volta preserva texto fictício', async () => {
    const c = cifra();
    expect(await c.decifrar(await c.cifrar('Ocorrência fictícia', aad), aad)).toBe(
      'Ocorrência fictícia',
    );
  });
  it.each([
    { paciente_id: 'a0000000-0000-4000-8000-000000000001' },
    { turno_id: null },
    { registro_id: 'a0000000-0000-4000-8000-000000000001' },
    { versao: 2 },
    { campo: 'providencia' },
    { tabela: 'cadastro.turno_prescricao_versao', campo: 'nome' },
  ])(
    'não transplanta envelope entre caso/turno/registro/versão/campo/tabela',
    async (alteracao) => {
      const c = cifra();
      const e = await c.cifrar('Texto fictício', aad);
      await expect(c.decifrar(e, { ...aad, ...alteracao } as MetadadosAad)).rejects.toThrow();
    },
  );
  it('prescrição sem turno mantém namespace null distinto de turno UUID', async () => {
    const c = cifra();
    const a = {
      ...aad,
      tabela: 'cadastro.turno_prescricao_versao' as const,
      turno_id: null,
      campo: 'nome' as const,
    };
    const e = await c.cifrar('Medicação fictícia', a);
    expect(await c.decifrar(e, a)).toBe('Medicação fictícia');
    await expect(c.decifrar(e, { ...a, turno_id: aad.turno_id })).rejects.toThrow();
  });
  it('fundamento e exportação usam campos/tabelas segregados', async () => {
    const c = cifra();
    const a = {
      ...aad,
      tabela: 'cadastro.turno_exportacao_pdf' as const,
      turno_id: null,
      campo: 'destinatario' as const,
    };
    const e = await c.cifrar('Equipe fictícia', a);
    await expect(
      c.decifrar(e, { ...a, tabela: 'cadastro.turno_localizacao_exportacao' }),
    ).rejects.toThrow();
    await expect(c.decifrar(e, { ...a, campo: 'proposito' })).rejects.toThrow();
  });
});
