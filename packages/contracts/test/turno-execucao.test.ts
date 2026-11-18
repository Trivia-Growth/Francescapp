import { describe, expect, it } from 'vitest';
import { aberturaTurnoSchema, encerramentoTurnoSchema, turnoSchema } from '../src/turno.ts';
import {
  criacaoTurnoPrevistoSchema,
  substituicaoTurnoSchema,
  turnoPrevistoSchema,
} from '../src/turno-escala.ts';
import { sinalVitalSchema } from '../src/sinal-vital.ts';
import { administracaoMedicacaoSchema, itemMedicacaoPrescritaSchema } from '../src/medicacao.ts';
import { ocorrenciaTurnoSchema } from '../src/ocorrencia-turno.ts';
import { contratosRotas } from '../src/rotas.ts';

const id = '00000000-0000-4000-8000-000000000001';
const cifra = {
  formato: 1,
  key_id: 'teste-ficticio',
  nonce: 'bm9uY2U',
  ciphertext: 'Y2lmcmE',
  tag: 'dGFn',
};
const reserva = { reserva_id: id, geracao_reserva: 1 };
const instante = '2026-11-18T12:00:00Z';
const turno = {
  turno_id: id,
  paciente_id: id,
  profissional_usuario_id: id,
  aberto_em: instante,
  encerrado_em: null,
  situacao: 'aberto',
  versao: 1,
  parametros: {
    duracao_padrao_minutos: 480,
    tolerancia_atraso_minutos: 15,
    tratamento_nao_encerrado: 'sinalizar_pendencia',
  },
};

describe('contratos do turno — fronteiras de entrada', () => {
  it('aceita abertura reservada e recusa campos de autoridade forjados', () => {
    const entrada = { ...reserva, turno_id: id };
    expect(aberturaTurnoSchema.safeParse(entrada).success).toBe(true);
    for (const campo of ['profissional_usuario_id', 'aberto_em', 'encerrado_em', 'extra']) {
      expect(aberturaTurnoSchema.safeParse({ ...entrada, [campo]: id }).success).toBe(false);
    }
    expect(aberturaTurnoSchema.safeParse({ ...entrada, geracao_reserva: 0 }).success).toBe(false);
  });
  it('exige referência à síntese e versão para encerramento', () => {
    const entrada = { ...reserva, turno_id: id, versao_esperada: 1, sintese_registro_id: id };
    expect(encerramentoTurnoSchema.safeParse(entrada).success).toBe(true);
    expect(
      encerramentoTurnoSchema.safeParse({ ...reserva, turno_id: id, versao_esperada: 1 }).success,
    ).toBe(false);
    expect(encerramentoTurnoSchema.safeParse({ ...entrada, versao_esperada: 0 }).success).toBe(
      false,
    );
  });
  it('recusa situação incompatível com relógio do turno', () => {
    expect(turnoSchema.safeParse(turno).success).toBe(true);
    expect(turnoSchema.safeParse({ ...turno, situacao: 'encerrado' }).success).toBe(false);
    expect(
      turnoSchema.safeParse({
        ...turno,
        situacao: 'encerrado',
        encerrado_em: '2026-11-18T11:00:00Z',
      }).success,
    ).toBe(false);
  });
  it('exige motivo cifrado em substituição e janela de escala ordenada', () => {
    const entrada = {
      ...reserva,
      escala_id: id,
      profissional_assumiu_usuario_id: id,
      versao_esperada: 1,
      tipo: 'substituicao',
      motivo: cifra,
    };
    expect(substituicaoTurnoSchema.safeParse(entrada).success).toBe(true);
    const { motivo: _motivo, ...semMotivo } = entrada;
    expect(substituicaoTurnoSchema.safeParse(semMotivo).success).toBe(false);
    expect(
      turnoPrevistoSchema.safeParse({
        escala_id: id,
        paciente_id: id,
        profissional_previsto_usuario_id: id,
        inicio_previsto: instante,
        fim_previsto: instante,
        versao: 1,
      }).success,
    ).toBe(false);
    expect(
      criacaoTurnoPrevistoSchema.safeParse({
        ...reserva,
        escala: {
          escala_id: id,
          paciente_id: id,
          profissional_previsto_usuario_id: id,
          inicio_previsto: instante,
          fim_previsto: instante,
        },
      }).success,
    ).toBe(false);
  });
  it('recusa unidade incompatível e valor não numérico sem interpretar gravidade', () => {
    const medida = {
      turno_id: id,
      tipo: 'temperatura',
      valor: 39,
      unidade: '°C',
      instante_afericao: instante,
    };
    expect(sinalVitalSchema.safeParse(medida).success).toBe(true);
    expect(sinalVitalSchema.safeParse({ ...medida, valor: '39' }).success).toBe(false);
    expect(sinalVitalSchema.safeParse({ ...medida, unidade: 'bpm' }).success).toBe(false);
    expect(sinalVitalSchema.safeParse({ ...medida, gravidade: 'alta' }).success).toBe(false);
  });
  it('exige fonte documental na transcrição', () => {
    const item = {
      nome: cifra,
      dose: cifra,
      via: cifra,
      horarios: ['12:00:00'],
      vigencia_inicio: instante,
      vigencia_fim: null,
      fonte_documental: cifra,
    };
    expect(itemMedicacaoPrescritaSchema.safeParse(item).success).toBe(true);
    const { fonte_documental: _fonte, ...semFonte } = item;
    expect(itemMedicacaoPrescritaSchema.safeParse(semFonte).success).toBe(false);
  });
  it('exige executor, motivo condicional e recusa registrador enviado', () => {
    const administracao = {
      turno_id: id,
      item_id: id,
      versao: 1,
      executor: { nome: cifra, vinculo: cifra },
      situacao: 'administrado',
    };
    expect(administracaoMedicacaoSchema.safeParse(administracao).success).toBe(true);
    for (const situacao of ['recusado', 'adiado', 'nao_administrado']) {
      expect(administracaoMedicacaoSchema.safeParse({ ...administracao, situacao }).success).toBe(
        false,
      );
      expect(
        administracaoMedicacaoSchema.safeParse({ ...administracao, situacao, motivo: cifra })
          .success,
      ).toBe(true);
    }
    expect(
      administracaoMedicacaoSchema.safeParse({ ...administracao, executor: undefined }).success,
    ).toBe(false);
    expect(
      administracaoMedicacaoSchema.safeParse({ ...administracao, registrador_usuario_id: id })
        .success,
    ).toBe(false);
  });
  it('aceita ocorrência cifrada e recusa URL pública ou campo extra', () => {
    const ocorrencia = {
      turno_id: id,
      descricao: cifra,
      instante_ocorrencia: instante,
      providencia: cifra,
    };
    expect(ocorrenciaTurnoSchema.safeParse(ocorrencia).success).toBe(true);
    expect(
      ocorrenciaTurnoSchema.safeParse({ ...ocorrencia, anexo_url: 'https://example.com/imagem' })
        .success,
    ).toBe(false);
    expect(ocorrenciaTurnoSchema.safeParse({ ...ocorrencia, extra: true }).success).toBe(false);
  });
  it('mantém prova de sessão e chave idempotente nas rotas de mutação', () => {
    const rota = contratosRotas.abrirTurno;
    expect(
      rota.cabecalhos.safeParse({ 'x-chave-idempotencia': 'ficticio-1234567890' }).success,
    ).toBe(false);
    expect(rota.parametros.safeParse({ paciente_id: id }).success).toBe(true);
  });
});
