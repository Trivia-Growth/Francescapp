import { describe, it, expect } from 'vitest';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { cifrarExecucao, abrirRegistroExecucao } from './turno-execucao-projecao.ts';
import { gravarExecucaoPublicaSchema } from '../../../packages/contracts/src/turno-execucao-http.ts';
const paciente = 'c0000000-0000-4000-8000-000000000003';
const id = 'd0000000-0000-4000-8000-000000000004';
const autor = 'a0000000-0000-4000-8000-000000000001';
const cifra = () =>
  criarCifraAutenticada({
    keyIdAtiva: 'teste',
    chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
    chaveHmac: new Uint8Array(32).fill(4),
  });
const humano = {
  epoca: 1,
  registro_id: id,
  versao_esperada: 0,
  conteudo: {
    classe: 'prescricao' as const,
    dados: {
      nome: 'Medicação fictícia',
      dose: 'Dose fictícia',
      via: 'Via fictícia',
      horarios: ['08:00:00'],
      vigencia_inicio: '2026-11-19T00:00:00Z',
      vigencia_fim: null,
      fonte_documental: 'Fonte fictícia',
    },
  },
};
describe('projeção clínica na fronteira BFF', () => {
  it('cifra antes de RPC e decifra só o registro do mesmo caso com AAD original', async () => {
    const c = cifra();
    const e = await cifrarExecucao(
      gravarExecucaoPublicaSchema.parse(humano),
      paciente,
      'chave_ficticia_123456',
      'd'.repeat(43),
      c,
    );
    expect(JSON.stringify(e)).not.toContain('Medicação fictícia');
    const r = await abrirRegistroExecucao(
      {
        id,
        paciente_id: paciente,
        turno_id: null,
        classe: 'prescricao',
        autor_usuario_id: autor,
        versao: 1,
        instante_ocorrencia: '2026-11-19T00:00:00Z',
        registrado_em: '2026-11-19T12:00:00Z',
        dados: e.conteudo.dados,
      },
      paciente,
      c,
    );
    expect(r.conteudo).toEqual(humano.conteudo);
    expect(r.registrador_nome).toBeNull();
  });
  it('nega registro de outro paciente antes de decifrar', async () => {
    await expect(
      abrirRegistroExecucao(
        {
          id,
          paciente_id: autor,
          turno_id: null,
          classe: 'prescricao',
          autor_usuario_id: autor,
          versao: 1,
          dados: {},
        },
        paciente,
        cifra(),
      ),
    ).rejects.toThrow();
  });
  it('texto multibyte excedente é entrada inválida antes da cifra', () => {
    expect(
      gravarExecucaoPublicaSchema.safeParse({
        ...humano,
        conteudo: {
          ...humano.conteudo,
          dados: { ...humano.conteudo.dados, nome: '€'.repeat(6000) },
        },
      }).success,
    ).toBe(false);
  });
  it('metadados privados/autor forjado são rejeitados no contrato público', () => {
    expect(
      gravarExecucaoPublicaSchema.safeParse({ ...humano, autor_usuario_id: autor }).success,
    ).toBe(false);
    expect(
      gravarExecucaoPublicaSchema.safeParse({ ...humano, aad: { tabela: 'forjada' } }).success,
    ).toBe(false);
  });
});
