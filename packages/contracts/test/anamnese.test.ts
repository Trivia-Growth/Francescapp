import { describe, expect, it } from 'vitest';
import {
  anamneseSchema,
  consultarHistoricoAnamneseSchema,
  respostaAnamnesePrivadaSchema,
  salvarAnamneseSchema,
} from '../src/anamnese.ts';

describe('contrato de anamnese', () => {
  const secoes = [
    {
      id: 'secao',
      camposEsperados: ['campo'],
      respostas: [
        {
          campo: 'campo',
          estado: 'informado',
          valor: 'exemplo',
          fonte: 'relato',
          data: '2026-11-04',
        },
      ],
    },
  ] as const;

  it('aceita progresso e primeira gravação com versão zero', () => {
    expect(salvarAnamneseSchema.parse({ versao_esperada: 0, secoes })).toEqual({
      versao_esperada: 0,
      secoes,
    });
    expect(anamneseSchema.parse({ versao: 1, secoes })).toEqual({ versao: 1, secoes });
  });

  it('rejeita versões inválidas, seções duplicadas e data inválida', () => {
    for (const versao_esperada of [-1, 1.5, 2147483647]) {
      expect(salvarAnamneseSchema.safeParse({ versao_esperada, secoes }).success).toBe(false);
    }
    expect(
      salvarAnamneseSchema.safeParse({ versao_esperada: 0, secoes: [...secoes, ...secoes] })
        .success,
    ).toBe(false);
    expect(
      salvarAnamneseSchema.safeParse({
        versao_esperada: 0,
        secoes: [{ ...secoes[0], respostas: [{ ...secoes[0].respostas[0], data: '2026-02-30' }] }],
      }).success,
    ).toBe(false);
  });
});

describe('resposta privada da anamnese', () => {
  const request_id = '123e4567-e89b-42d3-a456-426614174000';
  const dados = {
    registro_id: request_id,
    paciente_id: request_id,
    versao: 1,
    conteudo: { formato: 1, key_id: 'chave', nonce: 'AA', ciphertext: 'AA', tag: 'AA' },
  };
  it('aceita ausência, registro cifrado e erros previstos', () => {
    for (const resposta of [
      { ok: true, dados: null, request_id, repeticao: false },
      { ok: true, dados, request_id, repeticao: false },
      { ok: true, dados, request_id, repeticao: true },
      { ok: false, erro: { codigo: 'conflito' }, request_id },
      { ok: false, erro: { codigo: 'conflito_idempotencia' }, request_id },
      { ok: false, erro: { codigo: 'sem_permissao' }, request_id },
    ])
      expect(respostaAnamnesePrivadaSchema.safeParse(resposta).success).toBe(true);
  });
  it('rejeita versões inválidas e campos extras na resposta privada', () => {
    expect(respostaAnamnesePrivadaSchema.safeParse({ ok: true, dados, request_id }).success).toBe(
      false,
    );
    expect(
      respostaAnamnesePrivadaSchema.safeParse({
        ok: true,
        repeticao: false,
        dados: { ...dados, versao: 0 },
        request_id,
      }).success,
    ).toBe(false);
    expect(
      respostaAnamnesePrivadaSchema.safeParse({
        ok: true,
        repeticao: false,
        dados: { ...dados, texto: 'exemplo' },
        request_id,
      }).success,
    ).toBe(false);
  });
});

describe('cursor do histórico de anamnese', () => {
  it('aceita apenas versão inteira positiva no limite do banco', () => {
    for (const entrada of [{}, { antes_versao: 1 }, { antes_versao: 2147483647 }])
      expect(consultarHistoricoAnamneseSchema.safeParse(entrada).success).toBe(true);
    for (const entrada of [
      { antes_versao: 0 },
      { antes_versao: -1 },
      { antes_versao: 1.5 },
      { antes_versao: 2147483648 },
      { antes_versao: '2' },
      { outro: 1 },
    ])
      expect(consultarHistoricoAnamneseSchema.safeParse(entrada).success).toBe(false);
  });
});
