import { defineConfig } from '@playwright/test';

/**
 * Prova de conforto no celular (tarefa 4.3 de `financeiro-despesa-e-repasse` e de
 * `pwa-e-avisos-no-app`). Existe porque jsdom não faz layout: largura renderizada, rolagem
 * horizontal e área de toque só podem ser medidas num navegador de verdade.
 *
 * O servidor é o Vite do próprio repositório, em `127.0.0.1`, com a configuração
 * `scripts/prova-celular-vite.config.mjs`. Nenhum serviço remoto é chamado: o teste recusa
 * qualquer requisição que não seja do servidor local e usa dublês para a API.
 */
export default defineConfig({
  testDir: './scripts/prova-celular',
  testMatch: '**/*.pw.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    // Sem permissão de câmera, microfone ou localização: a prova é de layout.
    permissions: [],
  },
  webServer: {
    command: 'pnpm exec vite --config scripts/prova-celular-vite.config.mjs',
    url: 'http://127.0.0.1:5174/scripts/prova-celular/financeiro.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
