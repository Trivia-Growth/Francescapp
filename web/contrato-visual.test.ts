import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

/* Contrato visual — VIS-017 de `openspec/changes/migrar-interface-para-react`.
 *
 * Por que existe: em 25/11/2026 `web/styles.css` tinha 25 cores literais e só 12
 * declaradas no `:root`. As outras 13 estavam soltas no meio das regras, e o mesmo papel
 * — aviso, por exemplo — era reescrito por extenso em cada lugar que precisava dele. O
 * resultado é inevitável: dois vermelhos para "erro", nenhum verde para "sucesso", e a
 * próxima tela repetindo a divergência.
 *
 * Um documento não impede isso de voltar. Um teste impede. */

const folha = readFileSync('web/styles.css', 'utf8');

/** `:root` até o primeiro fechamento — onde todo token precisa nascer. */
const raiz = folha.slice(folha.indexOf(':root'), folha.indexOf('\n}', folha.indexOf(':root')));

function token(nome: string): string {
  const achado = new RegExp(`--${nome}:\\s*([^;]+);`).exec(raiz);
  if (achado?.[1] === undefined) throw new Error(`Token --${nome} não existe no :root`);
  const valor = achado[1].trim();
  // Um token pode apontar para outro: `--superficie: var(--white)`. Resolve a cadeia.
  const alias = /^var\(--([\w-]+)\)$/.exec(valor);
  return alias?.[1] === undefined ? valor : token(alias[1]);
}

function luminancia(hex: string): number {
  const limpo = hex.replace('#', '');
  const cheio = limpo.length === 3 ? [...limpo].map((c) => c + c).join('') : limpo;
  const canais = [0, 2, 4]
    .map((i) => Number.parseInt(cheio.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (canais[0] ?? 0) + 0.7152 * (canais[1] ?? 0) + 0.0722 * (canais[2] ?? 0);
}

function contraste(a: string, b: string): number {
  const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((maior ?? 0) + 0.05) / ((menor ?? 0) + 0.05);
}

/* Todo par texto/fundo que o produto realmente apresenta. Acrescentar um papel de texto
   novo sem acrescentar seu par aqui é o único jeito de ele escapar da conferência — por
   isso a lista é explícita, e não derivada por heurística. */
const paresDeLeitura: ReadonlyArray<readonly [string, string]> = [
  ['ink', 'wash'],
  ['ink', 'white'],
  ['ink', 'panel'],
  ['ink', 'soft'],
  ['ink', 'superficie-trabalho'],
  ['muted', 'wash'],
  ['muted', 'white'],
  ['muted', 'panel'],
  ['muted', 'soft'],
  ['primary', 'white'],
  ['primary', 'wash'],
  ['primary', 'panel'],
  ['primary', 'primary-suave'],
  ['primary-texto-suave', 'white'],
  ['primary-texto-suave', 'wash'],
  ['error', 'white'],
  ['error', 'error-superficie'],
  ['aviso-texto', 'aviso-superficie'],
  ['aviso-texto-2', 'aviso-superficie'],
  ['areia-texto', 'areia-superficie'],
  ['white', 'primary'],
  ['white', 'error'],
  ['white', 'alerta'],
];

it('mantém todo texto legível sobre o fundo em que é apresentado', () => {
  for (const [frente, fundo] of paresDeLeitura) {
    const medido = contraste(token(frente), token(fundo));
    expect(
      `--${frente} sobre --${fundo}: ${medido.toFixed(2)}:1`,
      `--${frente} sobre --${fundo} mede ${medido.toFixed(2)}:1 e o mínimo para texto é 4,5:1`,
    ).toBe(`--${frente} sobre --${fundo}: ${Math.max(medido, 4.5).toFixed(2)}:1`);
  }
});

it('impede o oliva institucional de virar cor de texto', () => {
  /* `--brand-olive` mede 3,35:1 sobre branco. Serve como área, filete e marcação; nunca
     como texto. Quem precisa do tom da marca em palavra usa `--primary`, que mede 8,11:1.
     A regra não vale para o logotipo, que é isento de contraste mínimo. */
  const sobreBranco = contraste(token('brand-olive'), token('white'));
  expect(sobreBranco).toBeLessThan(4.5);

  const corpo = folha.slice(folha.indexOf('\n}', folha.indexOf(':root')));
  const comoTexto = /(^|\s)color:\s*var\(--brand-olive\)/m.exec(corpo);
  expect(
    comoTexto?.[0] ?? null,
    'O oliva institucional mede 3,35:1 sobre branco e não pode ser cor de texto. Use --primary.',
  ).toBeNull();
});

it('mantém toda cor nascendo no :root, e não solta no meio das regras', () => {
  /* O defeito original. Enquanto um literal puder aparecer dentro de uma regra, o mesmo
     papel volta a ser reescrito por extenso em cada tela, e as cópias divergem. */
  const corpo = folha.slice(folha.indexOf('\n}', folha.indexOf(':root')));
  expect(corpo.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
});

it('declara os papéis semânticos que a camada de componente consome', () => {
  for (const nome of [
    'superficie',
    'superficie-2',
    'superficie-3',
    'borda',
    'borda-forte',
    'sobreposicao',
    'aviso',
    'aviso-superficie',
    'error-superficie',
    'controle-sm',
    'controle-md',
    'largura-sidebar',
    'largura-trilho',
    'icone-base',
    'icone-chrome',
    'sombra-controle',
    'sombra-menu',
    'sombra-modal',
  ]) {
    expect(token(nome), `Token --${nome} precisa existir no :root`).toBeTruthy();
  }
});

it('preserva alvo de toque, foco visível e redução de movimento', () => {
  // 46px é o alvo de toque confortável; abaixo disso o dedo erra em celular.
  expect(Number.parseInt(token('controle-md'), 10)).toBeGreaterThanOrEqual(44);
  expect(folha).toContain(':focus-visible');
  expect(folha).toContain('@media (prefers-reduced-motion: reduce)');
});

it('preserva a escala declarada, sem degrau extra entrando por fora', () => {
  for (const degrau of [1, 2, 3, 4, 5, 6]) expect(token(`texto-${degrau}`)).toBeTruthy();
  for (const degrau of [1, 2, 3, 4, 5, 6, 7, 8]) expect(token(`espaco-${degrau}`)).toBeTruthy();
  for (const papel of ['estado', 'troca', 'contexto']) expect(token(`mov-${papel}`)).toBeTruthy();
});

it('mantém o CSS legado dentro de uma camada, para a utilitária poder vencer', () => {
  /* Medido em Chromium em 25/11/2026: regra SEM camada vence regra EM camada, qualquer
     que seja a ordem de declaração. Enquanto `index.html` ligava `styles.css` direto, as
     3.400 linhas de regra global dali — `button`, `input`, `ul`, `h2` — venciam toda
     utilitária das telas migradas, em silêncio. Nada quebrava de forma visível: a tela só
     ficava diferente do que o componente pedia.

     A porta de entrada passou a ser `estilos/tema.css`, que traz `styles.css` e `ui.css`
     para a camada `legado`, declarada antes de `utilities`. Se alguém religar `styles.css`
     direto no HTML, ou devolver o `@import` de `ui.css` para dentro dela, o defeito volta
     calado — por isso as três afirmações abaixo. */
  const tema = readFileSync('web/estilos/tema.css', 'utf8');
  const html = readFileSync('web/index.html', 'utf8');

  expect(tema).toContain('@layer legado, components, utilities;');
  expect(tema).toContain('@import "../styles.css" layer(legado);');
  expect(tema).toContain('@import "../ui/ui.css" layer(legado);');

  expect(html).toContain('href="./estilos/tema.css"');
  expect(html).not.toContain('href="./styles.css"');

  // `ui.css` importada de dentro de `styles.css` deixava uma cópia solta no topo da folha
  // final, fora de camada — onde voltava a vencer as utilitárias.
  expect(folha).not.toMatch(/@import\s+url\(["']\.\/ui\/ui\.css["']\)/);
});

it('impede token autorreferente na ponte do tema', () => {
  /* O defeito de 25/11/2026 que apagou a serifa do produto inteiro:
     `--font-display: var(--font-display)` dentro de `@theme inline`. O Tailwind reemite
     esse nome na mesma camada e depois da declaração real, o valor vira circular, logo
     inválido, e quem o consome cai no herdado. Em silêncio: CSS inválido não reclama, e o
     estrago alcançou telas que ninguém tocou.
     A ponte existe para TRADUZIR um nome em outro. Um nome que aponta para si mesmo não
     traduz nada — só sobrescreve a origem com lixo. */
  const tema = readFileSync('web/estilos/tema.css', 'utf8');
  // Sem tirar os comentários, o exemplo do defeito escrito em `tema.css` seria lido
  // como declaração e o teste reprovaria a própria explicação.
  const semComentarios = tema.replace(/\/\*[\s\S]*?\*\//g, '');
  const bloco = semComentarios.slice(semComentarios.indexOf('@theme inline'));
  const autorreferentes = [...bloco.matchAll(/(--[\w-]+):\s*var\(\s*(--[\w-]+)\s*\)/g)]
    .filter((achado) => achado[1] === achado[2])
    .map((achado) => achado[1]);
  expect(autorreferentes).toEqual([]);
});

it('mantém a CSP exigindo Trusted Types, com uma política nomeada e estreita', () => {
  /* `trusted-types 'none'` matava o registro do service worker em silêncio (FR-071),
     medido em Chromium em 25/11/2026. A saída foi uma política nomeada que mina um
     endereço só — não afrouxar a diretiva. As duas afirmações andam juntas: se alguém
     remover `require-trusted-types-for`, a proteção some; se trocar o nome por `*` ou
     acrescentar `'allow-duplicates'`, qualquer script da origem passa a poder forjar
     endereço confiável. */
  const html = readFileSync('web/index.html', 'utf8');
  expect(html).toContain("require-trusted-types-for 'script'");
  expect(html).toContain('trusted-types ffcm-casca');
  expect(html).not.toContain('allow-duplicates');
  expect(html).not.toMatch(/trusted-types\s+\*/);
});

it('não deixa import apontar para extensão de arquivo que foi renomeado', () => {
  /* Armadilha que mordeu quatro frentes diferentes em 25/11/2026, sempre do mesmo jeito:
     um módulo migra de `.ts` para `.tsx` e quem o importava com a extensão LITERAL
     (`from './x.ts'`) passa a apontar para arquivo inexistente.

     Por que passou despercebido tantas vezes: a maioria dessas importações é `import
     type`, apagada em execução, então o `tsc` resolve `.ts` para `.tsx` e o typecheck
     fica verde. Só quebra no Vite, e só em quem importa de verdade — foi assim que
     `modelo-sintese.test.ts` caiu sem que nada antes acusasse.

     A forma de não depender de ninguém lembrar é esta: escrever `.js` no especificador,
     que resolve `.ts` e `.tsx` igualmente. */
  /* A varredura cobre `web/` E quem importa de `web/` de fora. Medido em 26/11/2026:
     limitada a `web/`, ela deixou passar
     `scripts/prova-celular/ficha-plantao.ts` apontando para
     `../../web/consolidado-ficha-plantao.ts` depois de o módulo virar `.tsx`, e as quatro
     provas de celular da ficha de plantão quebraram só quando `verificar:ativacao` rodou.
     Varrer só a pasta onde o arquivo mudou não encontra quem o consome de outra pasta. */
  const web = resolve(import.meta.dirname);
  const projeto = resolve(web, '..');
  const pastas = [web, resolve(projeto, 'scripts'), resolve(projeto, 'netlify')];
  const quebrados: string[] = [];

  const varrer = (pasta: string): void => {
    for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
      if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue;
      const caminho = resolve(pasta, entrada.name);
      if (entrada.isDirectory()) {
        varrer(caminho);
        continue;
      }
      if (!/\.(tsx?|mjs)$/.test(entrada.name)) continue;
      const texto = readFileSync(caminho, 'utf8');
      for (const achado of texto.matchAll(/from '([^']+)\.ts'/g)) {
        const alvo = resolve(pasta, `${achado[1] ?? ''}`);
        if (!existsSync(`${alvo}.ts`) && existsSync(`${alvo}.tsx`)) {
          quebrados.push(
            `${caminho.slice(projeto.length + 1)} → ${achado[1] ?? ''}.ts (hoje é .tsx)`,
          );
        }
      }
    }
  };
  for (const pasta of pastas) if (existsSync(pasta)) varrer(pasta);
  expect(quebrados).toEqual([]);
});
