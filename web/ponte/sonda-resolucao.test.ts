import { expect, it } from 'vitest';
import { sonda } from './sonda-resolucao.js';

/* Prova mecânica da migração por ilha: um módulo pode virar `.tsx` sem que quem o importa
   mude uma linha. `main.ts` importa `./concessao-equipe.js`; o resolvedor encontra `.ts`
   ou `.tsx` igualmente. Sem isso, cada módulo migrado obrigaria a editar `main.ts`, e os
   90 módulos virariam 90 conflitos num arquivo só. */
it('resolve um módulo .tsx por um caminho escrito com .js', () => {
  expect(sonda()).toBe('resolveu .tsx por caminho .js');
});
