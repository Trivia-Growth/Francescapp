import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { verificarIsolamentoDoMock } from './verify-mockup-isolation.mjs';

async function comFixture(arquivos, executar) {
  const raiz = await mkdtemp(join(tmpdir(), 'ffcmapp-isolamento-'));
  try {
    for (const [caminho, conteudo] of Object.entries(arquivos)) {
      await mkdir(dirname(join(raiz, caminho)), { recursive: true });
      await writeFile(join(raiz, caminho), conteudo);
    }
    await executar(raiz);
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
}

test('reprova entrada ativa que depende da demonstração removida', async () => {
  await comFixture(
    { 'apps/web/index.html': '<script src="../../mockup/app.js"></script>' },
    async (raiz) => {
      assert.match(
        (await verificarIsolamentoDoMock({ raiz })).join('\n'),
        /Referência ativa.*apps\/web\/index.html/,
      );
    },
  );
});

test('permite uma menção documental ao arquivo histórico', async () => {
  await comFixture(
    { 'README.md': '[Ver demonstração](docs/legacy/mockup/README.md)' },
    async (raiz) => {
      assert.deepEqual(await verificarIsolamentoDoMock({ raiz }), []);
    },
  );
});

test('permite documentação ativa que explique o caminho anterior', async () => {
  await comFixture(
    { 'docs/projeto/registro.md': 'O material anterior estava em mockup/app.js.' },
    async (raiz) => {
      assert.deepEqual(await verificarIsolamentoDoMock({ raiz }), []);
    },
  );
});

test('ignora referências internas de arquivo histórico', async () => {
  await comFixture(
    { 'docs/legacy/registro.md': 'O antigo mockup/app.js foi preservado.' },
    async (raiz) => {
      assert.deepEqual(await verificarIsolamentoDoMock({ raiz }), []);
    },
  );
});
