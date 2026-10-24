import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirDefault = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ignoredDirectories = new Set(['.git', 'node_modules']);
const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.toml',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

function ehEscopoDocumentalOuDoVerificador(caminhoRelativo) {
  return (
    caminhoRelativo.startsWith('brag-output/') ||
    caminhoRelativo.startsWith('docs/') ||
    caminhoRelativo.startsWith('openspec/') ||
    caminhoRelativo.startsWith('scripts/verify-') ||
    caminhoRelativo.startsWith('scripts/test-verify-')
  );
}

async function arquivosDeTexto(raiz, atual = raiz) {
  const entradas = await readdir(atual, { withFileTypes: true });
  const arquivos = [];
  for (const entrada of entradas) {
    const caminho = join(atual, entrada.name);
    const relativo = relative(raiz, caminho);
    if (entrada.isDirectory()) {
      if (
        !ignoredDirectories.has(entrada.name) &&
        relativo !== 'docs/legacy' &&
        !relativo.startsWith('docs/legacy/')
      ) {
        arquivos.push(...(await arquivosDeTexto(raiz, caminho)));
      }
      continue;
    }
    if (entrada.isFile() && textExtensions.has(extname(entrada.name))) {
      if (!ehEscopoDocumentalOuDoVerificador(relativo)) {
        arquivos.push(caminho);
      }
    }
  }
  return arquivos;
}

function referenciasAtivasAoMock(texto) {
  const semDestinoHistorico = texto.replaceAll('docs/legacy/mockup/', '');
  return (
    Number(semDestinoHistorico.includes('mockup/')) +
    Number(semDestinoHistorico.includes('output/mockup/'))
  );
}

/**
 * Verificação estática delimitada: procura referências aos diretórios ativos
 * removidos (`mockup/` e `output/mockup/`) fora do arquivo histórico. Ela não
 * executa a aplicação e não é uma prova de segurança, autorização ou publicação.
 */
export async function verificarIsolamentoDoMock({ raiz = rootDirDefault } = {}) {
  const falhas = [];
  for (const caminho of await arquivosDeTexto(raiz)) {
    const texto = await readFile(caminho, 'utf8');
    if (referenciasAtivasAoMock(texto) > 0) {
      falhas.push(`Referência ativa à demonstração: ${relative(raiz, caminho)}`);
    }
  }
  return falhas;
}

function lerArgumentos(argumentos) {
  const indice = argumentos.indexOf('--raiz');
  return { raiz: indice === -1 ? rootDirDefault : resolve(argumentos[indice + 1] ?? '') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const falhas = await verificarIsolamentoDoMock(lerArgumentos(process.argv.slice(2)));
  if (falhas.length > 0) {
    console.error(`Isolamento reprovado (${falhas.length}):\n- ${falhas.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('Isolamento da demonstração aprovado.');
  }
}
