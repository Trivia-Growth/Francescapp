import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['minimal'],
    silent: 'passed-only',
  },
});
