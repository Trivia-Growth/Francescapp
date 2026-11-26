import { describe, expect, it } from 'vitest';
import {
  alterarValorAcordadoSchema,
  apuracaoRepasseSchema,
  comprovanteDespesaSchema,
  consultarApuracaoSchema,
  despesaSchema,
  linhaApuracaoSchema,
  registrarDespesaSchema,
  registrarValorAcordadoSchema,
  valorAcordadoSchema,
  VALOR_MAXIMO_CENTAVOS,
} from '../src/financeiro.ts';
import { financeiroHttp } from '../src/financeiro-http.ts';

/** FR-068/FR-069/FR-070. Estes testes existem porque três proibições do recorte só são
 * verificáveis no contrato: nenhum campo de duração ou valor-hora (FR-068), nenhum
 * conteúdo clínico no retorno da apuração (design D6) e o instante da consulta sempre
 * presente (design D3). Um campo frouxo aqui vira, respectivamente, cálculo de jornada,
 * vazamento de saúde para quem só devia ver dinheiro, e dois totais indistinguíveis. */

const PROFISSIONAL = '10000000-0000-4000-8000-000000000002';
const PACIENTE = '40000000-0000-4000-8000-000000000001';
const TURNO = '50000000-0000-4000-8000-000000000001';
const VIGENCIA = '60000000-0000-4000-8000-000000000001';
const AUTOR = '10000000-0000-4000-8000-000000000001';

const COMPROVANTE = {
  objeto_nome: 'despesas/ficticia-1.pdf',
  mime_type: 'application/pdf' as const,
  tamanho_bytes: 2048,
  digest: 'sha256-ficticio',
};

const VALOR_ACORDADO = {
  valor_id: VIGENCIA,
  profissional_usuario_id: PROFISSIONAL,
  valor_turno_centavos: 24_000,
  vigencia: { inicio: '2026-11-01', fim: null },
  motivo: 'Acordo inicial fictício.',
};

const DESPESA = {
  despesa_id: '70000000-0000-4000-8000-000000000001',
  paciente_id: PACIENTE,
  descricao: 'Fralda geriátrica fictícia.',
  valor_centavos: 15_000,
  data: '2026-11-10',
  responsavel_usuario_id: PROFISSIONAL,
  autorizacao: 'Autorização fictícia da família registrada em 10/11/2026.',
  comprovante: COMPROVANTE,
};

/** Varre as chaves de todos os schemas do domínio: a proibição de FR-068 é sobre o
 * vocabulário inteiro, não sobre um schema específico. */
const CHAVES_DO_DOMINIO = [
  ...Object.keys(registrarValorAcordadoSchema.shape),
  ...Object.keys(valorAcordadoSchema.shape),
  ...Object.keys(alterarValorAcordadoSchema.shape),
  ...Object.keys(registrarDespesaSchema.shape),
  ...Object.keys(despesaSchema.shape),
  ...Object.keys(comprovanteDespesaSchema.shape),
  ...Object.keys(consultarApuracaoSchema.shape),
  ...linhaApuracaoSchema.options.flatMap((opcao) => Object.keys(opcao.shape)),
  ...apuracaoRepasseSchema.options.flatMap((opcao) => Object.keys(opcao.shape)),
];

describe('valor acordado por turno (FR-068)', () => {
  it('aceita o registro completo de uma vigência', () => {
    expect(registrarValorAcordadoSchema.safeParse(VALOR_ACORDADO).success).toBe(true);
  });

  it('recusa campo desconhecido', () => {
    expect(
      registrarValorAcordadoSchema.safeParse({ ...VALOR_ACORDADO, valor_hora_centavos: 3000 })
        .success,
    ).toBe(false);
  });

  it('não expõe nenhum campo de duração ou de valor-hora em todo o domínio', () => {
    const proibidos = /duracao|duração|hora|minuto|jornada|extra|adicional|banco_de_horas/i;
    expect(CHAVES_DO_DOMINIO.filter((chave) => proibidos.test(chave))).toEqual([]);
  });

  it('recusa valor zero, negativo e acima do limite de sanidade', () => {
    for (const valor of [0, -1, VALOR_MAXIMO_CENTAVOS + 1, 10.5]) {
      expect(
        registrarValorAcordadoSchema.safeParse({
          ...VALOR_ACORDADO,
          valor_turno_centavos: valor,
        }).success,
      ).toBe(false);
    }
  });

  it('recusa vigência com fim anterior ao início', () => {
    expect(
      registrarValorAcordadoSchema.safeParse({
        ...VALOR_ACORDADO,
        vigencia: { inicio: '2026-11-10', fim: '2026-11-01' },
      }).success,
    ).toBe(false);
  });

  it('exige autor e instante no registro devolvido', () => {
    expect(
      valorAcordadoSchema.safeParse({
        ...VALOR_ACORDADO,
        autor_usuario_id: AUTOR,
        registrado_em: '2026-11-01T12:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(valorAcordadoSchema.safeParse(VALOR_ACORDADO).success).toBe(false);
  });
});

describe('despesa do cuidado (FR-069)', () => {
  it('aceita despesa completa vinculada a caso', () => {
    expect(registrarDespesaSchema.safeParse(DESPESA).success).toBe(true);
  });

  it('recusa despesa sem autorização registrada', () => {
    const { autorizacao: _descartada, ...semAutorizacao } = DESPESA;
    expect(registrarDespesaSchema.safeParse(semAutorizacao).success).toBe(false);
    expect(registrarDespesaSchema.safeParse({ ...DESPESA, autorizacao: '   ' }).success).toBe(
      false,
    );
  });

  it('recusa despesa sem caso vinculado', () => {
    const { paciente_id: _descartado, ...semCaso } = DESPESA;
    expect(registrarDespesaSchema.safeParse(semCaso).success).toBe(false);
    expect(registrarDespesaSchema.safeParse({ ...DESPESA, paciente_id: null }).success).toBe(false);
  });

  it('aceita valor alto sem campo de aprovação adicional', () => {
    const alta = registrarDespesaSchema.safeParse({
      ...DESPESA,
      valor_centavos: VALOR_MAXIMO_CENTAVOS,
    });
    expect(alta.success).toBe(true);
    expect(Object.keys(registrarDespesaSchema.shape)).not.toContain('aprovacao');
    expect(Object.keys(despesaSchema.shape)).not.toContain('aprovacao');
    expect(Object.keys(despesaSchema.shape)).not.toContain('pendente_aprovacao');
  });

  it('recusa comprovante fora do formato e do tamanho aceitos', () => {
    expect(
      comprovanteDespesaSchema.safeParse({ ...COMPROVANTE, mime_type: 'text/html' }).success,
    ).toBe(false);
    expect(
      comprovanteDespesaSchema.safeParse({ ...COMPROVANTE, tamanho_bytes: 5_242_881 }).success,
    ).toBe(false);
  });

  it('não transporta URL do comprovante, nem pública nem assinada', () => {
    expect(
      comprovanteDespesaSchema.safeParse({ ...COMPROVANTE, url_assinada: 'https://x.invalido' })
        .success,
    ).toBe(false);
    expect(Object.keys(comprovanteDespesaSchema.shape).join(' ')).not.toMatch(/url/i);
  });

  it('preserva o lançamento original na retificação', () => {
    const retificada = despesaSchema.safeParse({
      ...DESPESA,
      autor_usuario_id: AUTOR,
      registrado_em: '2026-11-10T12:00:00.000Z',
      versao: 2,
      retificacao_de_versao: 1,
      motivo_retificacao: 'Valor digitado errado.',
    });
    expect(retificada.success).toBe(true);
  });
});

describe('apuração de repasse (FR-070)', () => {
  const LINHA_APURADA = {
    situacao: 'apurada' as const,
    turno_id: TURNO,
    profissional_usuario_id: PROFISSIONAL,
    data: '2026-11-05T20:00:00.000Z',
    valor_centavos: 24_000,
    vigencia_id: VIGENCIA,
  };
  const APURACAO = {
    origem: 'consulta_aberta' as const,
    consultado_em: '2026-11-19T10:00:00.000Z',
    profissional_usuario_id: PROFISSIONAL,
    periodo_inicio: '2026-11-01',
    periodo_fim: '2026-11-30',
    linhas: [LINHA_APURADA],
    total_centavos: 24_000,
    pendentes: 0,
  };

  it('aceita a apuração aberta com o instante da consulta', () => {
    expect(apuracaoRepasseSchema.safeParse(APURACAO).success).toBe(true);
  });

  it('recusa apuração sem o instante da consulta', () => {
    const { consultado_em: _descartado, ...semInstante } = APURACAO;
    expect(apuracaoRepasseSchema.safeParse(semInstante).success).toBe(false);
  });

  it('mantém o ponto de extensão para um fechamento travado futuro', () => {
    // D3: a união discriminada tem hoje um membro só. Um fechamento gravado entra como
    // membro novo sem alterar este; se alguém trocar a união por um objeto plano, isto cai.
    expect(apuracaoRepasseSchema.options).toHaveLength(1);
    expect(apuracaoRepasseSchema.safeParse({ ...APURACAO, origem: 'fechamento' }).success).toBe(
      false,
    );
  });

  it('aceita estado vazio honesto e o distingue de falha', () => {
    const vazia = apuracaoRepasseSchema.safeParse({
      ...APURACAO,
      linhas: [],
      total_centavos: 0,
    });
    expect(vazia.success).toBe(true);
  });

  it('apresenta turno aberto como pendente de resolução, sem valor', () => {
    expect(
      linhaApuracaoSchema.safeParse({
        situacao: 'pendente_resolucao',
        turno_id: TURNO,
        profissional_usuario_id: PROFISSIONAL,
        data: null,
        valor_centavos: null,
        vigencia_id: null,
      }).success,
    ).toBe(true);
    expect(
      linhaApuracaoSchema.safeParse({
        situacao: 'pendente_resolucao',
        turno_id: TURNO,
        profissional_usuario_id: PROFISSIONAL,
        data: null,
        valor_centavos: 24_000,
        vigencia_id: null,
      }).success,
    ).toBe(false);
  });

  it('apresenta turno sem vigência como pendente de valor, sem valor presumido', () => {
    expect(
      linhaApuracaoSchema.safeParse({
        situacao: 'pendente_valor',
        turno_id: TURNO,
        profissional_usuario_id: PROFISSIONAL,
        data: '2026-11-05T20:00:00.000Z',
        valor_centavos: null,
        vigencia_id: null,
      }).success,
    ).toBe(true);
  });

  it('não expõe conteúdo de saúde do turno', () => {
    const clinicos = [
      'paciente_id',
      'parametros',
      'passagem',
      'afericao',
      'medicacao',
      'rotina',
      'ocorrencia',
      'prescricao',
      'administracao',
    ];
    for (const opcao of linhaApuracaoSchema.options) {
      expect(Object.keys(opcao.shape).filter((chave) => clinicos.includes(chave))).toEqual([]);
    }
    for (const campo of clinicos) {
      expect(linhaApuracaoSchema.safeParse({ ...LINHA_APURADA, [campo]: 'x' }).success).toBe(false);
    }
  });

  it('recusa período invertido na consulta', () => {
    expect(
      consultarApuracaoSchema.safeParse({
        profissional_usuario_id: PROFISSIONAL,
        periodo_inicio: '2026-11-30',
        periodo_fim: '2026-11-01',
      }).success,
    ).toBe(false);
  });
});

describe('contrato HTTP do financeiro', () => {
  it('não aninha valor acordado nem apuração em caminho de paciente', () => {
    expect(financeiroHttp.registrarValorAcordado.caminho).not.toMatch(/pacientes/);
    expect(financeiroHttp.consultarValoresAcordados.caminho).not.toMatch(/pacientes/);
    expect(financeiroHttp.consultarApuracao.caminho).not.toMatch(/pacientes/);
  });

  it('não oferece rota de URL do comprovante', () => {
    const caminhos = Object.values(financeiroHttp).map((rota) => rota.caminho);
    expect(caminhos.filter((caminho) => /url|assinad|publico/i.test(caminho))).toEqual([]);
    expect(financeiroHttp.consultarComprovante.metodo).toBe('GET');
  });
});
