// Configuração usada apenas pela prova de conforto no celular (Playwright); não integra o
// build. Serve o repositório inteiro para que a página de bancada em `scripts/prova-celular/`
// monte o código real de `web/` com a folha de estilo real, sem cópia nem reimplementação.
// Porta própria (5174) para não disputar com o servidor local de feedback (5173).
export default {
  cacheDir: 'node_modules/.vite-prova-celular',
  publicDir: 'web/public',
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
};
