/**
 * Regras da casca offline (FR-071, design D1/D2/D4).
 *
 * Arquivo carregado de dois jeitos: pelo `importScripts` de `sw.js`, dentro do service worker,
 * e por `import` nos testes, onde `self` é a janela do jsdom. Por isso nada aqui toca em
 * `ServiceWorkerGlobalScope`: o escopo entra como argumento em todas as funções, e o worker é
 * só uma casca fina que amarra os eventos.
 *
 * A lista do que pode ser guardado é fechada (D1): documento da casca, scripts, estilos, fontes
 * e ícones da mesma origem. Qualquer outra coisa — e explicitamente tudo sob `/api/` — não é
 * interceptada: o worker não chama `respondWith`, e o pedido segue para a rede como se o worker
 * não existisse. Rota nova nasce fora do cache.
 */
((escopo) => {
  /** Trocar esta versão descarta os caches anteriores na ativação (D4). */
  const VERSAO = 'ffcm-casca-v1';

  /** Documentos que a casca pode servir. Nenhum outro documento é interceptado. */
  const DOCUMENTOS_DA_CASCA = ['/', '/index.html'];

  /** Prefixo das rotas de API. Nunca interceptado, nunca guardado, sem resposta de reserva. */
  const PREFIXO_API = '/api/';

  /** Extensões estáticas permitidas. Lista fechada: o que não está aqui não é guardado. */
  const EXTENSOES_ESTATICAS = [
    '.js',
    '.mjs',
    '.css',
    '.woff2',
    '.ttf',
    '.png',
    '.jpg',
    '.jpeg',
    '.svg',
    '.ico',
    '.webmanifest',
  ];

  /**
   * Recursos buscados já na instalação. Só nomes estáveis: os scripts e estilos construídos
   * recebem nome com resumo, desconhecido aqui, e entram no cache na primeira visita com rede.
   */
  const RECURSOS_INICIAIS = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/icones/ffcm-192.png',
    '/icones/ffcm-512.png',
  ];

  /**
   * Decide o que fazer com um pedido.
   *
   * @param {{ method?: string, url: string, mode?: string, destination?: string }} pedido
   * @param {string} origem origem da aplicação (`self.location.origin`)
   * @returns {'ignorar' | 'casca' | 'estatico'} `ignorar` significa não chamar `respondWith`.
   */
  function decidir(pedido, origem) {
    if ((pedido.method || 'GET').toUpperCase() !== 'GET') return 'ignorar';
    let endereco;
    try {
      endereco = new URL(pedido.url, origem);
    } catch {
      return 'ignorar';
    }
    if (endereco.origin !== origem) return 'ignorar';
    if (endereco.pathname.startsWith(PREFIXO_API)) return 'ignorar';
    // Variação por consulta não é recurso estático: some do cache por não ser identificável.
    if (endereco.search !== '') return 'ignorar';
    if (pedido.mode === 'navigate' || pedido.destination === 'document')
      return DOCUMENTOS_DA_CASCA.includes(endereco.pathname) ? 'casca' : 'ignorar';
    const caminho = endereco.pathname.toLowerCase();
    return EXTENSOES_ESTATICAS.some((extensao) => caminho.endsWith(extensao))
      ? 'estatico'
      : 'ignorar';
  }

  /** Uma resposta só é guardada se for da própria origem, completa e bem-sucedida. */
  function podeGuardar(resposta) {
    return Boolean(resposta?.ok && resposta.status === 200 && resposta.type !== 'opaque');
  }

  /**
   * Instalação: busca a lista fixa e pede passagem imediata para a versão nova (D4).
   * @param {{ caches: CacheStorage, skipWaiting: () => unknown }} escopoWorker
   */
  async function instalar(escopoWorker) {
    const cache = await escopoWorker.caches.open(VERSAO);
    await cache.addAll(RECURSOS_INICIAIS.slice());
    await escopoWorker.skipWaiting();
  }

  /**
   * Ativação: descarta caches de versões anteriores e assume as páginas já abertas (D4).
   * @param {{ caches: CacheStorage, clients: { claim: () => unknown } }} escopoWorker
   */
  async function ativar(escopoWorker) {
    const nomes = await escopoWorker.caches.keys();
    for (const nome of nomes) if (nome !== VERSAO) await escopoWorker.caches.delete(nome);
    await escopoWorker.clients.claim();
  }

  /**
   * Resposta para um pedido já classificado como `casca` ou `estatico`.
   * @param {{ caches: CacheStorage, fetch: typeof fetch }} escopoWorker
   */
  async function responder(escopoWorker, pedido, decisao) {
    const cache = await escopoWorker.caches.open(VERSAO);
    if (decisao === 'casca') {
      // Documento sempre pela rede primeiro: é assim que a versão nova chega ao aparelho.
      try {
        const daRede = await escopoWorker.fetch(pedido);
        if (podeGuardar(daRede)) await cache.put('/index.html', daRede.clone());
        return daRede;
      } catch (erro) {
        const guardado = await cache.match('/index.html');
        if (guardado) return guardado;
        throw erro;
      }
    }
    const guardado = await cache.match(pedido);
    if (guardado) return guardado;
    const daRede = await escopoWorker.fetch(pedido);
    if (podeGuardar(daRede)) await cache.put(pedido, daRede.clone());
    return daRede;
  }

  /**
   * Trata um `fetch` do worker. Devolve a decisão para que ela seja observável em teste.
   *
   * Quando a decisão é `ignorar` — todo `/api/`, todo pedido de outra origem, tudo que não é
   * recurso estático da lista — nada acontece: `respondWith` não é chamado, o cache não é aberto
   * e o pedido segue para a rede como se o worker não existisse.
   */
  function tratarFetch(escopoWorker, evento) {
    const decisao = decidir(evento.request, escopoWorker.location.origin);
    if (decisao === 'ignorar') return 'ignorar';
    evento.respondWith(responder(escopoWorker, evento.request, decisao));
    return decisao;
  }

  escopo.CascaRegras = {
    VERSAO,
    RECURSOS_INICIAIS,
    EXTENSOES_ESTATICAS,
    DOCUMENTOS_DA_CASCA,
    PREFIXO_API,
    decidir,
    podeGuardar,
    tratarFetch,
    instalar,
    ativar,
    responder,
  };
})(typeof self === 'undefined' ? globalThis : self);
