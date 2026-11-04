// Configuração usada apenas no servidor local de feedback; não integra o build.
export default {
  cacheDir: '../node_modules/.vite-local-feedback',
  optimizeDeps: { include: ['zod'] },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/local-feedback': 'http://127.0.0.1:4174',
    },
  },
};
