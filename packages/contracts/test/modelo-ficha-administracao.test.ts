import { describe, expect, it } from 'vitest';
import {
  campoExtraCatalogoGeneralizadoSchema,
  gravarCampoExtraEscopoSchema,
  ordenarModelo,
  respostaCampoExtraEscopoPrivadaSchema,
} from '../src/campo-extra-catalogo.ts';
import { gravarPapelDeclaradoSchema, papelDeclaradoSchema } from '../src/papel-declarado.ts';

const campo = {
  campo_id: '7f1c0001-0000-4000-8000-000000000002',
  escopo: 'ficha_plantao',
  nome: 'Rotina',
  tipo: 'texto_longo',
  opcoes: null,
  ativo: true,
  ordem: 2,
  obrigatorio: false,
  de_fabrica: true,
  visibilidade: 'compartilhavel',
  versao: 1,
} as const;

describe('modelo da ficha de plantão', () => {
  it('aceita o campo de fábrica como o banco o devolve', () => {
    expect(campoExtraCatalogoGeneralizadoSchema.parse(campo)).toEqual(campo);
  });

  it('recusa escopo, visibilidade e tipo fora do conjunto fechado', () => {
    for (const desvio of [
      { escopo: 'ficha_do_vizinho' },
      { visibilidade: 'publica' },
      { tipo: 'assinatura' },
    ])
      expect(campoExtraCatalogoGeneralizadoSchema.safeParse({ ...campo, ...desvio }).success).toBe(
        false,
      );
  });

  it('recusa campo desconhecido no retrato do catálogo', () => {
    expect(
      campoExtraCatalogoGeneralizadoSchema.safeParse({ ...campo, prioridade: 'alta' }).success,
    ).toBe(false);
  });

  it('exige opções apenas no tipo lista', () => {
    const entrada = {
      campo_id: campo.campo_id,
      escopo: campo.escopo,
      nome: campo.nome,
      tipo: campo.tipo,
      opcoes: campo.opcoes,
      ativo: campo.ativo,
      ordem: campo.ordem,
      obrigatorio: campo.obrigatorio,
      visibilidade: campo.visibilidade,
      versao_esperada: 1,
    };
    expect(gravarCampoExtraEscopoSchema.safeParse(entrada).success).toBe(true);
    expect(gravarCampoExtraEscopoSchema.safeParse({ ...entrada, tipo: 'lista' }).success).toBe(
      false,
    );
    expect(
      gravarCampoExtraEscopoSchema.safeParse({ ...entrada, tipo: 'lista', opcoes: ['Sim'] })
        .success,
    ).toBe(true);
    expect(gravarCampoExtraEscopoSchema.safeParse({ ...entrada, opcoes: ['Sim'] }).success).toBe(
      false,
    );
  });

  it('não deixa o Administrador declarar um campo como de fábrica', () => {
    expect(
      gravarCampoExtraEscopoSchema.safeParse({
        campo_id: campo.campo_id,
        escopo: 'ficha_plantao',
        nome: 'Houve banho?',
        tipo: 'booleano',
        opcoes: null,
        ativo: true,
        ordem: 9,
        obrigatorio: false,
        visibilidade: 'interna',
        versao_esperada: 0,
        de_fabrica: true,
      }).success,
    ).toBe(false);
  });

  it('ordena pelo modelo e não pela chegada', () => {
    const fora = [
      { ...campo, campo_id: '7f1c0001-0000-4000-8000-000000000007', nome: 'Observações', ordem: 7 },
      { ...campo, campo_id: '7f1c0001-0000-4000-8000-000000000001', nome: 'Estado', ordem: 1 },
    ];
    expect(ordenarModelo(fora).map((item) => item.ordem)).toEqual([1, 7]);
  });

  it('reconhece a recusa por conflito do modelo alterado durante o preenchimento', () => {
    const recusa = respostaCampoExtraEscopoPrivadaSchema.parse({
      ok: false,
      erro: { codigo: 'conflito' },
      request_id: '00000000-0000-4000-8000-000000000001',
    });
    expect(recusa.ok).toBe(false);
  });
});

describe('papel declarado', () => {
  const papel = {
    papel_id: '7f2d0001-0000-4000-8000-000000000001',
    nome: 'Acompanhante terapêutico',
    ativo: true,
    de_fabrica: true,
    versao: 1,
  } as const;

  it('aceita o papel semeado', () => {
    expect(papelDeclaradoSchema.parse(papel)).toEqual(papel);
  });

  it('não carrega perfil, capacidade ou qualquer marca de autorização', () => {
    for (const desvio of [{ perfil: 'administrador' }, { capacidades: ['administrar_concessoes'] }])
      expect(papelDeclaradoSchema.safeParse({ ...papel, ...desvio }).success).toBe(false);
    expect(Object.keys(papelDeclaradoSchema.shape)).toEqual([
      'papel_id',
      'nome',
      'ativo',
      'de_fabrica',
      'versao',
    ]);
  });

  it('recusa nome vazio e aceita a criação com versão esperada zero', () => {
    expect(
      gravarPapelDeclaradoSchema.safeParse({
        papel_id: papel.papel_id,
        nome: '   ',
        ativo: true,
        versao_esperada: 0,
      }).success,
    ).toBe(false);
    expect(
      gravarPapelDeclaradoSchema.parse({
        papel_id: papel.papel_id,
        nome: '  Fonoaudióloga ',
        ativo: true,
        versao_esperada: 0,
      }).nome,
    ).toBe('Fonoaudióloga');
  });
});
