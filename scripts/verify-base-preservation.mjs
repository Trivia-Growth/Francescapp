import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirDefault = resolve(fileURLToPath(new URL('..', import.meta.url)));

const sha256 = (content) => createHash('sha256').update(content).digest('hex');

const arquivo = (nome, origem, arquivado, hash) => ({ nome, origem, arquivado, hash });

export const inventario = {
  arquivos: [
    arquivo(
      'mockup/DESIGN.md',
      'mockup/DESIGN.md',
      'docs/legacy/mockup/source/DESIGN.md',
      '1151352a645c2c2248b28768e2d0a70d7f2f44b6f3eaf59ea17d6c63d60d1753',
    ),
    arquivo(
      'mockup/QA.md',
      'mockup/QA.md',
      'docs/legacy/mockup/source/QA.md',
      '0200c213acc52a6535d1b4ca9ad5d4ace2c337fb34a2eca8a6e47a7557d2b3d7',
    ),
    arquivo(
      'mockup/README.md',
      'mockup/README.md',
      'docs/legacy/mockup/source/README.md',
      'fc6aee3de35526949a8226ee45afb7e0b13284ff4d427bbf35dc36720e99afbb',
    ),
    arquivo(
      'mockup/app.js',
      'mockup/app.js',
      'docs/legacy/mockup/source/app.js',
      'e5257b27735e64d0733dea76764e7eefc279454ef4cc5458c7995b941391602f',
    ),
    arquivo(
      'mockup/assets/OFL-Cormorant-Garamond.txt',
      'mockup/assets/OFL-Cormorant-Garamond.txt',
      'docs/legacy/mockup/source/assets/OFL-Cormorant-Garamond.txt',
      '60700d351cac4650c51f3f9db318d2a420f8b45052dba2715eb5fec41f0f6956',
    ),
    arquivo(
      'mockup/assets/OFL-Raleway.txt',
      'mockup/assets/OFL-Raleway.txt',
      'docs/legacy/mockup/source/assets/OFL-Raleway.txt',
      '7e946cf1171784d1015279e7dc35f827957a6b5d1f1f659ae0c98e5f5e37ed9b',
    ),
    arquivo(
      'mockup/assets/cormorant-garamond.ttf',
      'mockup/assets/cormorant-garamond.ttf',
      'docs/legacy/mockup/source/assets/cormorant-garamond.ttf',
      'b20b7d9626dd956b2c5e558692ad328b1f19e3275e2782db4fa07670d83f35e0',
    ),
    arquivo(
      'mockup/assets/raleway.ttf',
      'mockup/assets/raleway.ttf',
      'docs/legacy/mockup/source/assets/raleway.ttf',
      '8bbcc3eb8275c388f4bcd998832f8a4b943eadbaf6a595205312774b5951aefb',
    ),
    arquivo(
      'mockup/assets/trivia-logo-dark.png',
      'mockup/assets/trivia-logo-dark.png',
      'docs/legacy/mockup/source/assets/trivia-logo-dark.png',
      '4b0a243e90d84c7cf0b97c630db1f7ff2b772497ba036773bdf3d9e60f946962',
    ),
    arquivo(
      'mockup/build-portable.mjs',
      'mockup/build-portable.mjs',
      'docs/legacy/mockup/source/build-portable.mjs',
      '582c07fa3e2f56246f6e723d5b62c9c4563e93e7d80efecdcd991dfdf6c06905',
    ),
    arquivo(
      'mockup/index.html',
      'mockup/index.html',
      'docs/legacy/mockup/source/index.html',
      '927f11756c42866f7adaeea3c235eb30337688bda438bd71355d6d0a93b58c8b',
    ),
    arquivo(
      'mockup/styles.css',
      'mockup/styles.css',
      'docs/legacy/mockup/source/styles.css',
      'baa3da838b19b483e52a73aa7d417d7ad4b5798ec01796656606223f7b7c1f9f',
    ),
    arquivo(
      'output/mockup/francescapp-demo.html',
      'output/mockup/francescapp-demo.html',
      'docs/legacy/mockup/portable/francescapp-demo.html',
      '99523dc4296c3610ea20b757a9847d50d0330f44988958ef122d74c129ac5124',
    ),
    arquivo(
      'output/mockup/francescapp-mockup.zip',
      'output/mockup/francescapp-mockup.zip',
      'docs/legacy/mockup/portable/francescapp-mockup.zip',
      'e996a992a6644a9ed640cafdff317a5520898fb368135b72cec05d5de9a3d73e',
    ),
    arquivo(
      'output/mockup/visao-edilaine.jpg',
      'output/mockup/visao-edilaine.jpg',
      'docs/legacy/mockup/portable/visao-edilaine.jpg',
      '1fd8f99e6977e2b778c194dc2c94eca8ed0b8d1ae5b6a9d763172d57d4a89640',
    ),
    arquivo(
      'output/pdf/especificacoes-francescapp-joao.pdf',
      'output/pdf/especificacoes-francescapp-joao.pdf',
      'output/pdf/especificacoes-francescapp-joao.pdf',
      'cb90d9a27d1f861301bfbc95ac7e6887049ea1a27dec33592ad684d6c72d6bd2',
    ),
    arquivo(
      'output/pdf/francescapp-proposta-edilaine.pdf',
      'output/pdf/francescapp-proposta-edilaine.pdf',
      'output/pdf/francescapp-proposta-edilaine.pdf',
      '500d4c64d4d8380f5768962a344c49e7335f6d164d277ffbfefed60c84d857bb',
    ),
    arquivo(
      'output/pdf/francescapp-proposta-implementacao.pdf',
      'output/pdf/francescapp-proposta-implementacao.pdf',
      'output/pdf/francescapp-proposta-implementacao.pdf',
      '45a4ec841cc4130e99988bd5d8a552bd69711a3851bd944c0f62e9be9b5c62a1',
    ),
    arquivo(
      'assets/brand/francescato/ffcm-logo-branco.jpg',
      'assets/brand/francescato/ffcm-logo-branco.jpg',
      'assets/brand/francescato/ffcm-logo-branco.jpg',
      '01b65fc5cd8d940b8fd881980f827d4ad8e64f2e06d1faa63f90742aa0600968',
    ),
    arquivo(
      'assets/brand/francescato/ffcm-logo-oliva.jpg',
      'assets/brand/francescato/ffcm-logo-oliva.jpg',
      'assets/brand/francescato/ffcm-logo-oliva.jpg',
      '015c14439f37df619d1b9f3a4f2369d0ad6cb050eb7ee280865c7a3508b6ee64',
    ),
    arquivo(
      'assets/brand/francescato/francescato-assinatura.jpg',
      'assets/brand/francescato/francescato-assinatura.jpg',
      'assets/brand/francescato/francescato-assinatura.jpg',
      'c991ee38e505781b9b6764cfbeb48e9a3d88281dce341b2efdfe1d52cc54d0ca',
    ),
    arquivo(
      'assets/brand/francescato/paleta-referencia.jpg',
      'assets/brand/francescato/paleta-referencia.jpg',
      'assets/brand/francescato/paleta-referencia.jpg',
      '66f0292f3a0deaba40920d914d27af3daf7017636b8faae2bc39557d6a2859b7',
    ),
  ],
  proposta: {
    caminho: 'output/proposta-edilaine.html',
    hashOrigem: '15f14edd0a3f3149fc0c4c22ed319521f665646ff0e00df5ef5d6813ca4c8d92',
    fontesOrigem: ['../mockup/assets/raleway.ttf', '../mockup/assets/cormorant-garamond.ttf'],
    fontesArquivadas: ['../assets/fonts/raleway.ttf', '../assets/fonts/cormorant-garamond.ttf'],
  },
  fontesAtivasArquivadas: [
    arquivo(
      'assets/fonts/raleway.ttf',
      'mockup/assets/raleway.ttf',
      'assets/fonts/raleway.ttf',
      '8bbcc3eb8275c388f4bcd998832f8a4b943eadbaf6a595205312774b5951aefb',
    ),
    arquivo(
      'assets/fonts/cormorant-garamond.ttf',
      'mockup/assets/cormorant-garamond.ttf',
      'assets/fonts/cormorant-garamond.ttf',
      'b20b7d9626dd956b2c5e558692ad328b1f19e3275e2782db4fa07670d83f35e0',
    ),
    arquivo(
      'assets/fonts/OFL-Raleway.txt',
      'mockup/assets/OFL-Raleway.txt',
      'assets/fonts/OFL-Raleway.txt',
      '7e946cf1171784d1015279e7dc35f827957a6b5d1f1f659ae0c98e5f5e37ed9b',
    ),
    arquivo(
      'assets/fonts/OFL-Cormorant-Garamond.txt',
      'mockup/assets/OFL-Cormorant-Garamond.txt',
      'assets/fonts/OFL-Cormorant-Garamond.txt',
      '60700d351cac4650c51f3f9db318d2a420f8b45052dba2715eb5fec41f0f6956',
    ),
  ],
};

async function hashArquivo(caminho) {
  return sha256(await readFile(caminho));
}

function caminhoDo(item, layout) {
  return layout === 'arquivado' ? item.arquivado : item.origem;
}

export async function verificarPreservacao({
  raiz = rootDirDefault,
  layout = 'origem',
  dados = inventario,
} = {}) {
  if (!['origem', 'arquivado'].includes(layout)) {
    return [`Layout inválido: ${layout}. Use origem ou arquivado.`];
  }

  const falhas = [];
  const itens =
    layout === 'arquivado' ? [...dados.arquivos, ...dados.fontesAtivasArquivadas] : dados.arquivos;

  for (const item of itens) {
    const caminhoRelativo = caminhoDo(item, layout);
    try {
      const hash = await hashArquivo(resolve(raiz, caminhoRelativo));
      if (hash !== item.hash) {
        falhas.push(`Hash divergente: ${caminhoRelativo}`);
      }
    } catch {
      falhas.push(`Arquivo ausente ou ilegível: ${caminhoRelativo}`);
    }
  }

  const proposta = dados.proposta;
  try {
    const caminho = resolve(raiz, proposta.caminho);
    const texto = await readFile(caminho, 'utf8');
    if (layout === 'origem') {
      if (sha256(texto) !== proposta.hashOrigem) {
        falhas.push(`Proposta divergente: ${proposta.caminho}`);
      }
    } else {
      let restaurada = texto;
      for (let indice = 0; indice < proposta.fontesArquivadas.length; indice += 1) {
        const nova = proposta.fontesArquivadas[indice];
        const antiga = proposta.fontesOrigem[indice];
        if (!texto.includes(nova)) {
          falhas.push(`URL de fonte ativa ausente: ${nova}`);
        }
        restaurada = restaurada.replace(nova, antiga);
      }
      if (sha256(restaurada) !== proposta.hashOrigem) {
        falhas.push(
          `A proposta foi alterada além das duas URLs de fonte permitidas: ${proposta.caminho}`,
        );
      }
    }
  } catch {
    falhas.push(`Arquivo ausente ou ilegível: ${proposta.caminho}`);
  }

  return falhas;
}

function lerArgumentos(argumentos) {
  const opcoes = { raiz: rootDirDefault, layout: 'origem' };
  for (let indice = 0; indice < argumentos.length; indice += 1) {
    if (argumentos[indice] === '--raiz') {
      opcoes.raiz = resolve(argumentos[indice + 1] ?? '');
      indice += 1;
    }
    if (argumentos[indice] === '--layout') {
      opcoes.layout = argumentos[indice + 1] ?? '';
      indice += 1;
    }
  }
  return opcoes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const falhas = await verificarPreservacao(lerArgumentos(process.argv.slice(2)));
  if (falhas.length > 0) {
    console.error(`Preservação reprovada (${falhas.length}):\n- ${falhas.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('Preservação aprovada.');
  }
}
