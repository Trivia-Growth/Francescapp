import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['minimal'],
    silent: 'passed-only',
  },
  resolve: {
    alias: {
      '@ffcmapp/contratos': fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url)),
    },
  },
});
