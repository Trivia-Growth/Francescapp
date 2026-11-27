import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

/* A CSP de `index.html` declara `style-src 'self'` sem `'unsafe-inline'`. Em produção isso
 * está certo e fica: o build emite `<link rel="stylesheet">`, e a diretiva fecha a porta do
 * vetor de exfiltração por CSS, que importa num produto com conteúdo clínico.
 *
 * No servidor de desenvolvimento o Vite injeta a folha como `<style>` em tempo de execução,
 * para trocar estilo sem recarregar. Sob essa diretiva o navegador bloqueia, e a aplicação
 * aparece SEM ESTILO NENHUM no `vite dev` — medido em Chromium em 25/11/2026. Quem fosse
 * conferir a migração concluiria que a migração quebrou o visual.
 *
 * Então o relaxamento vale só para o HTML servido pelo dev server. O arquivo em disco não
 * muda, o build de produção não passa por aqui, e o usuário recebe a CSP original. */
function cspDeDesenvolvimento(): Plugin {
  return {
    name: 'ffcm-csp-desenvolvimento',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(/style-src 'self'/, "style-src 'self' 'unsafe-inline'");
    },
  };
}

/* A aplicação continua servida de `web/index.html`; o que muda é que o empacotador passa a
 * entender JSX e a compilar as utilitárias. */
export default defineConfig({
  plugins: [react(), tailwind(), cspDeDesenvolvimento()],
});
