/** Confirmação dentro da página, no lugar de `window.confirm`.
 *
 *  Achado em 25/11/2026 na aba Administração › Equipe: ao conferir convites pendentes a
 *  tela abria um `window.confirm`. O diálogo nativo fica ACIMA da página, fora do
 *  conteúdo: quem olhava a tela via apenas "Conferindo se há algum convite aguardando
 *  resposta…" parado para sempre, e o diagnóstico virou "estado perdido" quando o que
 *  havia era um diálogo esperando resposta que ninguém via. Um `<dialog>` da própria
 *  aplicação aparece no conteúdo, é fotografável, é testável e segue a mesma linguagem
 *  visual do diálogo de cadastro.
 *
 *  O texto diz a consequência. "Continuar?" não informa o que se perde ao continuar.
 *  O botão seguro — cancelar — recebe o foco inicial e é o destaque visual, porque
 *  confirmar por engano é o erro caro; Esc equivale a cancelar.
 *
 *  Desde a camada de componente (`web/ui/`), a mecânica de foco preso, Esc e devolução do
 *  foco vive em `web/ui/dialogo.ts`: aqui ficou só a decisão. Era a duplicação mais cara
 *  do diretório — cada tela que precisasse de um diálogo copiava estas cem linhas.
 */
import { abrirDialogo } from './ui/dialogo.js';

export type PedidoConfirmacao = {
  /** A consequência, em uma frase, como pergunta. Nunca "Continuar?". */
  titulo: string;
  /** O que mais quem decide precisa saber antes de responder. */
  detalhe?: string;
  /** Rótulo do botão que segue adiante, no mesmo verbo do título. */
  acao: string;
  /** Rótulo do botão seguro. O padrão volta ao que a pessoa estava fazendo. */
  cancelar?: string;
};

/** Abre a confirmação e resolve com a resposta. Cancelar e Esc resolvem `false`. */
export function confirmar(pedido: PedidoConfirmacao): Promise<boolean> {
  return new Promise<boolean>((resolver) => {
    let resposta = false;
    const dialogo = abrirDialogo({
      titulo: pedido.titulo,
      ...(pedido.detalhe ? { descricao: pedido.detalhe } : {}),
      medida: 'decisao',
      classe: 'dialogo-confirmacao',
      acoes: [
        // A ordem no DOM põe "seguir" antes do seguro: é a ordem de tabulação que as provas
        // guardam, e no celular o rodapé inverte visualmente para o seguro ficar sob o polegar.
        { rotulo: pedido.acao, peso: 'secundario', marca: 'confirmar', aoAtivar: dizerSim },
        {
          rotulo: pedido.cancelar ?? 'Voltar',
          peso: 'principal',
          marca: 'cancelar',
          focoInicial: true,
        },
      ],
      aoFechar: () => resolver(resposta),
    });
    dialogo.elemento.dataset.confirmacao = '';
    function dizerSim(): undefined {
      resposta = true;
      return undefined;
    }
  });
}

/** Caso dominante: sair de uma tela com texto digitado que ninguém guardou ainda. */
export function confirmarDescarte(oQue: string): Promise<boolean> {
  return confirmar({
    titulo: `Descartar ${oQue}?`,
    detalhe: 'O que foi digitado e ainda não foi enviado se perde, e não há como recuperar.',
    acao: 'Descartar',
    cancelar: 'Continuar editando',
  });
}
