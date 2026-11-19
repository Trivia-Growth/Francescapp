/**
 * Service worker do FFCMApp (FR-071). Casca fina: toda decisão está em `casca-regras.js`,
 * que é testável fora do worker. Script clássico de propósito — `importScripts` funciona em
 * todos os navegadores alvo, inclusive no Safari do iPhone, sem depender de worker de módulo.
 *
 * Nada aqui guarda resposta autenticada: quando a decisão é `ignorar`, `respondWith` não é
 * chamado e o pedido segue para a rede sem passar pelo worker.
 */
importScripts('./casca-regras.js');

const regras = self.CascaRegras;

self.addEventListener('install', (evento) => {
  evento.waitUntil(regras.instalar(self));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(regras.ativar(self));
});

self.addEventListener('fetch', (evento) => {
  regras.tratarFetch(self, evento);
});
