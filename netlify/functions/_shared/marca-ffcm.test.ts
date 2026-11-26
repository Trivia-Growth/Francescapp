import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { bytesMarcaFfcm, PROPORCAO_MARCA_FFCM } from './marca-ffcm.ts';

const RAIZ = new URL('../../../', import.meta.url).pathname;

/** `docs/projeto/identidade-visual.md`: a marca recebida entra como recebida. Não existe
 * logo vetorial nem PNG transparente, e é proibido recortar fundo, simular transparência,
 * esticar ou redesenhar o símbolo. Como o PDF embute uma cópia em base64 — a função servida
 * não lê `assets/` em execução —, este teste é o que impede a cópia de virar uma variante
 * editada em silêncio. */
it('embute exatamente os bytes do logo recebido, sem edição', () => {
  const recebido = readFileSync(join(RAIZ, 'assets/brand/francescato/ffcm-logo-oliva.jpg'));
  expect(Buffer.from(bytesMarcaFfcm())).toEqual(recebido);
});

it('mantém a proporção original de 1006 x 895', () => {
  expect(PROPORCAO_MARCA_FFCM).toBeCloseTo(895 / 1006, 10);
});
