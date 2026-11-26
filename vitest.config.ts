import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['minimal'],
    silent: 'passed-only',
    /* Teto de trabalhadores, medido em 25/11/2026, não escolhido por gosto.
     *
     * A migração para React deixou cada arquivo de teste mais pesado: jsdom mais árvore
     * React mais `flushSync` custa bem mais que a montagem imperativa que havia antes. Com
     * o padrão do vitest (um trabalhador por núcleo, 10 nesta máquina), oito arquivos
     * passavam a falhar de forma intermitente — todos passavam sozinhos, e o `vi.waitFor`
     * de 1s estourava só sob disputa de recursos. Falha assim é pior que falha
     * determinística: some quando se vai investigar e volta na CI.
     *
     * Medições das três configurações, suíte inteira de `web/`:
     *   padrão (10)      8 falhas intermitentes
     *   sequencial        880/880, 184s
     *   quatro            880/880 em duas rodadas seguidas, ~31s
     *
     * Quatro dá determinismo e ainda é seis vezes mais rápido que sequencial. Subir este
     * número de novo exige medir outra vez, não supor que a máquina aguenta. */
    maxWorkers: 4,
  },
});
