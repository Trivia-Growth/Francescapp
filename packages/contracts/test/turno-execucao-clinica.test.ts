import { describe, expect, it } from 'vitest';
import {
  consultaExecucaoTurnoSchema,
  gravacaoExecucaoTurnoSchema,
  localizacaoTurnoSchema,
  metadadosAadExecucaoTurnoSchema,
  rotinaTurnoSchema,
} from '../src/turno-execucao.ts';
const id = '90000000-0000-4000-8000-000000000001';
const instante = '2026-11-19T15:00:00Z';
const cifra = { formato: 1, key_id: 'fixture', nonce: 'YQ', ciphertext: 'YQ', tag: 'YQ' };
describe('execução estruturada do turno', () => {
  it('mantém rotina estruturada válida sem observação e recusa categoria inventada', () => {
    expect(
      rotinaTurnoSchema.safeParse({
        tipo: 'hidratacao',
        turno_id: id,
        instante_ocorrencia: instante,
        mililitros: 120,
      }).success,
    ).toBe(true);
    expect(
      rotinaTurnoSchema.safeParse({
        tipo: 'refeicao',
        turno_id: id,
        instante_ocorrencia: instante,
        momento: 'almoco',
        aceitacao: 'excelente',
      }).success,
    ).toBe(false);
    expect(
      rotinaTurnoSchema.safeParse({
        tipo: 'hidratacao',
        turno_id: id,
        instante_ocorrencia: instante,
        mililitros: -1,
      }).success,
    ).toBe(false);
  });
  it('retificação exige motivo e versão imediatamente anterior', () => {
    const entrada = {
      registro_id: id,
      versao: 2,
      versao_esperada: 1,
      conteudo: {
        classe: 'rotina',
        dados: { tipo: 'hidratacao', turno_id: id, instante_ocorrencia: instante, mililitros: 120 },
      },
      chave_idempotencia: 'fixture-turno-1234',
      digest_idempotencia: 'a'.repeat(43),
    };
    expect(gravacaoExecucaoTurnoSchema.safeParse(entrada).success).toBe(false);
    expect(gravacaoExecucaoTurnoSchema.safeParse({ ...entrada, motivo: cifra }).success).toBe(true);
    expect(
      gravacaoExecucaoTurnoSchema.safeParse({ ...entrada, motivo: cifra, versao: 3 }).success,
    ).toBe(false);
  });
  it('recuperação por ID e prescrição vigente independem de janela e cursor não pode ser parcial', () => {
    expect(
      consultaExecucaoTurnoSchema.safeParse({
        classe: 'ocorrencia',
        registro_id: id,
        historico: true,
      }).success,
    ).toBe(true);
    expect(
      consultaExecucaoTurnoSchema.safeParse({ classe: 'prescricao', vigente_em: instante }).success,
    ).toBe(true);
    expect(
      consultaExecucaoTurnoSchema.safeParse({
        classe: 'ocorrencia',
        inicio: instante,
        fim: '2026-11-20T15:00:00Z',
        cursor_id: id,
      }).success,
    ).toBe(false);
  });
  it('localização não inventa coordenada em ausência nem mistura consentimento negado com coordenada', () => {
    expect(
      localizacaoTurnoSchema.safeParse({
        turno_id: id,
        momento: 'abertura',
        motivo_ausencia: 'consentimento_ausente',
      }).success,
    ).toBe(true);
    expect(
      localizacaoTurnoSchema.safeParse({
        turno_id: id,
        momento: 'abertura',
        motivo_ausencia: 'permissao_negada',
        latitude: -20,
        longitude: -40,
        precisao_metros: 20,
      }).success,
    ).toBe(false);
    expect(
      localizacaoTurnoSchema.safeParse({
        turno_id: id,
        momento: 'abertura',
        latitude: 100,
        longitude: -40,
        precisao_metros: 20,
      }).success,
    ).toBe(false);
  });
  it('motivo da situação e justificativa da retificação têm campos AAD diferentes', () => {
    const aad = {
      tabela: 'cadastro.turno_administracao_versao',
      paciente_id: id,
      turno_id: id,
      registro_id: id,
      versao: 2,
      formato: 1,
    };
    expect(metadadosAadExecucaoTurnoSchema.parse({ ...aad, campo: 'motivo' }).campo).not.toBe(
      metadadosAadExecucaoTurnoSchema.parse({ ...aad, campo: 'motivo_situacao' }).campo,
    );
  });
});
