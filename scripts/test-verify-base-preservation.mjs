import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { verificarPreservacao } from './verify-base-preservation.mjs';

const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const fixture = (caminho, conteudo) => ({
  nome: caminho,
  origem: caminho,
  arquivado: caminho,
  hash: sha256(conteudo),
  conteudo,
});

async function criarFixture() {
  const raiz = await mkdtemp(join(tmpdir(), 'ffcmapp-preservacao-'));
  const fonte = fixture('materiais/fonte.ttf', 'fonte de teste');
  const licenca = fixture('materiais/OFL.txt', 'licença de teste');
  const pdf = fixture('pdf/proposta.pdf', 'pdf de teste');
  const propostaTexto = "@font-face{src:url('../mockup/assets/fonte.ttf')}";
  const dados = {
    arquivos: [fonte, licenca, pdf],
    fontesAtivasArquivadas: [],
    proposta: {
      caminho: 'proposta.html',
      hashOrigem: sha256(propostaTexto),
      fontesOrigem: ['../mockup/assets/fonte.ttf'],
      fontesArquivadas: ['../assets/fonts/fonte.ttf'],
    },
  };

  for (const item of dados.arquivos) {
    await mkdir(dirname(join(raiz, item.origem)), { recursive: true });
    await writeFile(join(raiz, item.origem), item.conteudo);
  }
  await writeFile(join(raiz, dados.proposta.caminho), propostaTexto);
  return { raiz, dados, fonte, licenca, pdf };
}

async function comFixture(executar) {
  const dados = await criarFixture();
  try {
    await executar(dados);
  } finally {
    await rm(dados.raiz, { recursive: true, force: true });
  }
}

test('aceita materiais de preservação íntegros', async () => {
  await comFixture(async ({ raiz, dados }) => {
    assert.deepEqual(await verificarPreservacao({ raiz, dados }), []);
  });
});

test('reprova fonte ausente sem alterar os materiais reais', async () => {
  await comFixture(async ({ raiz, dados, fonte }) => {
    await unlink(join(raiz, fonte.origem));
    assert.match(
      (await verificarPreservacao({ raiz, dados })).join('\n'),
      /Arquivo ausente.*fonte/,
    );
  });
});

test('reprova licença alterada', async () => {
  await comFixture(async ({ raiz, dados, licenca }) => {
    await writeFile(join(raiz, licenca.origem), 'licença adulterada');
    assert.match((await verificarPreservacao({ raiz, dados })).join('\n'), /Hash divergente.*OFL/);
  });
});

test('reprova PDF ausente ou alterado', async () => {
  await comFixture(async ({ raiz, dados, pdf }) => {
    await unlink(join(raiz, pdf.origem));
    assert.match(
      (await verificarPreservacao({ raiz, dados })).join('\n'),
      /Arquivo ausente.*proposta.pdf/,
    );
    await writeFile(join(raiz, pdf.origem), 'pdf adulterado');
    assert.match(
      (await verificarPreservacao({ raiz, dados })).join('\n'),
      /Hash divergente.*proposta.pdf/,
    );
  });
});
