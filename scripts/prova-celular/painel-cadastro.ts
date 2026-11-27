/**
 * Bancada da prova de navegador do diálogo de cadastro (`web/painel-cadastro.ts`).
 *
 * Por que existe: o painel liga abrir, fechar e foco preso num `<dialog>` de
 * `web/index.html`, e o Esc nativo, o fundo inerte e o Tab de verdade só existem num
 * navegador — o jsdom de `web/painel-cadastro.test.ts` não tem nenhum dos três. `#cadastro`
 * é também uma das seis regiões que `web/main.ts` vigia com `aplicarControlesProprios`,
 * então a vigilância é ligada aqui como lá.
 *
 * A marcação NÃO é copiada: é lida de `web/index.html` e só o diálogo e o botão que o abre
 * entram na página. `main.ts` não é carregado (precisaria de sessão e serviço); o que ele
 * faz com o diálogo — mostrar ou ocultar o botão e o formulário conforme a permissão de
 * cadastro vinda do servidor — é reproduzido pelo parâmetro `?sem-permissao`.
 */
import { aplicarControlesProprios } from '../../web/ui/controles.js';

const modelo = new DOMParser().parseFromString(
  await (await fetch('/web/index.html')).text(),
  'text/html',
);
const botao = modelo.getElementById('new-patient-link');
const dialogo = modelo.getElementById('cadastro-dialogo');
if (!botao || !dialogo) throw new Error('web/index.html sem o diálogo de cadastro.');

const conteudo = document.getElementById('conteudo');
conteudo?.append(document.adoptNode(botao), document.adoptNode(dialogo));

const podeCadastrar = !new URLSearchParams(location.search).has('sem-permissao');
const cadastro = document.getElementById('cadastro');
if (!cadastro) throw new Error('#cadastro ausente.');
cadastro.hidden = !podeCadastrar;
botao.hidden = !podeCadastrar;
aplicarControlesProprios(cadastro);

// Como em `index.html`: o painel só depois de o diálogo existir no documento.
await import('../../web/painel-cadastro.ts');
document.body.dataset.pronta = '';
