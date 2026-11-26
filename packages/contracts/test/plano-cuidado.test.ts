import { describe, expect, it } from 'vitest';
import {
  objetivoSchema,
  revisarObjetivo,
  validarCamposExtras,
  type CampoExtraCatalogo,
  type VersaoObjetivo,
} from '../src/plano-cuidado.ts';

const objetivo = {
  descricao: 'Retomar atividade de rotina',
  area: 'rotina',
  responsavel: 'Profissional',
  situacaoInicial: 'Ainda não realizada',
  observacaoProgresso: 'Frequência informada',
  dataRevisao: '2026-12-01',
  estado: 'proposto',
} as const;

describe('objetivos do plano de cuidado', () => {
  it('aceita os seis estados e rejeita estado desconhecido', () => {
    for (const estado of [
      'proposto',
      'em andamento',
      'atingido',
      'pausado',
      'revisar',
      'encerrado',
    ])
      expect(objetivoSchema.safeParse({ ...objetivo, estado }).success).toBe(true);
    expect(objetivoSchema.safeParse({ ...objetivo, estado: 'outro' }).success).toBe(false);
    expect(objetivoSchema.safeParse({ ...objetivo, dataRevisao: '2026-02-30' }).success).toBe(
      false,
    );
  });
  it('preserva versão anterior e recusa revisão concorrente', () => {
    const historico: VersaoObjetivo[] = [
      { versao: 1, objetivo, motivo: 'Criação', responsavel: 'Profissional', data: '2026-11-04' },
    ];
    const revisao = {
      objetivo: { ...objetivo, estado: 'em andamento' },
      motivo: 'Início',
    };
    const metadados = { responsavel: 'Profissional', data: '2026-11-05' };
    const resultado = revisarObjetivo(historico, 1, revisao, metadados);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error('Revisão inesperadamente recusada');
    expect(resultado.versoes).toHaveLength(2);
    expect(resultado.versoes[0]).toEqual(historico[0]);
    expect(resultado.versoes[1]?.objetivo.estado).toBe('em andamento');
    expect(revisarObjetivo(resultado.versoes, 1, revisao, metadados)).toEqual({
      ok: false,
      erro: 'conflito',
    });
    expect(historico).toHaveLength(1);
    const primeira = historico[0];
    if (!primeira) throw new Error('Histórico vazio');
    primeira.objetivo = { ...objetivo, descricao: 'Alteração externa' };
    expect(resultado.versoes[0]?.objetivo.descricao).toBe('Retomar atividade de rotina');
    expect(resultado.versoes[1]).toMatchObject(metadados);
    expect(() =>
      revisarObjetivo(historico, 1, { ...revisao, data: '2020-01-01' }, metadados),
    ).toThrow();
  });
  it('aceita camposExtras opcionais com chave em formato de uuid', () => {
    expect(
      objetivoSchema.safeParse({
        ...objetivo,
        camposExtras: { '10000000-0000-4000-8000-000000000001': 'qualquer texto' },
      }).success,
    ).toBe(true);
    expect(objetivoSchema.safeParse(objetivo).success).toBe(true);
    expect(
      objetivoSchema.safeParse({ ...objetivo, camposExtras: { 'nao-e-uuid': 'x' } }).success,
    ).toBe(false);
  });
});

describe('validarCamposExtras', () => {
  const campoTexto: CampoExtraCatalogo = {
    campo_id: '10000000-0000-4000-8000-000000000001',
    nome: 'Observação extra',
    tipo: 'texto',
    opcoes: null,
    ativo: true,
    versao: 1,
  };
  const campoNumero: CampoExtraCatalogo = {
    campo_id: '10000000-0000-4000-8000-000000000002',
    nome: 'Sessões previstas',
    tipo: 'numero',
    opcoes: null,
    ativo: true,
    versao: 1,
  };
  const campoData: CampoExtraCatalogo = {
    campo_id: '10000000-0000-4000-8000-000000000003',
    nome: 'Data prevista de alta',
    tipo: 'data',
    opcoes: null,
    ativo: true,
    versao: 1,
  };
  const campoLista: CampoExtraCatalogo = {
    campo_id: '10000000-0000-4000-8000-000000000004',
    nome: 'Prioridade customizada',
    tipo: 'lista',
    opcoes: ['Baixa', 'Média', 'Alta'],
    ativo: true,
    versao: 1,
  };
  const campoInativo: CampoExtraCatalogo = {
    ...campoTexto,
    campo_id: '10000000-0000-4000-8000-000000000005',
    ativo: false,
  };
  const catalogo = [campoTexto, campoNumero, campoData, campoLista, campoInativo];
  const validar = (valores: Record<string, string>) => validarCamposExtras(valores, catalogo);

  it('sem camposExtras é sempre válido (opcional)', () => {
    expect(validarCamposExtras(undefined, catalogo)).toEqual({ ok: true });
  });

  it('aceita um valor por tipo', () => {
    expect(validar({ [campoTexto.campo_id]: 'qualquer coisa' })).toEqual({ ok: true });
    expect(validar({ [campoNumero.campo_id]: '42' })).toEqual({ ok: true });
    expect(validar({ [campoNumero.campo_id]: '-3.5' })).toEqual({ ok: true });
    expect(validar({ [campoData.campo_id]: '2026-12-01' })).toEqual({ ok: true });
    expect(validar({ [campoLista.campo_id]: 'Média' })).toEqual({ ok: true });
  });

  it('rejeita campo desconhecido', () => {
    const idDesconhecido = '20000000-0000-4000-8000-000000000099';
    expect(validar({ [idDesconhecido]: 'x' })).toEqual({ ok: false, erro: 'campo_desconhecido' });
  });

  it('rejeita campo desativado', () => {
    expect(validar({ [campoInativo.campo_id]: 'x' })).toEqual({
      ok: false,
      erro: 'campo_inativo',
    });
  });

  it('rejeita valor inválido por tipo', () => {
    expect(validar({ [campoTexto.campo_id]: '   ' })).toEqual({
      ok: false,
      erro: 'valor_invalido',
    });
    expect(validar({ [campoNumero.campo_id]: 'abc' })).toEqual({
      ok: false,
      erro: 'valor_invalido',
    });
    expect(validar({ [campoData.campo_id]: '2026-02-30' })).toEqual({
      ok: false,
      erro: 'valor_invalido',
    });
    expect(validar({ [campoLista.campo_id]: 'Urgente' })).toEqual({
      ok: false,
      erro: 'valor_invalido',
    });
  });

  it('não exige preencher todo campo ativo do catálogo', () => {
    expect(validar({ [campoTexto.campo_id]: 'só este' })).toEqual({ ok: true });
  });
});
