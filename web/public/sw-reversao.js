/**
 * Worker de reversão (FR-071, design — Migration Plan).
 *
 * Retirar o código do service worker não remove o worker já instalado no aparelho: o que estava
 * instalado continua respondendo até ser substituído. Reverter é publicar **este** conteúdo no
 * mesmo endereço do worker anterior (`/sw.js`). O navegador busca o endereço registrado, encontra
 * este script, ativa-o, ele apaga os caches, cancela o próprio registro e recarrega as páginas.
 *
 * O procedimento para uma pessoa executar está em
 * `openspec/changes/pwa-e-avisos-no-app/tasks.md`, tarefa 1.6.
 */
((escopo) => {
  /**
   * Apaga todos os caches da origem, cancela o registro e recarrega as páginas abertas.
   * @param {{ caches: CacheStorage, registration: { unregister: () => unknown },
   *           clients: { matchAll: (opcoes?: unknown) => Promise<Array<{ navigate?: (url: string) => unknown, url: string }>> } }} escopoWorker
   */
  async function reverter(escopoWorker) {
    const nomes = await escopoWorker.caches.keys();
    for (const nome of nomes) await escopoWorker.caches.delete(nome);
    await escopoWorker.registration.unregister();
    const paginas = await escopoWorker.clients.matchAll({ type: 'window' });
    for (const pagina of paginas) if (pagina.navigate) await pagina.navigate(pagina.url);
  }

  escopo.CascaReversao = { reverter };

  if (typeof escopo.skipWaiting === 'function') {
    escopo.addEventListener('install', () => escopo.skipWaiting());
    escopo.addEventListener('activate', (evento) => evento.waitUntil(reverter(escopo)));
  }
})(typeof self === 'undefined' ? globalThis : self);
