import { describe, expect, it } from 'vitest';
import {
  conteudoFichaPlantaoSchema,
  janelaDeclaradaSchema,
  respostaPlantaoSchema,
  submissaoFichaPlantaoSchema,
} from '../src/ficha-plantao.ts';
import {
  metadadosAadFichaPlantaoRascunhoSchema,
  metadadosAadPlantaoVersaoSchema,
  metadadosAadSchema,
} from '../src/rpc.ts';

const turno = '11111111-1111-4111-8111-111111111111';
const registro = '22222222-2222-4222-8222-222222222222';
const pendencia = '33333333-3333-4333-8333-333333333333';

const resposta = {
  texto: 'Atividade fictícia do plantão',
  fonte: 'observacao_direta',
  visibilidade: 'compartilhavel',
} as const;

const conteudo = {
  periodo: 'noturno',
  papel_declarado: 'Acompanhante terapêutico',
  atividades: resposta,
  observacoes: { ...resposta, visibilidade: 'interna' },
  estado_emocional: {
    estado: 'estado fictício',
    instante_ocorrencia: '2026-11-20T03:00:00.000Z',
  },
  pendencias: [{ pendencia_id: pendencia, conteudo: { ...resposta, visibilidade: 'interna' } }],
} as const;

describe('ficha de plantão — conteúdo', () => {
  it('aceita a ficha fictícia completa', () => {
    expect(conteudoFichaPlantaoSchema.parse(conteudo)).toMatchObject({ periodo: 'noturno' });
  });

  it('aceita a ficha vazia porque nenhum campo nasce obrigatório', () => {
    expect(conteudoFichaPlantaoSchema.parse({})).toEqual({});
  });

  it('recusa campo desconhecido', () => {
    expect(conteudoFichaPlantaoSchema.safeParse({ ...conteudo, humor: 'bom' }).success).toBe(false);
  });

  it('recusa fonte fora do conjunto fechado', () => {
    expect(respostaPlantaoSchema.safeParse({ ...resposta, fonte: 'intuicao' }).success).toBe(false);
  });

  it('recusa visibilidade fora de interna/compartilhavel', () => {
    expect(respostaPlantaoSchema.safeParse({ ...resposta, visibilidade: 'publica' }).success).toBe(
      false,
    );
  });

  it('recusa período inventado e não o infere do relógio', () => {
    expect(conteudoFichaPlantaoSchema.safeParse({ periodo: 'madrugada' }).success).toBe(false);
    expect(conteudoFichaPlantaoSchema.parse({}).periodo).toBeUndefined();
  });

  it('não admite pontuação, escala ou gravidade no estado emocional', () => {
    for (const extra of [
      { valor: 7 },
      { pontuacao: 3 },
      { gravidade: 'alta' },
      { escala: 'PHQ' },
    ]) {
      const estado_emocional = {
        estado: 'estado fictício',
        instante_ocorrencia: '2026-11-20T03:00:00.000Z',
        ...extra,
      };
      expect(conteudoFichaPlantaoSchema.safeParse({ estado_emocional }).success).toBe(false);
    }
  });

  it('recusa janela declarada que termina antes de começar', () => {
    expect(
      janelaDeclaradaSchema.safeParse({
        inicio: '2026-11-20T06:00:00.000Z',
        fim: '2026-11-20T03:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('ficha de plantão — submissão', () => {
  const base = { turno_id: turno, registro_id: registro, versao_esperada: 0, conteudo };

  it('aceita a primeira versão sem motivo', () => {
    expect(submissaoFichaPlantaoSchema.parse(base).versao_esperada).toBe(0);
  });

  it('exige motivo na correção de ficha já publicada', () => {
    expect(submissaoFichaPlantaoSchema.safeParse({ ...base, versao_esperada: 1 }).success).toBe(
      false,
    );
    expect(
      submissaoFichaPlantaoSchema.safeParse({
        ...base,
        versao_esperada: 1,
        motivo: 'Correção fictícia',
      }).success,
    ).toBe(true);
  });

  it('recusa motivo na primeira versão', () => {
    expect(
      submissaoFichaPlantaoSchema.safeParse({ ...base, motivo: 'Correção fictícia' }).success,
    ).toBe(false);
  });
});

describe('ficha de plantão — AAD', () => {
  it('usa a forma genérica do repositório e recusa campo de outra tabela', () => {
    expect(
      metadadosAadPlantaoVersaoSchema.parse({
        tabela: 'cadastro.turno_plantao_versao',
        registro_id: registro,
        campo: 'atividades',
        formato: 1,
      }).campo,
    ).toBe('atividades');
    expect(
      metadadosAadPlantaoVersaoSchema.safeParse({
        tabela: 'cadastro.turno_plantao_versao',
        registro_id: registro,
        campo: 'conteudo',
        formato: 1,
      }).success,
    ).toBe(false);
    expect(
      metadadosAadFichaPlantaoRascunhoSchema.safeParse({
        tabela: 'cadastro.ficha_plantao_rascunho',
        registro_id: registro,
        campo: 'atividades',
        formato: 1,
      }).success,
    ).toBe(false);
  });

  it('entra na união única de AAD do repositório', () => {
    expect(
      metadadosAadSchema.safeParse({
        tabela: 'cadastro.turno_plantao_pendencia_versao',
        registro_id: pendencia,
        campo: 'conteudo',
        formato: 1,
      }).success,
    ).toBe(true);
    expect(
      metadadosAadSchema.safeParse({
        tabela: 'cadastro.turno_plantao_pendencia_versao',
        registro_id: pendencia,
        campo: 'conteudo',
        versao: 1,
        formato: 1,
      }).success,
    ).toBe(false);
  });
});
