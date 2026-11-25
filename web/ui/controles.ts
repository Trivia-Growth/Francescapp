/** Seleção e data da aplicação em telas que montam o próprio DOM depois de abrir.
 *
 *  Por que existe: `aprimorarSelecoes` e `aprimorarDatas` trocam o widget do navegador
 *  pelo da aplicação uma vez, sobre o que já está no documento. As telas desta aplicação
 *  não são assim — administração, ficha, plantão e turno trocam o conteúdo inteiro a cada
 *  consulta, e o `<select>` que chega depois da resposta continuaria sendo o do navegador.
 *  O diálogo de cadastro já resolvia isso com um observador próprio; repetir aquelas oito
 *  linhas em cada tela é a duplicação que a camada de componente existe para evitar.
 *
 *  O controle nativo continua no documento e continua dono do valor: o que muda é quem
 *  aparece e o que o teclado percorre. Sem o script, o nativo segue aparecendo e
 *  funcionando.
 */
import { aprimorarDatas } from './data.js';
import { aprimorarSelecoes } from './selecao.js';

/** Aprimora o que já está na raiz e o que chegar depois. Devolve como parar de observar.
 *
 *  Aprimorar gera mutação dentro da própria raiz observada. Não há laço porque
 *  `aprimorarSelecoes` e `aprimorarDatas` pulam o que já foi aprimorado: a rodada seguinte
 *  não encontra nada para fazer e não produz mutação nova. */
export function aplicarControlesProprios(raiz: HTMLElement): () => void {
  const aplicar = () => {
    aprimorarSelecoes(raiz);
    aprimorarDatas(raiz);
  };
  aplicar();
  const observador = new MutationObserver(aplicar);
  observador.observe(raiz, { childList: true, subtree: true });
  return () => observador.disconnect();
}
