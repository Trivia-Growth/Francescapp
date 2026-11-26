import { useEffect } from 'react';

/* Trava de rolagem própria, por CSSOM.
 *
 * Por que não usamos a do Radix: medido em navegador real em 25/11/2026, sob a CSP de
 * `web/index.html` (`style-src 'self'`, sem `'unsafe-inline'`), o `react-remove-scroll-bar`
 * — dependência do `@radix-ui/react-dialog` — injeta um `<style>` com
 * `body[data-scroll-locked] { overflow: hidden !important }`. O navegador BLOQUEIA essa
 * folha: `sheet === null`, `getComputedStyle(body).overflow` continua `visible`, e o fundo
 * rola com o diálogo aberto. Falha silenciosa: o atributo é aplicado, então parece
 * funcionar ao ler o DOM.
 *
 * `element.style` é CSSOM, não folha injetada, e `style-src` não governa CSSOM — a mesma
 * razão pela qual o posicionamento do Radix passa intacto. Então a trava escrita aqui
 * funciona sob a CSP atual, sem afrouxar nada.
 *
 * As outras saídas foram descartadas: `'unsafe-inline'` libera toda folha e todo atributo
 * `style` injetável, o que é desproporcional para 775 bytes de conteúdo fixo e abre o vetor
 * clássico de exfiltração por CSS em produto com conteúdo clínico; o hash da folha quebra
 * em silêncio a cada atualização da dependência, devolvendo o mesmo defeito invisível; e
 * `nonce` exigiria mover a CSP de meta estática para cabeçalho por requisição, que é
 * mudança na camada de entrega.
 *
 * Permanece uma violação de console por sessão, do `<style>` bloqueado do Radix. É ruído,
 * não defeito: a trava de verdade é a daqui. */
export function useTravaRolagem(ativa: boolean): void {
  useEffect(() => {
    if (!ativa) return;
    const corpo = document.body;
    const anterior = corpo.style.overflow;
    const anteriorPadding = corpo.style.paddingRight;
    // Sem compensar a barra de rolagem, travar desloca a página inteira ao abrir.
    const barra = window.innerWidth - document.documentElement.clientWidth;
    corpo.style.overflow = 'hidden';
    if (barra > 0) corpo.style.paddingRight = `${String(barra)}px`;
    return () => {
      corpo.style.overflow = anterior;
      corpo.style.paddingRight = anteriorPadding;
    };
  }, [ativa]);
}
