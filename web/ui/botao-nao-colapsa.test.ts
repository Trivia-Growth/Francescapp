// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/** Em 25/11/2026, na carteira publicada, "Novo paciente" media 0x0 no iPhone 14 e 148x46 no
 * computador. O elemento estava `display:flex`, `visibility:visible`, `opacity:1` e
 * `hidden:false` — nada no CSS dizia para escondê-lo. Ele simplesmente encolheu até sumir,
 * porque dentro de um contêiner flex o irmão com o título tomou a linha inteira.
 *
 * Resultado: a ação principal da tela não existia no telefone, e nenhuma verificação
 * apontava isso, porque por toda medida comum o botão estava lá.
 *
 * jsdom não calcula layout, então o alarme é sobre a REGRA: o botão precisa declarar que
 * não encolhe. */
it('declara que o botão não encolhe dentro de um contêiner flex', () => {
  const css = readFileSync('web/ui/ui.css', 'utf8');
  const inicio = css.indexOf('.ui-botao {');
  expect(inicio).toBeGreaterThan(-1);
  const regra = css.slice(inicio, css.indexOf('}', inicio));
  expect(regra).toContain('flex: 0 0 auto');
  expect(regra).toContain('white-space: nowrap');
});
