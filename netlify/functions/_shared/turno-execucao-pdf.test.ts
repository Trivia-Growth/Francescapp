import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { gerarPdfExecucao } from './turno-execucao-pdf.ts';
describe('PDF limitado e determinístico', () => {
  it('repete bytes para o mesmo corte e conteúdo e preserva data de corte', async () => {
    const entrada = [
      { titulo: 'Observação registrada', texto: 'Paciente fictício. Valor informado: 120 mmHg.' },
    ];
    const sinal = new AbortController().signal;
    const corte = '2026-11-19T12:00:00Z';
    const a = await gerarPdfExecucao('Relatório diário', entrada, sinal, corte);
    const b = await gerarPdfExecucao('Relatório diário', entrada, sinal, corte);
    expect(a).toEqual(b);
    expect((await PDFDocument.load(a)).getCreationDate()?.toISOString()).toBe(
      '2026-11-19T12:00:00.000Z',
    );
  });
  it('glifo sem suporte falha honestamente sem substituir texto clínico', async () => {
    await expect(
      gerarPdfExecucao(
        'Relatório',
        [{ titulo: 'Observação', texto: 'Observação fictícia 😀' }],
        new AbortController().signal,
        '2026-11-19T12:00:00Z',
      ),
    ).rejects.toThrow();
  });
  it('limite de conteúdo falha antes da geração, sem truncar', async () => {
    await expect(
      gerarPdfExecucao(
        'Relatório',
        [{ titulo: 'Texto', texto: 'a'.repeat(500001) }],
        new AbortController().signal,
        '2026-11-19T12:00:00Z',
      ),
    ).rejects.toThrow();
  });
  it('cancelamento impede resultado', async () => {
    const c = new AbortController();
    c.abort();
    await expect(
      gerarPdfExecucao('Relatório', [], c.signal, '2026-11-19T12:00:00Z'),
    ).rejects.toThrow();
  });
});
