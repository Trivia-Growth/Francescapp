/** O formulário de cadastro ficava aberto na lateral da lista o tempo todo, ocupando
 *  a tela mesmo sem ninguém cadastrar. Aqui ele vira diálogo: abre pelo botão e fecha
 *  no "Fechar" ou no Esc. Nada de autorização passa por este arquivo — quem pode
 *  cadastrar continua sendo decidido no servidor e no `hidden` do próprio formulário. */
import { prenderFoco } from './ui/dialogo.js';

const dialogo = document.getElementById('cadastro-dialogo');
const abrir = document.getElementById('new-patient-link');
const fechar = document.getElementById('cadastro-fechar');

if (dialogo instanceof HTMLDialogElement && abrir) {
  abrir.addEventListener('click', (evento) => {
    evento.preventDefault();
    // Sem permissão de cadastro o formulário está oculto; abrir um diálogo vazio confunde.
    if (document.getElementById('cadastro')?.hasAttribute('hidden')) return;
    if (!dialogo.open) dialogo.showModal();
    // Independe da ordem dos ouvintes: o foco termina no título do formulário.
    document.getElementById('create-title')?.focus();
  });
  fechar?.addEventListener('click', () => dialogo.close());
  // O mesmo foco preso do diálogo da camada de componente (`web/ui/dialogo.ts`): enquanto
  // o cadastro está aberto, Tab e Shift+Tab circulam dentro dele e não voltam para a lista
  // atrás do fundo escurecido. `showModal` já faz isso no navegador, mas não no jsdom das
  // provas, e o comportamento precisa ser o mesmo nos dois.
  prenderFoco(dialogo);
}
