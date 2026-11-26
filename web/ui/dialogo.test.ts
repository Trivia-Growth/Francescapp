// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { abrirDialogo, focaveis } from './dialogo.js';

/*  O diálogo é o único lugar da aplicação onde o foco pode se perder sem que ninguém veja:
 *  se ele escapar para a lista atrás do fundo escurecido, quem navega por teclado continua
 *  tabulando num conteúdo que não pode tocar. É isso que estes testes guardam — e a volta
 *  do foco a quem abriu, sem a qual o teclado recomeça do topo da página. */

it('abre no documento, prende o foco e devolve a quem abriu ao fechar', () => {
  document.body.replaceChildren();
  const origem = document.createElement('button');
  origem.textContent = 'Novo paciente';
  document.body.append(origem);
  origem.focus();

  const campo = document.createElement('input');
  const dialogo = abrirDialogo({
    titulo: 'Novo paciente',
    descricao: 'Todos os campos são obrigatórios.',
    corpo: campo,
    acoes: [{ rotulo: 'Cadastrar paciente', peso: 'principal', marca: 'enviar' }],
  });

  expect(dialogo.elemento.hasAttribute('open')).toBe(true);
  expect(document.activeElement).toBe(campo);
  // Campo, ação e o fechar do cabeçalho: nada mais entra na volta do Tab.
  expect(focaveis(dialogo.elemento)).toHaveLength(3);

  dialogo.elemento.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
  );
  expect(dialogo.elemento.contains(document.activeElement)).toBe(true);

  dialogo.fechar();
  expect(document.querySelector('.ui-dialogo')).toBeNull();
  expect(document.activeElement).toBe(origem);
});

it('Esc fecha, e a ação que recusa mantém o diálogo aberto', () => {
  document.body.replaceChildren();
  let tentativas = 0;
  const dialogo = abrirDialogo({
    titulo: 'Cadastrar paciente?',
    acoes: [
      {
        rotulo: 'Cadastrar',
        marca: 'enviar',
        aoAtivar: () => {
          tentativas += 1;
          // Validação recusou: a pessoa precisa ver o erro no campo, não a tela fechando.
          return tentativas > 1 ? undefined : false;
        },
      },
    ],
  });

  const enviar = dialogo.rodape.querySelector<HTMLButtonElement>('[data-acao="enviar"]');
  enviar?.click();
  expect(document.querySelector('.ui-dialogo')).not.toBeNull();
  enviar?.click();
  expect(document.querySelector('.ui-dialogo')).toBeNull();
});

it('a medida pedida vai para o elemento, que é o que a folha de estilo lê', () => {
  document.body.replaceChildren();
  const formulario = abrirDialogo({ titulo: 'Formulário' });
  expect(formulario.elemento.dataset.medida).toBe('formulario');
  formulario.fechar();

  const conteudo = abrirDialogo({ titulo: 'Conteúdo', medida: 'conteudo' });
  expect(conteudo.elemento.dataset.medida).toBe('conteudo');
  conteudo.fechar();

  // Decisão não ganha botão de fechar: a resposta é uma das ações, nunca um "x" ambíguo.
  const decisao = abrirDialogo({ titulo: 'Descartar?', medida: 'decisao' });
  expect(decisao.elemento.querySelector('[data-acao="fechar"]')).toBeNull();
  decisao.elemento.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  expect(document.querySelector('.ui-dialogo')).toBeNull();
});
