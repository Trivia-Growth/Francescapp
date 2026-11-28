/** O formulário de cadastro ficava aberto na lateral da lista o tempo todo, ocupando
 *  a tela mesmo sem ninguém cadastrar. Aqui ele vira diálogo: abre pelo botão e fecha
 *  no "Fechar" ou no Esc. Nada de autorização passa por este arquivo — quem pode
 *  cadastrar continua sendo decidido no servidor e no `hidden` do próprio formulário. */
import { classesBotao } from './componentes/ui/botao.js';
import { classesCampo } from './componentes/ui/campo.js';
import { SINAL_ROLAGEM_VERTICAL } from './componentes/ui/folha.js';
import { prenderFoco } from './ponte/foco-preso.js';

const dialogo = document.getElementById('cadastro-dialogo');
const abrir = document.getElementById('new-patient-link');
const fechar = document.getElementById('cadastro-fechar');

if (dialogo instanceof HTMLDialogElement && abrir) {
  for (const id of ['patient-name', 'preferred-name']) {
    document.getElementById(id)?.classList.add(...classesCampo().split(' '));
  }
  document
    .getElementById('create-submit')
    ?.classList.add(...classesBotao({ peso: 'principal' }).split(' '));
  document.getElementById('cadastro-corpo')?.classList.add(SINAL_ROLAGEM_VERTICAL);
  fechar?.classList.add(
    ...classesBotao({
      peso: 'discreto',
      className: 'px-0 py-0 text-xl leading-none no-underline',
    }).split(' '),
  );

  abrir.addEventListener('click', (evento) => {
    evento.preventDefault();
    // Sem permissão de cadastro o formulário está oculto; abrir um diálogo vazio confunde.
    if (document.getElementById('cadastro')?.hasAttribute('hidden')) return;
    if (!dialogo.open) dialogo.showModal();
    // Independe da ordem dos ouvintes: o foco termina no título do formulário.
    document.getElementById('create-title')?.focus();
  });
  fechar?.addEventListener('click', () => dialogo.close());
  // O mesmo foco preso do diálogo da camada antiga (`web/ponte/foco-preso.ts`): enquanto
  // o cadastro está aberto, Tab e Shift+Tab circulam dentro dele e não voltam para a lista
  // atrás do fundo escurecido. `showModal` sozinho NÃO basta: no Chromium o Tab sai do
  // último controle para o `body` (medido na contraprova de
  // `scripts/prova-celular/painel-cadastro.pw.ts`), e o jsdom nem tem `showModal`.
  prenderFoco(dialogo);
}
