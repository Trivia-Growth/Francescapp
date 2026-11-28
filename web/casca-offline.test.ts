// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import './public/casca-regras.js';
import './public/sw-reversao.js';
import {
  ENDERECO_WORKER,
  limparAparelho,
  NOME_POLITICA,
  PREFIXOS_PRESERVADOS,
  registrarCascaOffline,
} from './casca-offline.js';
import { EstadoDeRede } from './estado-rede.js';

type Pedido = { url: string; method?: string; mode?: string; destination?: string };
type Decisao = 'ignorar' | 'casca' | 'estatico';
type Regras = {
  VERSAO: string;
  decidir: (pedido: Pedido, origem: string) => Decisao;
  tratarFetch: (escopo: unknown, evento: unknown) => Decisao;
  instalar: (escopo: unknown) => Promise<void>;
  ativar: (escopo: unknown) => Promise<void>;
};
type Reversao = { reverter: (escopo: unknown) => Promise<void> };

const regras = (globalThis as unknown as { CascaRegras: Regras }).CascaRegras;
const reversao = (globalThis as unknown as { CascaReversao: Reversao }).CascaReversao;

const origem = 'https://app.example.test';
const sessionId = '20000000-0000-4000-8000-000000000001';
const usuarioA = '10000000-0000-4000-8000-00000000000a';
const usuarioB = '10000000-0000-4000-8000-00000000000b';
const nomeFicticio = 'Paciente Fictícia Alfa';
const pacienteId = '47000000-0000-4000-8000-000000000001';

/** Dublê de `CacheStorage` com um mapa por cache, para inspecionar o que ficou guardado. */
function criarArmazem() {
  const conteudo = new Map<string, Map<string, string>>();
  const abertos: string[] = [];
  const chaveDe = (pedido: string | Pedido) =>
    typeof pedido === 'string' ? pedido : new URL(pedido.url, origem).pathname;
  const armazem = {
    async open(nome: string) {
      abertos.push(nome);
      const cache = conteudo.get(nome) ?? new Map<string, string>();
      conteudo.set(nome, cache);
      return {
        async addAll(urls: string[]) {
          for (const url of urls) cache.set(chaveDe(url), 'recurso estático');
        },
        async put(pedido: string | Pedido, resposta: Response) {
          cache.set(chaveDe(pedido), await resposta.text());
        },
        async match(pedido: string | Pedido) {
          const guardado = cache.get(chaveDe(pedido));
          return guardado === undefined ? undefined : new Response(guardado);
        },
      };
    },
    async keys() {
      return [...conteudo.keys()];
    },
    async delete(nome: string) {
      return conteudo.delete(nome);
    },
  };
  /** Tudo que está guardado, endereço e corpo, do jeito que uma inspeção do aparelho veria. */
  const inspecionar = () =>
    [...conteudo.entries()].flatMap(([nome, cache]) =>
      [...cache.entries()].map(([chave, corpo]) => `${nome} ${chave} ${corpo}`),
    );
  return { armazem, conteudo, abertos, inspecionar };
}

function criarEscopo(respostas: Record<string, Response | (() => Response)> = {}) {
  const { armazem, conteudo, abertos, inspecionar } = criarArmazem();
  const buscados: string[] = [];
  const escopo = {
    location: { origin: origem },
    caches: armazem,
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
    registration: { unregister: vi.fn(async () => true) },
    fetch: vi.fn(async (pedido: Pedido) => {
      const caminho = new URL(pedido.url, origem).pathname;
      buscados.push(caminho);
      const resposta = respostas[caminho];
      if (resposta === undefined) throw new TypeError('sem rede');
      return typeof resposta === 'function' ? resposta() : resposta;
    }),
  };
  return { escopo, conteudo, abertos, buscados, inspecionar };
}

function pedido(caminho: string, extra: Partial<Pedido> = {}): Pedido {
  return { url: `${origem}${caminho}`, method: 'GET', ...extra };
}

function disparar(escopo: unknown, requisicao: Pedido) {
  const respondido: Promise<Response>[] = [];
  const evento = {
    request: requisicao,
    respondWith: (promessa: Promise<Response>) => respondido.push(promessa),
  };
  const decisao = regras.tratarFetch(escopo, evento);
  return { decisao, respondido };
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

// Tarefa 1.2 — controle central: rota de API não é interceptada nem respondida do cache.
it('não intercepta rota de API: sem respondWith, sem abrir cache e sem resposta de reserva', async () => {
  const { escopo, abertos, inspecionar } = criarEscopo({
    '/api/sessao': () => Response.json({ session_id: sessionId }),
  });

  for (const caminho of [
    '/api/sessao',
    '/api/pacientes',
    `/api/pacientes/${pacienteId}/diario`,
    '/api/avisos',
    '/api/auth/google',
  ]) {
    const { decisao, respondido } = disparar(escopo, pedido(caminho));
    expect(decisao).toBe('ignorar');
    expect(respondido).toHaveLength(0);
  }

  // Envio também passa direto, inclusive para um caminho estático.
  expect(disparar(escopo, pedido('/index.html', { method: 'POST' })).decisao).toBe('ignorar');
  // Rota de API nova nasce fora: a lista é fechada, não há exclusão a lembrar.
  expect(regras.decidir(pedido('/api/rota-que-ainda-nao-existe'), origem)).toBe('ignorar');

  expect(abertos).toEqual([]);
  expect(inspecionar()).toEqual([]);
});

// Tarefa 1.2 — a lista fechada aceita o que está nela e recusa o resto.
it('guarda só documento da casca, scripts, estilos, fontes e ícones da mesma origem', () => {
  expect(regras.decidir(pedido('/', { mode: 'navigate' }), origem)).toBe('casca');
  expect(regras.decidir(pedido('/index.html', { mode: 'navigate' }), origem)).toBe('casca');
  for (const caminho of [
    '/assets/main-9f2a1c.js',
    '/assets/styles-77ab10.css',
    '/assets/raleway-latin.woff2',
    '/icones/ffcm-192.png',
    '/manifest.webmanifest',
  ])
    expect(regras.decidir(pedido(caminho), origem)).toBe('estatico');
  for (const caminho of [
    '/convite-familiar/',
    '/relatorio.pdf',
    '/exportacao.zip',
    '/assets/main-9f2a1c.js?v=2',
  ])
    expect(regras.decidir(pedido(caminho), origem)).toBe('ignorar');
  expect(regras.decidir(pedido('/assets/x.js', { mode: 'navigate' }), origem)).toBe('ignorar');
  expect(regras.decidir({ url: 'https://outro.example.test/x.js', method: 'GET' }, origem)).toBe(
    'ignorar',
  );
});

// Tarefa 1.3 — "Casca disponível sem rede" e "Conteúdo de caso não é servido do aparelho".
it('serve a casca sem rede e não serve conteúdo de caso do aparelho', async () => {
  const comRede = criarEscopo({
    '/index.html': () => new Response('<html>casca do FFCMApp</html>'),
    '/assets/main-9f2a1c.js': () => new Response('código da casca'),
    '/api/pacientes': () => Response.json({ dados: { itens: [{ nome: nomeFicticio }] } }),
  });
  await regras.instalar(comRede.escopo);
  // Sessão com rede: documento, script e uma consulta de caso autenticada.
  await disparar(comRede.escopo, pedido('/index.html', { mode: 'navigate' })).respondido[0];
  await disparar(comRede.escopo, pedido('/assets/main-9f2a1c.js')).respondido[0];
  expect(disparar(comRede.escopo, pedido('/api/pacientes')).decisao).toBe('ignorar');

  // Mesmo aparelho, agora sem rede: nenhum `fetch` responde.
  const semRede = {
    ...comRede.escopo,
    fetch: vi.fn(async () => {
      throw new TypeError('sem rede');
    }),
  };
  const casca = await disparar(semRede, pedido('/index.html', { mode: 'navigate' })).respondido[0];
  expect(await casca.text()).toBe('<html>casca do FFCMApp</html>');

  const caso = disparar(semRede, pedido('/api/pacientes'));
  expect(caso.decisao).toBe('ignorar');
  expect(caso.respondido).toHaveLength(0);
  expect(comRede.inspecionar().join('\n')).not.toContain(nomeFicticio);
});

// Tarefa 1.3 — a casca diz que falta rede, sem conteúdo anterior e sem dado de exemplo.
it('mostra indisponibilidade por falta de rede e nada além disso', () => {
  const conectado = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  const painel = render(createElement(EstadoDeRede));
  const alvo = painel.container.querySelector<HTMLElement>('#estado-rede');
  if (!alvo) throw new Error('Aviso de rede ausente.');
  try {
    expect(alvo.hidden).toBe(true);
    expect(alvo.textContent).toBe('');

    conectado.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event('offline')));
    expect(alvo.hidden).toBe(false);
    expect(alvo.textContent).toContain('Sem conexão');
    expect(document.body.dataset.semRede).toBe('true');
    expect(alvo.textContent).not.toContain(nomeFicticio);

    conectado.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('online')));
    expect(alvo.hidden).toBe(true);
    expect(alvo.textContent).toBe('');
  } finally {
    painel.unmount();
    conectado.mockRestore();
  }
});

// Tarefa 1.4 — "Versão nova substitui a instalada".
it('ativa a versão nova de imediato, assume as páginas abertas e descarta a versão anterior', async () => {
  const { escopo, conteudo } = criarEscopo({
    '/': () => new Response('casca'),
    '/index.html': () => new Response('casca'),
    '/manifest.webmanifest': () => new Response('{}'),
    '/icones/ffcm-192.png': () => new Response('icone'),
    '/icones/ffcm-512.png': () => new Response('icone'),
  });
  conteudo.set('ffcm-casca-versao-antiga', new Map([['/index.html', 'casca velha']]));

  await regras.instalar(escopo);
  expect(escopo.skipWaiting).toHaveBeenCalledTimes(1);

  await regras.ativar(escopo);
  expect(escopo.clients.claim).toHaveBeenCalledTimes(1);
  expect([...conteudo.keys()]).toEqual([regras.VERSAO]);
});

// Tarefa 1.5 — "Falha ao instalar não bloqueia o uso".
it('não bloqueia o uso quando o aparelho não registra o service worker', async () => {
  expect(await registrarCascaOffline({} as Navigator)).toBe('sem-suporte');
  const recusa = {
    serviceWorker: {
      register: async () => {
        throw new Error('registro recusado');
      },
    },
  } as unknown as Navigator;
  expect(await registrarCascaOffline(recusa)).toBe('falhou');

  document.documentElement.innerHTML = '<body></body>';
  expect(document.body.textContent).toBe('');
});

// Tarefa 1.6 — reversão: a versão publicada no endereço do worker desregistra o anterior.
it('a versão de reversão apaga os caches e cancela o registro instalado', async () => {
  const { escopo, conteudo } = criarEscopo();
  conteudo.set(regras.VERSAO, new Map([['/index.html', 'casca']]));
  conteudo.set('ffcm-casca-versao-antiga', new Map([['/index.html', 'casca velha']]));
  const paginas = [{ url: `${origem}/`, navigate: vi.fn(async () => undefined) }];

  await reversao.reverter({ ...escopo, clients: { matchAll: async () => paginas } });

  expect([...conteudo.keys()]).toEqual([]);
  expect(escopo.registration.unregister).toHaveBeenCalledTimes(1);
  expect(paginas[0].navigate).toHaveBeenCalledWith(`${origem}/`);
});

// Tarefa 2.1 — "Encerramento de sessão limpa o aparelho".
it('encerramento de sessão apaga armazenamentos, caches e bancos do aplicativo', async () => {
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  localStorage.setItem('preferencia-lista', 'compacta');
  localStorage.setItem(`ffcm-agenda-operacao-incerta:${usuarioA}`, '1');
  localStorage.setItem('ffcm-agenda-operacao-incerta', '1');
  const { armazem, conteudo } = criarArmazem();
  conteudo.set(regras.VERSAO, new Map([['/index.html', 'casca']]));
  const apagados: string[] = [];
  const janela = {
    sessionStorage,
    localStorage,
    caches: armazem as unknown as CacheStorage,
    indexedDB: {
      databases: async () => [{ name: 'ffcm-rascunhos' }],
      deleteDatabase: (nome: string) => apagados.push(nome),
    } as unknown as IDBFactory,
  };

  const relatorio = await limparAparelho(janela);

  expect(sessionStorage.length).toBe(0);
  expect(localStorage.getItem('preferencia-lista')).toBeNull();
  expect(localStorage.getItem('ffcm-agenda-operacao-incerta')).toBeNull();
  expect(localStorage.getItem(`ffcm-agenda-operacao-incerta:${usuarioA}`)).toBe('1');
  expect(relatorio.preservadas).toEqual([`ffcm-agenda-operacao-incerta:${usuarioA}`]);
  expect([...conteudo.keys()]).toEqual([]);
  expect(apagados).toEqual(['ffcm-rascunhos']);
  expect(relatorio).toMatchObject({
    sessionStorage: true,
    localStorage: true,
    caches: true,
    indexedDB: true,
  });
});

// Tarefa 2.2 — inspeção do armazenamento depois de uma sessão com consulta de caso.
it('depois de uma sessão com consulta de caso, o armazenamento não guarda resposta autenticada', async () => {
  const corpoAutenticado = JSON.stringify({
    dados: { session_id: sessionId, itens: [{ id: pacienteId, nome: nomeFicticio }] },
  });
  const { escopo, inspecionar, abertos } = criarEscopo({
    '/': () => new Response('<html>casca do FFCMApp</html>'),
    '/index.html': () => new Response('<html>casca do FFCMApp</html>'),
    '/manifest.webmanifest': () => new Response('{}'),
    '/icones/ffcm-192.png': () => new Response('icone'),
    '/icones/ffcm-512.png': () => new Response('icone'),
    '/assets/main-9f2a1c.js': () => new Response('código da casca'),
    '/api/sessao': () =>
      new Response(corpoAutenticado, { headers: { 'content-type': 'application/json' } }),
    [`/api/pacientes/${pacienteId}`]: () =>
      new Response(corpoAutenticado, { headers: { 'content-type': 'application/json' } }),
  });

  await regras.instalar(escopo);
  await regras.ativar(escopo);
  await disparar(escopo, pedido('/index.html', { mode: 'navigate' })).respondido[0];
  await disparar(escopo, pedido('/assets/main-9f2a1c.js')).respondido[0];
  // O worker ignora; o navegador busca por conta própria. A resposta autenticada chega mesmo,
  // e é depois dela que o armazenamento é inspecionado.
  for (const caminho of ['/api/sessao', `/api/pacientes/${pacienteId}`]) {
    expect(disparar(escopo, pedido(caminho)).decisao).toBe('ignorar');
    const resposta = await escopo.fetch(pedido(caminho));
    expect(await resposta.text()).toContain(nomeFicticio);
  }
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('sessao-tecnica', sessionId);

  const guardado = [
    ...inspecionar(),
    ...Object.entries({ ...localStorage }).map(([c, v]) => `localStorage ${c} ${v}`),
  ].join('\n');

  // A inspeção é sobre o que está no armazenamento, não sobre o código do worker.
  expect(guardado).not.toContain(nomeFicticio);
  expect(guardado).not.toContain(pacienteId);
  expect(guardado).not.toContain(sessionId);
  expect(guardado).not.toContain('/api/');
  expect(abertos).not.toContain(undefined);
  expect(
    inspecionar()
      .map((linha) => linha.split(' ')[1])
      .sort(),
  ).toEqual(
    [
      '/',
      '/icones/ffcm-192.png',
      '/icones/ffcm-512.png',
      '/index.html',
      '/manifest.webmanifest',
      '/assets/main-9f2a1c.js',
    ].sort(),
  );

  // O identificador de sessão vive em `sessionStorage`, que o encerramento apaga.
  await limparAparelho({ sessionStorage, localStorage });
  expect(sessionStorage.length).toBe(0);
});

// Tarefa 2.3 — "Revogação não é contornada pelo aparelho", com e sem rede.
it('revogação não é contornada pelo aparelho, com ou sem rede', async () => {
  const { escopo, inspecionar } = criarEscopo({
    '/index.html': () => new Response('<html>casca do FFCMApp</html>'),
    [`/api/pacientes/${pacienteId}`]: () => Response.json({ dados: { nome: nomeFicticio } }),
  });
  await disparar(escopo, pedido('/index.html', { mode: 'navigate' })).respondido[0];
  disparar(escopo, pedido(`/api/pacientes/${pacienteId}`));

  // Acesso revogado: com rede, o pedido vai ao servidor, que recusa. O worker não se mete.
  const revogado = {
    ...escopo,
    fetch: vi.fn(async () => new Response('{"erro":"sem_permissao"}', { status: 403 })),
  };
  const comRede = disparar(revogado, pedido(`/api/pacientes/${pacienteId}`));
  expect(comRede.decisao).toBe('ignorar');
  expect(comRede.respondido).toHaveLength(0);

  // Sem rede, não há resposta de reserva: o pedido falha, nada é servido do aparelho.
  const semRede = {
    ...escopo,
    fetch: vi.fn(async () => {
      throw new TypeError('sem rede');
    }),
  };
  const offline = disparar(semRede, pedido(`/api/pacientes/${pacienteId}`));
  expect(offline.decisao).toBe('ignorar');
  expect(offline.respondido).toHaveLength(0);
  expect(semRede.fetch).not.toHaveBeenCalled();
  expect(inspecionar().join('\n')).not.toContain(nomeFicticio);
});

// Tarefa 2.4 — "Segunda pessoa no mesmo aparelho".
it('segunda pessoa no mesmo aparelho não encontra nada da sessão anterior', async () => {
  sessionStorage.setItem('modo-acesso', 'tecnica');
  sessionStorage.setItem('sessao-tecnica', sessionId);
  localStorage.setItem('ultimo-paciente', pacienteId);
  localStorage.setItem(`ffcm-agenda-operacao-incerta:${usuarioA}`, '1');
  const { armazem, conteudo } = criarArmazem();
  conteudo.set(regras.VERSAO, new Map([['/index.html', '<html>casca do FFCMApp</html>']]));

  await limparAparelho({
    sessionStorage,
    localStorage,
    caches: armazem as unknown as CacheStorage,
  });

  // O que a segunda pessoa consegue ler do aparelho.
  const visivelParaB = [
    ...Object.entries({ ...localStorage }).map(([c, v]) => `${c} ${v}`),
    ...Object.entries({ ...sessionStorage }).map(([c, v]) => `${c} ${v}`),
  ].join('\n');
  expect(visivelParaB).not.toContain(pacienteId);
  expect(visivelParaB).not.toContain(sessionId);
  expect(visivelParaB).not.toContain(usuarioB);
  expect(localStorage.getItem(`ffcm-agenda-operacao-incerta:${usuarioB}`)).toBeNull();
  expect(localStorage.getItem('ffcm-agenda-operacao-incerta')).toBeNull();
  expect([...conteudo.keys()]).toEqual([]);
  // O único resíduo é o marcador do usuário anterior, lido só por ele.
  expect(Object.keys({ ...localStorage })).toEqual([`ffcm-agenda-operacao-incerta:${usuarioA}`]);
  expect(PREFIXOS_PRESERVADOS.every((prefixo) => prefixo.endsWith(':'))).toBe(true);
});

it('mina o endereço do worker por política estreita e recusa qualquer outro', async () => {
  /* Medido em Chromium em 25/11/2026: com `trusted-types 'none'` o navegador recusava
     `register('/sw.js')` e o `catch` devolvia 'falhou' sem avisar ninguém — FR-071 estava
     morto em produção, em silêncio. A saída não foi afrouxar a diretiva: é UMA política
     nomeada que aceita um endereço só. O segundo `expect` é o que importa de verdade:
     se alguém alargar a regra para aceitar qualquer entrada, este teste reprova. */
  const minados: string[] = [];
  let regrasGuardadas: { createScriptURL(entrada: string): string } | undefined;
  const janela = {
    trustedTypes: {
      createPolicy(nome: string, regras: { createScriptURL(entrada: string): string }) {
        expect(nome).toBe(NOME_POLITICA);
        regrasGuardadas = regras;
        return {
          createScriptURL(entrada: string) {
            const saida = regras.createScriptURL(entrada);
            minados.push(saida);
            return saida;
          },
        };
      },
    },
  } as unknown as Window;

  const registros: string[] = [];
  const navegador = {
    serviceWorker: {
      register: (url: string) => {
        registros.push(url);
        return Promise.resolve({} as ServiceWorkerRegistration);
      },
    },
  } as unknown as Navigator;

  expect(await registrarCascaOffline(navegador, janela)).toBe('registrada');
  expect(registros).toEqual([ENDERECO_WORKER]);
  expect(minados).toEqual([ENDERECO_WORKER]);
  expect(() => regrasGuardadas?.createScriptURL('/outro.js')).toThrow();
});

it('continua registrando onde Trusted Types não existe', async () => {
  const registros: string[] = [];
  const navegador = {
    serviceWorker: {
      register: (url: string) => {
        registros.push(url);
        return Promise.resolve({} as ServiceWorkerRegistration);
      },
    },
  } as unknown as Navigator;
  expect(await registrarCascaOffline(navegador, {} as Window)).toBe('registrada');
  expect(registros).toEqual([ENDERECO_WORKER]);
});
