// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { apresentarConsolidadoFicha } from './consolidado-ficha-plantao.js';
import type { RelatorioTurnoPublico } from '../packages/contracts/src/turno-execucao-http.ts';

/** FR-080. Dados fictícios. O consolidado reusa a projeção autorizada de FR-062 como ela
 * chega: aqui se prova o agrupamento por plantão e a rotulagem na ordem da ficha, nunca uma
 * regra de audiência — a audiência é decidida no servidor e no banco, antes desta tela. */

const paciente = '50000000-0000-4000-8000-000000000001';
const turnoA = '50000000-0000-4000-8000-00000000000a';
const turnoB = '50000000-0000-4000-8000-00000000000b';

function relatorio(
  itens: RelatorioTurnoPublico['itens'],
  lacunas: RelatorioTurnoPublico['lacunas'] = [],
): RelatorioTurnoPublico {
  return {
    consulta_id: '50000000-0000-4000-8000-000000000002',
    instante_corte: '2026-11-20T23:00:00.000Z',
    rotulos_atuais: true,
    tipo: 'diario',
    paciente_id: paciente,
    inicio: '2026-11-20T00:00:00.000Z',
    fim: '2026-11-21T00:00:00.000Z',
    itens,
    proximo_cursor: null,
    lacunas,
  };
}

function turno(id: string, aberto: string, nome: string): RelatorioTurnoPublico['itens'][number] {
  return {
    categoria: 'turno',
    id,
    versao: 1,
    instante: aberto,
    dados: {
      turno_id: id,
      paciente_id: paciente,
      profissional_usuario_id: '50000000-0000-4000-8000-000000000003',
      profissional_nome: nome,
      aberto_em: aberto,
      encerrado_em: null,
      situacao: 'aberto',
      versao: 1,
      parametros: {
        duracao_padrao_minutos: 360,
        tolerancia_atraso_minutos: 30,
        tratamento_nao_encerrado: 'sinalizar_pendencia',
      },
    },
  };
}

function refeicao(turnoId: string, registro: string): RelatorioTurnoPublico['itens'][number] {
  return {
    categoria: 'rotina',
    id: registro,
    versao: 1,
    instante: '2026-11-20T12:00:00.000Z',
    dados: {
      paciente_id: paciente,
      turno_id: turnoId,
      registro_id: registro,
      versao: 1,
      conteudo: {
        classe: 'rotina',
        dados: {
          tipo: 'refeicao',
          turno_id: turnoId,
          instante_ocorrencia: '2026-11-20T12:00:00.000Z',
          momento: 'almoco',
          aceitacao: 'parcial',
        },
      },
      registrador_usuario_id: '50000000-0000-4000-8000-000000000003',
      registrador_nome: 'Profissional fictício',
      criado_em: '2026-11-20T12:05:00.000Z',
      instante_ocorrencia: '2026-11-20T12:00:00.000Z',
      retificada: false,
    },
  };
}

it('agrupa por plantão, na ordem da ficha, com período e papel declarado', () => {
  const secao = apresentarConsolidadoFicha(
    relatorio([
      turno(turnoA, '2026-11-20T07:00:00.000Z', 'Acompanhante fictícia'),
      refeicao(turnoA, '50000000-0000-4000-8000-000000000011'),
      turno(turnoB, '2026-11-20T19:00:00.000Z', 'Enfermeira fictícia'),
    ]),
    new Map([
      [
        turnoA,
        {
          ficha: {
            registro_id: turnoA,
            turno_id: turnoA,
            versao: 1,
            periodo: 'diurno' as const,
            papel_declarado: 'Acompanhante terapêutico',
            atividades: {
              texto: 'Caminhada fictícia no quintal.',
              fonte: 'observacao_direta' as const,
              visibilidade: 'compartilhavel' as const,
            },
            observacoes: null,
            autor_usuario_id: '50000000-0000-4000-8000-000000000003',
            registrado_em: '2026-11-20T13:00:00.000Z',
            retroativo: true,
          },
          pendencias: [],
        },
      ],
    ]),
  );
  const plantoes = [...secao.querySelectorAll(':scope > article')];
  expect(plantoes).toHaveLength(2);
  const primeiro = plantoes[0];
  if (!primeiro) throw new Error('Plantão ausente');
  const linhas = [...primeiro.querySelectorAll('section > h4')].map((h) => h.textContent);
  expect(linhas).toEqual([
    'Estado emocional',
    'Rotina',
    'Atividades',
    'Alimentação',
    'Medicação',
    'Intercorrências',
    'Observações',
    'Pendências',
  ]);
  expect(primeiro.textContent).toContain('Plantão: Diurno');
  expect(primeiro.textContent).toContain('Papel declarado: Acompanhante terapêutico');
  expect(primeiro.textContent).toContain('Abertura retroativa declarada');
  expect(primeiro.textContent).toContain('Caminhada fictícia no quintal.');
  expect(primeiro.textContent).toContain('Conteúdo compartilhável com a família autorizada.');
  // A refeição entra em Alimentação, não em Rotina, e continua sendo o registro canônico.
  const alimentacao = [...primeiro.querySelectorAll('section')].find(
    (s) => s.querySelector('h4')?.textContent === 'Alimentação',
  );
  expect(alimentacao?.textContent).toContain('Almoço');
  // O segundo plantão não tem ficha nesta audiência: o campo aparece como indisponível, sem
  // que o teor do que foi omitido seja revelado.
  expect(plantoes[1]?.textContent).toContain(
    'Ficha do plantão não disponível para a sua audiência nesta consulta.',
  );
  expect(plantoes[1]?.textContent).toContain('Papel declarado: Não informado');
  expect(secao.textContent).not.toMatch(/(gravidade|risco|alerta|tendência|conduta)\s*:/i);
});

it('dia sem plantão mostra vazio após consulta concluída, sem dado de exemplo', () => {
  const secao = apresentarConsolidadoFicha(relatorio([]));
  expect(secao.textContent).toContain('Nenhum registro neste período');
  expect(secao.textContent).toContain('não é falha, e não há dado de exemplo');
  expect(secao.querySelectorAll(':scope > article')).toHaveLength(0);
});

it('lacuna de cobertura é indicada', () => {
  const secao = apresentarConsolidadoFicha(
    relatorio(
      [turno(turnoA, '2026-11-20T07:00:00.000Z', 'Acompanhante fictícia')],
      [{ inicio: '2026-11-20T13:00:00.000Z', fim: '2026-11-20T19:00:00.000Z' }],
    ),
  );
  expect(secao.textContent).toContain('Lacuna de cobertura:');
});
