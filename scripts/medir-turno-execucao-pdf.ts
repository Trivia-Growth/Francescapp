/** Medição local preparada para tarefa 10.4; não executada nesta entrega.
 * Uso futuro autorizado: pnpm exec tsx scripts/medir-turno-execucao-pdf.ts
 * Somente dados fictícios; não escreve PDFs nem conteúdo clínico no disco/log. */
import { performance } from 'node:perf_hooks';
import { gerarPdfExecucao } from '../netlify/functions/_shared/turno-execucao-pdf.ts';
const tamanhos = [25, 100, 500];
for (const quantidade of tamanhos) {
  const secoes = Array.from({ length: quantidade }, (_, i) => ({
    titulo: `Registro fictício ${i + 1}`,
    texto:
      'Aferição declarada. Valor fictício: 120 mmHg. Registrador fictício. Sem interpretação clínica automática.',
  }));
  const antes = process.memoryUsage().heapUsed;
  const inicio = performance.now();
  try {
    const bytes = await gerarPdfExecucao(
      'Relatório fictício de medição',
      secoes,
      new AbortController().signal,
      '2026-11-19T12:00:00Z',
    );
    process.stdout.write(
      `${JSON.stringify({ quantidade, milissegundos: Math.round(performance.now() - inicio), bytes: bytes.byteLength, delta_heap_bytes: process.memoryUsage().heapUsed - antes, resultado: 'gerado' })}\n`,
    );
  } catch {
    process.stdout.write(
      `${JSON.stringify({ quantidade, milissegundos: Math.round(performance.now() - inicio), resultado: 'limite_ou_indisponibilidade' })}\n`,
    );
    process.exitCode = 1;
  }
}
