import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { montarSecoesFichaConsolidada } from './turno-execucao-ficha-consolidada.ts';
import { gerarPdfExecucao } from './turno-execucao-pdf.ts';

const TURNO = '20000000-0000-4000-8000-000000000001';
const abertura = {
  dados: {
    turno_id: TURNO,
    profissional_usuario_id: '40000000-0000-4000-8000-000000000001',
    profissional_nome: 'Marta Fictícia',
    aberto_em: '2026-11-19T07:00:00Z',
    encerrado_em: '2026-11-19T19:00:00Z',
    situacao: 'encerrado',
    versao: 1,
  },
};
const afericao = {
  dados: {
    turno_id: TURNO,
    registro_id: '30000000-0000-4000-8000-000000000001',
    registrador_usuario_id: '40000000-0000-4000-8000-000000000001',
    registrador_nome: 'Marta Fictícia',
    criado_em: '2026-11-19T09:12:00Z',
    instante_ocorrencia: '2026-11-19T09:10:00Z',
    versao: 1,
    conteudo: {
      classe: 'afericao',
      dados: { tipo: 'pressao_sistolica', valor: 128, unidade: 'mmHg' },
    },
  },
};
const entrada = { itens: [abertura, afericao], lacunas: [] } as never;

describe('consolidado diário em papel, na ordem da ficha', () => {
  it('abre o plantão e percorre as oito linhas da ficha, nessa ordem', () => {
    const titulos = montarSecoesFichaConsolidada(entrada).map((s) => s.titulo);
    expect(titulos.slice(0, 10)).toEqual([
      'Plantão',
      'Estado emocional',
      'Rotina',
      'Atividades',
      'Alimentação',
      'Medicação',
      'Intercorrências',
      'Observações',
      'Pendências',
      'Aferições registradas',
    ]);
  });

  /** A linha redigida vive na ficha do plantão, que esta emissão não consulta. Dizer "nada
   * registrado" afirmaria algo não verificado — e a família leria como ausência de cuidado. */
  it('declara a ausência das linhas redigidas em vez de afirmar que nada foi escrito', () => {
    const secoes = montarSecoesFichaConsolidada(entrada);
    for (const titulo of ['Estado emocional', 'Atividades', 'Observações', 'Pendências']) {
      const texto = secoes.find((s) => s.titulo === titulo)?.texto ?? '';
      expect(texto).toContain('Não integra esta emissão');
      expect(texto).not.toContain('Nada registrado');
    }
    expect(secoes.find((s) => s.titulo === 'Rotina')?.texto).toBe('Nada registrado neste plantão.');
  });

  it('não produz pontuação, gravidade, tendência ou conduta a partir de nenhum campo', () => {
    const texto = montarSecoesFichaConsolidada(entrada)
      .map((s) => `${s.titulo}\n${s.texto}`)
      .join('\n');
    for (const proibido of [
      /\bgrav(e|idade)\b/i,
      /\balerta\b/i,
      /\btend[êe]ncia\b/i,
      /\brecomend/i,
      /\bconduta\b/i,
      /\bescore\b/i,
      /\bpontua/i,
      /\brisco\b/i,
    ])
      expect(texto).not.toMatch(proibido);
  });

  it('período sem nenhum plantão sai como ausência declarada, sem dado de exemplo', () => {
    const secoes = montarSecoesFichaConsolidada({ itens: [], lacunas: [] } as never);
    expect(secoes[0]?.titulo).toBe('Nenhum registro neste período');
    expect(secoes.at(-1)?.titulo).toBe('Cobertura do período');
  });
});

describe('identificação exigida do documento emitido', () => {
  it('leva data de corte, autor, versão e marcação de confidencialidade ao arquivo', async () => {
    const bytes = await gerarPdfExecucao(
      'Consolidado diário no formato da ficha',
      montarSecoesFichaConsolidada(entrada),
      new AbortController().signal,
      '2026-11-19T23:59:00Z',
      {
        caso: '10000000-0000-4000-8000-000000000001',
        emissor: 'identificador do autor persistido 40000000-0000-4000-8000-000000000002',
        destinatario: 'Família Fictícia',
        proposito: 'Acompanhamento do cuidado no período',
        versao: 1,
        exportacao: '60000000-0000-4000-8000-000000000001',
        periodo: { inicio: '2026-11-19T00:00:00Z', fim: '2026-11-20T00:00:00Z' },
      },
    );
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe('Consolidado diário no formato da ficha');
    expect(pdf.getAuthor()).toContain('40000000-0000-4000-8000-000000000002');
    expect(pdf.getSubject()).toContain('confidencial');
    expect(pdf.getCreationDate()?.toISOString()).toBe('2026-11-19T23:59:00.000Z');
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    const [largura, altura] = [pdf.getPage(0).getWidth(), pdf.getPage(0).getHeight()];
    expect([Math.round(largura), Math.round(altura)]).toEqual([595, 842]);
  });
});
