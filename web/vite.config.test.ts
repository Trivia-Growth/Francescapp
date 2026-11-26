import { expect, it } from 'vitest';
import configuracao from './vite.config.js';

/* O relaxamento de CSP do servidor de desenvolvimento não pode escapar para produção.
   É o tipo de atalho que fica e ninguém revisa de novo. */
it('relaxa a CSP somente no servidor de desenvolvimento', async () => {
  const plugins = (await configuracao).plugins?.flat() ?? [];
  const desenvolvimento = plugins.find(
    (plugin): plugin is { name: string; apply?: string } =>
      typeof plugin === 'object' &&
      plugin !== null &&
      'name' in plugin &&
      (plugin as { name: string }).name === 'ffcm-csp-desenvolvimento',
  );
  expect(desenvolvimento).toBeDefined();
  expect(desenvolvimento?.apply).toBe('serve');
});

it('mantém a CSP do arquivo em disco sem `unsafe-inline`', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync('web/index.html', 'utf8');
  expect(html).toContain("style-src 'self'");
  expect(html).not.toContain('unsafe-inline');
});
