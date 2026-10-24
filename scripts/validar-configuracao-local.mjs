import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from '@iarna/toml';
import assert from 'node:assert/strict';

const raiz = process.cwd();
const arquivos = ['supabase/config.toml', 'netlify.toml'];

for (const arquivo of arquivos) {
  const conteudo = await readFile(resolve(raiz, arquivo), 'utf8');
  const configuracao = parse(conteudo);
  if (arquivo === 'supabase/config.toml') {
    assert.equal(configuracao.auth.enable_signup, false);
    assert.equal(configuracao.api.enabled, true);
    assert.deepEqual(configuracao.api.schemas, ['api']);
    assert.deepEqual(configuracao.api.extra_search_path, []);
    assert.equal(configuracao.db.major_version, 15);
    assert.equal(configuracao.edge_runtime.enabled, true);
    assert.equal(configuracao.auth.site_url, 'http://localhost:5173');
  } else {
    assert.equal(configuracao.build.functions, 'netlify/functions');
    assert.equal(configuracao.build.environment.NODE_VERSION, '22');
    assert.equal(configuracao.build.environment.PNPM_VERSION, '9.15.9');
    const cabecalhosApi = configuracao.headers.find((item) => item.for === '/api/*');
    assert.equal(cabecalhosApi?.values['Cache-Control'], 'no-store');
  }
}

console.log('Configurações locais da fundação validadas sem acessar serviços remotos.');
