import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

/** FR-086 — integridade do catálogo de chaves de configuração.
 *
 * Este teste não confere caso a caso: ele detecta a CLASSE inteira de defeito que a
 * varredura de 20/11/2026 encontrou três vezes em um mês.
 *
 *  - chave lida pelo código e ausente do catálogo → não há o que ligar na tela, só deploy
 *    (`ffcm.papel_declarado.ativo`, `ffcm.substituicao_cm.ativo`, `ffcm.ficha_plantao.ativo`);
 *  - chave semeada que ninguém lê → interruptor que não liga nada
 *    (`ffcm.equipe.vinculos_ativa`, lida só por `process.env` até esta fatia);
 *  - chave cuja `exposicao` o seu leitor não alcança → a tela aceita alternar, grava, e o
 *    servidor continua com o valor de antes, sem erro nenhum
 *    (`ffcm.acessos.ativo`, `ffcm.financeiro.ativo`, `ffcm.avisos.ativos`, corrigidas em
 *    `20261127320000`).
 *
 * Os três casos são defeito, não "configuração desligada", e por isso o teste aponta a
 * chave nominalmente em vez de contar divergências. */

const RAIZ = new URL('../../../', import.meta.url).pathname;
const MIGRATIONS = join(RAIZ, 'supabase/migrations');

/** Chaves usadas por fixtures e provas, que não pertencem ao catálogo de produção. */
const FORA_DO_CATALOGO = new Set(['ffcm.exemplo.ativo', 'ffcm.sem.chave', 'ffcm.x']);
/** `ffcm.exportacao.v1` é o identificador do FORMATO do pacote exportado
 * (`web/pacote-exportacao.ts:220`), não uma chave de configuração. */
const NAO_E_CHAVE = new Set(['ffcm.exportacao.v1', 'ffcm.turno.consentimento']);

type Exposicao = 'administracao' | 'servidor' | 'publica';

function arquivos(diretorio: string, extensao: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
    const caminho = join(diretorio, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivos(caminho, extensao));
    else if (entrada.name.endsWith(extensao)) achados.push(caminho);
  }
  return achados;
}

/** Catálogo semeado: chave → exposição vigente ao fim da cadeia de migrations.
 *
 * O `insert` é lido linha a linha porque a exposição é a última coluna de cada tupla; os
 * `update ... set exposicao` posteriores sobrescrevem, como `20261127320000` faz. */
function catalogoSemeado(): Map<string, Exposicao> {
  const catalogo = new Map<string, Exposicao>();
  for (const caminho of arquivos(MIGRATIONS, '.sql').sort()) {
    const sql = readFileSync(caminho, 'utf8');
    for (const bloco of sql.split(/insert\s+into\s+identidade\.configuracao_sistema/i).slice(1)) {
      const instrucao = bloco.split(/;\s*$/m)[0] ?? '';
      const pedacos = instrucao.split(/'(ffcm\.[a-z0-9._-]+)'/);
      for (let i = 1; i < pedacos.length; i += 2) {
        const chave = pedacos[i] ?? '';
        const resto = pedacos[i + 1] ?? '';
        const exposicao = /'(administracao|servidor|publica)'/.exec(resto)?.[1];
        if (exposicao && !catalogo.has(chave)) catalogo.set(chave, exposicao as Exposicao);
      }
    }
    for (const bloco of sql.split(/update\s+identidade\.configuracao_sistema/i).slice(1)) {
      const instrucao = bloco.split(/;\s*$/m)[0] ?? '';
      const exposicao = /set\s+exposicao\s*=\s*'(administracao|servidor|publica)'/i.exec(
        instrucao,
      )?.[1];
      if (!exposicao) continue;
      for (const achado of instrucao.matchAll(/'(ffcm\.[a-z0-9._-]+)'/g))
        if (catalogo.has(achado[1] ?? '')) catalogo.set(achado[1] ?? '', exposicao as Exposicao);
    }
  }
  return catalogo;
}

/** Chaves lidas pelo processo do servidor, por qualquer um dos quatro leitores de
 * `configuracao-servidor.ts`. Todas precisam de `exposicao = 'servidor'`: é o único filtro
 * que `identidade.ler_configuracao_sistema_publica()` deixa passar
 * (`20261117420000:19,25`). */
function chavesLidasPeloServidor(): Map<string, string> {
  // `carregarConfiguracaoServidor` entra porque nem todo leitor passa pelos quatro
  // ajudantes: `compor-documento-caso-nativo.ts:120` lê o mapa direto.
  const leitores =
    /(?:servicoAtivo|textoConfigurado|numeroConfigurado|listaConfigurada|carregarConfiguracaoServidor)\s*\(/;
  const lidas = new Map<string, string>();
  for (const raiz of ['netlify/functions', 'supabase/functions', 'web', 'packages']) {
    for (const caminho of arquivos(join(RAIZ, raiz), '.ts')) {
      if (caminho.endsWith('.test.ts')) continue;
      const fonte = readFileSync(caminho, 'utf8');
      if (!leitores.test(fonte)) continue;
      for (const achado of fonte.matchAll(/'(ffcm\.[a-z0-9._-]+)'/g)) {
        const chave = achado[1] ?? '';
        if (FORA_DO_CATALOGO.has(chave) || NAO_E_CHAVE.has(chave)) continue;
        if (!lidas.has(chave)) lidas.set(chave, caminho.slice(RAIZ.length));
      }
    }
  }
  return lidas;
}

/** Chaves lidas por SQL (dentro das próprias migrations), fora de um `insert` de semente.
 * `ffcm.turno.duracao_padrao_minutos` é assim: quem a lê é a abertura de turno, não o
 * processo do servidor, e por isso ela legitimamente não é `exposicao = 'servidor'`. */
function chavesLidasPeloBanco(): Set<string> {
  const lidas = new Set<string>();
  for (const caminho of arquivos(MIGRATIONS, '.sql')) {
    const sql = readFileSync(caminho, 'utf8');
    const semSementes = sql
      .split(/insert\s+into\s+identidade\.configuracao_sistema/i)
      .map((bloco, indice) => (indice === 0 ? bloco : bloco.split(/;\s*$/m).slice(1).join(';')))
      .join('\n');
    for (const achado of semSementes.matchAll(/'(ffcm\.[a-z0-9._-]+)'/g))
      lidas.add(achado[1] ?? '');
  }
  return lidas;
}

it('não deixa chave de configuração sem leitor, leitor sem chave, nem exposição que o leitor não alcança', () => {
  const catalogo = catalogoSemeado();
  const peloServidor = chavesLidasPeloServidor();
  const peloBanco = chavesLidasPeloBanco();

  // 1. Leitor sem chave: a fatia só pode ser ligada por deploy.
  const semSemente = [...peloServidor]
    .filter(([chave]) => !catalogo.has(chave))
    .map(([chave, onde]) => `${chave} (lida em ${onde}, ausente do catálogo)`);
  expect(semSemente).toEqual([]);

  // 2. Exposição que o leitor do servidor não alcança: a tela aceita alternar e nada muda.
  const exposicaoInalcancavel = [...peloServidor]
    .filter(([chave]) => catalogo.get(chave) !== 'servidor')
    .map(([chave, onde]) => `${chave} (lida em ${onde}, exposicao=${catalogo.get(chave)})`);
  expect(exposicaoInalcancavel).toEqual([]);

  // 3. Chave sem leitor nenhum: interruptor que não liga nada.
  //
  // `exposicao = 'publica'` é lida em bloco por `api.consultar_regras_atendimento`
  // (`20261119320000:122` seleciona TODAS as chaves públicas, sem nomear nenhuma), então
  // essas chaves têm leitor mesmo sem aparecer como literal em lugar nenhum.
  const semLeitor = [...catalogo.entries()]
    .filter(([chave, exposicao]) => {
      if (exposicao === 'publica') return false;
      return !peloServidor.has(chave) && !peloBanco.has(chave);
    })
    .map(([chave, exposicao]) => `${chave} (exposicao=${exposicao}, sem leitor)`);
  expect(semLeitor).toEqual([]);

  // Guarda do próprio teste: se a varredura parar de enxergar o catálogo, ela deixaria de
  // detectar qualquer coisa e passaria por engano.
  expect(catalogo.size).toBeGreaterThan(40);
  expect(peloServidor.size).toBeGreaterThan(30);
});
