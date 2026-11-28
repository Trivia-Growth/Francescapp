/* Repasse para a ponte canônica.
 *
 * Em 25/11/2026 duas frentes de migração descobriram o mesmo defeito ao mesmo tempo —
 * `createRoot().render()` agenda em vez de executar, e `montar*(raiz)` devolvia a raiz
 * vazia — e cada uma escreveu o próprio contorno com `flushSync`. A correção foi para a
 * origem, `web/ponte/ilha.ts`, que agora é síncrona e tolera remontagem na mesma raiz.
 *
 * Este arquivo sobrevive só para os 15 módulos que já importam daqui não precisarem ser
 * editados enquanto outras frentes trabalham neles. Sai na Fase 7, junto com a ilha. */
export { ilha as ilhaSincrona } from '../ponte/ilha.js';
