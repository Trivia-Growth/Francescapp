import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

/* A ponte que torna a migração incremental.
 *
 * Toda visão de `web/` segue o mesmo contrato desde o início do produto:
 *
 *     montar(raiz: HTMLElement, …): () => void   // devolve a desmontagem
 *
 * `ilha` satisfaz esse mesmo contrato montando uma raiz React dentro da `raiz` recebida.
 * Consequência prática: `web/main.ts` continua chamando `montar*(raiz)` sem saber que é
 * React, e cada módulo migra sozinho, sem arrastar vizinho junto. Reverter uma migração é
 * reverter um commit.
 *
 * O que isto resolve de verdade (VIS-012): hoje cada módulo confere à mão uma flag `ativa`
 * antes de escrever — `web/concessao-equipe.ts` tinha SEIS `if (!ativa) return` protegendo
 * escritas em DOM já desmontado. Cada ocorrência esquecida é uma escrita em nó morto, e
 * nenhuma ferramenta avisa. `root.unmount()` cancela os efeitos por construção.
 *
 * Isto é andaime declarado. Sai na Fase 7, quando a casca também for React e houver uma
 * raiz só. */

/* Duas correções de 25/11/2026, as duas medidas em uso real, não supostas.
 *
 * 1. `root.render()` é ASSÍNCRONO. A primeira versão desta ponte devolvia antes de o
 *    conteúdo existir, e quem lia a raiz na linha seguinte — o que vários chamadores de
 *    `main.ts` fazem — encontrava `''`. O contrato imperativo que estamos preservando é
 *    síncrono, então `flushSync` é obrigatório aqui, não otimização. O teste original não
 *    pegou porque usava `act()`, que descarrega a fila e escondia o problema.
 *
 * 2. Uma montagem antiga pode reencontrar o mesmo contêiner. O registro abaixo
 *    desmonta a raiz anterior antes de criar a próxima, para que cada contêiner
 *    tenha uma única raiz React. */
const raizesVivas = new WeakMap<HTMLElement, Root>();

export function ilha(raiz: HTMLElement, elemento: ReactElement): () => void {
  return ilhaAtualizavel(raiz, elemento).desmontar;
}

/** Atualiza props de uma ilha sem descartar os controles nativos que o hospedeiro lê. */
export function ilhaAtualizavel(raiz: HTMLElement, elemento: ReactElement) {
  raizesVivas.get(raiz)?.unmount();
  const arvore = createRoot(raiz);
  raizesVivas.set(raiz, arvore);
  flushSync(() => {
    arvore.render(elemento);
  });
  let desmontada = false;
  function desmontar() {
    // Desmontar duas vezes é erro de quem chama, não motivo para quebrar a navegação:
    // `main.ts` desmonta ao trocar de tela e de novo ao perder o acesso.
    if (desmontada) return;
    desmontada = true;
    // Só apaga o registro se ainda for esta árvore: uma remontagem já trocou o dono.
    if (raizesVivas.get(raiz) === arvore) raizesVivas.delete(raiz);
    flushSync(() => {
      arvore.unmount();
    });
  }
  return {
    atualizar(proximo: ReactElement) {
      if (desmontada || raizesVivas.get(raiz) !== arvore) return;
      flushSync(() => arvore.render(proximo));
    },
    desmontar,
  };
}
