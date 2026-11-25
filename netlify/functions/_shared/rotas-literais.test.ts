import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import { caminhoConcessoesEquipe } from './entrada-concessoes-equipe-nativa.ts';

/** A plataforma lê `export const config` ESTATICAMENTE, no build, sem executar o módulo.
 * Um caminho vindo de constante importada não é resolvido: a função sobe publicada e **sem
 * rota**, e o endereço devolve a página 404 da plataforma — não um erro nosso, o que torna o
 * defeito difícil de reconhecer.
 *
 * Em 24/11/2026 era o caso de `concessoes-equipe`, que usava `path: caminhoConcessoesEquipe`.
 * A função constava entre as 51 publicadas e mesmo assim `/api/admin/concessoes-equipe`
 * respondia 404: a aba Equipe da Administração não funcionava em produção, e ninguém via
 * erro no log porque a requisição nunca chegava à função.
 *
 * Este teste varre todas as funções e exige literal. É a mesma família do defeito de
 * `ficha-plantao`, onde o caminho existia no handler e faltava no roteamento. */

const pasta = 'netlify/functions';

function configuracaoDe(arquivo: string): string | null {
  const texto = readFileSync(`${pasta}/${arquivo}`, 'utf8');
  const inicio = texto.indexOf('export const config');
  if (inicio < 0) return null;
  const fim = texto.indexOf('};', inicio);
  return texto.slice(inicio, fim < 0 ? undefined : fim + 2);
}

it('declara o caminho de toda função como literal, nunca por constante importada', () => {
  const arquivos = readdirSync(pasta).filter((n) => n.endsWith('.ts') && !n.includes('.test.'));
  expect(arquivos.length).toBeGreaterThan(40);
  const semLiteral = arquivos.filter((arquivo) => {
    const trecho = configuracaoDe(arquivo);
    if (trecho === null) return false;
    // Um caminho literal aparece entre aspas dentro do próprio bloco de configuração.
    return !/path\s*:\s*(\[[^\]]*)?['"]/.test(trecho);
  });
  expect(semLiteral, `funções com caminho não literal: ${semLiteral.join(', ')}`).toEqual([]);
});

it('mantém o literal do roteamento igual ao caminho que o handler atende', () => {
  // O handler compara `url.pathname` com esta constante; se o literal do roteamento divergir,
  // a função passa a ser publicada num endereço que ela mesma recusa.
  const trecho = configuracaoDe('concessoes-equipe.ts') ?? '';
  expect(trecho).toContain(`'${caminhoConcessoesEquipe}'`);
});
