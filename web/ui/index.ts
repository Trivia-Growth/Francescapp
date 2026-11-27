/** Camada de componente da aplicação (`openspec/changes/linguagem-visual-ffcm`).
 *
 *  Uma porta só: a tela importa daqui e não precisa saber em que arquivo cada peça mora.
 *  Nada neste diretório consulta serviço, decide autorização ou guarda dado de pessoa.
 */
export { aviso, botao, campoTexto, estadoVazio, linhaLista, superficie } from './basicos.js';
export type {
  Campo,
  PedidoBotao,
  PedidoCampo,
  PedidoLinha,
  PedidoSuperficie,
  PesoBotao,
  Superficie,
  TomAviso,
} from './basicos.js';
export { aplicarControlesProprios } from './controles.js';
export { abrirDialogo, focaveis, prenderFoco } from './dialogo.js';
export type { AcaoDialogo, Dialogo, MedidaDialogo, PedidoDialogo } from './dialogo.js';
export { aprimorarData, aprimorarDatas, doVisivel, paraVisivel } from './data.js';
export type { CampoData } from './data.js';
export { aprimorarSelecao, aprimorarSelecoes } from './selecao.js';
export type { Selecao } from './selecao.js';
