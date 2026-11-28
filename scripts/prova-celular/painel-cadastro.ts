/**
 * Bancada da prova de navegador do diálogo de cadastro (`web/painel-cadastro.ts`).
 *
 * Por que existe: o painel liga abrir, fechar e foco preso num `<dialog>` de
 * `web/index.html`, e o Esc nativo, o fundo inerte e o Tab de verdade só existem num
 * navegador — o jsdom de `web/painel-cadastro.test.ts` não tem nenhum dos três.
 *
 * A marcação NÃO é copiada: é lida de `web/index.html` e só o diálogo e o botão que o abre
 * entram na página. `main.ts` não é carregado (precisaria de sessão e serviço); o que ele
 * faz com o diálogo — mostrar ou ocultar o botão e o formulário conforme a permissão de
 * cadastro vinda do servidor — é reproduzido pelo parâmetro `?sem-permissao`.
 * Os campos são montados pelo mesmo módulo React usado pela casca.
 */
import { createElement, createRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { CamposCasoNovo, type ComandoCamposCasoNovo } from '../../web/campos-caso-novo.js';

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

function elemento<T extends HTMLElement>(id: string): T {
  const no = document.getElementById(id);
  if (!no) throw new Error(`Campo da bancada ausente: ${id}`);
  return no as T;
}

const raiz = document.createElement('div');
document.body.append(raiz);
const arvore = createRoot(raiz);
flushSync(() =>
  arvore.render(
    createElement(CamposCasoNovo, {
      destinos: {
        contatos: elemento('contacts-list'),
        adicionar: elemento('add-contact-controle'),
        erroContatos: elemento('contacts-error'),
        nascimento: elemento('birth-date-controle'),
        situacao: elemento('case-status-controle'),
        responsavel: elemento('case-manager-controle'),
        estadoResponsavel: elemento('manager-state'),
        tentarNovamente: elemento('manager-retry-controle'),
      },
      comando: createRef<ComandoCamposCasoNovo>(),
      listarResponsaveis: async () => [],
    }),
  ),
);

// Como em `index.html`: o painel só depois de o diálogo existir no documento.
await import('../../web/painel-cadastro.ts');
document.body.dataset.pronta = '';
