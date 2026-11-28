// @vitest-environment jsdom
import { createElement, createRef, useState } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { secaoInicialDaFicha, TelaFicha } from './ficha.js';
import type { Ficha } from './ficha-paciente.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { aguardarConfirmacao } from './confirmacao-prova.js';
import {
  hashFicha,
  iniciais,
  lerRotaFicha,
  type OpcoesFicha,
  type SecaoFicha,
} from './ficha-paciente.js';

const id = '10000000-0000-4000-8000-000000000001';
const paciente = { id, nome: 'Helena Souza Fictícia', nome_preferencia: 'Lena' };

let raiz: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<section id="raiz"></section>';
  raiz = document.getElementById('raiz') as HTMLElement;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function secao(nome: string, extra: Partial<SecaoFicha> = {}) {
  const desmontar = vi.fn();
  const pendenteRef: { atual: ((valor: boolean) => void) | null } = { atual: null };
  const definicao: SecaoFicha = {
    id: nome,
    rotulo: nome.toUpperCase(),
    montar: (conteudo, pendente) => {
      pendenteRef.atual = pendente;
      conteudo.textContent = `conteúdo de ${nome}`;
      return () => {
        desmontar();
        conteudo.replaceChildren();
      };
    },
    ...extra,
  };
  return { definicao, desmontar, pendenteRef };
}

function abrir(secoes: SecaoFicha[], extra: Partial<OpcoesFicha> = {}) {
  const confirmar = vi.fn(async () => true);
  const aoSelecionar = vi.fn();
  const aoVoltar = vi.fn();
  const {
    secaoInicial,
    raiz: destino,
    ...opcoes
  } = {
    raiz,
    paciente,
    secoes,
    confirmar,
    aoSelecionar,
    aoVoltar,
    ...extra,
  };
  const comando = createRef<Ficha>();
  const painel = render(createElement(TelaFicha, { ...opcoes, comando }), { container: destino });
  const controlador = comando.current;
  if (!controlador) throw new Error('Ficha indisponível no teste.');
  const inicial = secaoInicialDaFicha(opcoes.secoes, secaoInicial);
  if (inicial) void controlador.selecionar(inicial, { confirmar: false });
  const ficha: Ficha = {
    ...controlador,
    desmontar() {
      controlador.desmontar();
      painel.rerender(null);
    },
  };

  return { ficha, confirmar, aoSelecionar, aoVoltar, retirarMoldura: () => painel.rerender(null) };
}

const aba = (nome: string) => document.getElementById(`ficha-aba-${nome}`) as HTMLButtonElement;

it('elimina o tabIndex anterior ao clicar após navegar por seta', () => {
  abrir(['visao', 'diario', 'pendencias'].map((nome) => secao(nome).definicao));
  aba('visao').focus();
  aba('visao').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(document.activeElement).toBe(aba('diario'));
  aba('pendencias').click();
  expect(document.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
  expect(aba('pendencias').tabIndex).toBe(0);
});

it('desmontar a moldura invalida a pendência e encerra a seção legada', async () => {
  const dados = secao('dados');
  const { ficha, retirarMoldura } = abrir([dados.definicao]);
  dados.pendenteRef.atual?.(true);
  expect(ficha.pendencia()).not.toBeNull();
  retirarMoldura();
  expect(ficha.pendencia()).toBeNull();
  await vi.waitFor(() => expect(dados.desmontar).toHaveBeenCalledTimes(1));
});

it('limpa a pendência quando a seção React falha e permite abrir a seção novamente', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const anamnese: SecaoFicha = {
    id: 'anamnese',
    rotulo: 'Anamnese',
    compor: async (pendente) => {
      function SecaoComFalha() {
        const [falhou, definirFalhou] = useState(false);
        if (falhou) throw new Error('Falha fictícia na seção');
        return createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              pendente(true);
              definirFalhou(true);
            },
          },
          'Editar anamnese',
        );
      }
      return createElement(SecaoComFalha);
    },
  };
  const { ficha } = abrir([anamnese]);
  const botao = (texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((item) => item.textContent === texto);
  await vi.waitFor(() => expect(botao('Editar anamnese')).toBeDefined());
  const editar = botao('Editar anamnese');
  if (!editar) throw new Error('A seção inicial não foi aberta.');
  fireEvent.click(editar);
  expect(raiz.textContent).toContain('Tente abrir a área de novo.');
  expect(ficha.pendencia()).toBeNull();
  const tentar = botao('Tentar novamente');
  if (!tentar) throw new Error('A ação de recuperação não foi desenhada.');
  fireEvent.click(tentar);
  await vi.waitFor(() => expect(botao('Editar anamnese')).toBeDefined());
});

it('lê só rota com identificador e seção bem formados', () => {
  expect(lerRotaFicha(hashFicha(id, 'plano'))).toEqual({ id, secao: 'plano' });
  expect(lerRotaFicha(`#paciente/${id.toUpperCase()}/visao`)).toEqual({ id, secao: 'visao' });
  for (const hash of [
    '',
    '#paciente/abc/visao',
    `#paciente/${id}`,
    `#paciente/${id}/Visao`,
    `#paciente/${id}/visao/extra`,
    `#paciente/${id}/../x`,
    `#outro/${id}/visao`,
  ])
    expect(lerRotaFicha(hash)).toBeNull();
});

it('gera iniciais de nome simples, composto e vazio', () => {
  expect(iniciais('Helena Souza Fictícia')).toBe('HF');
  expect(iniciais('  lena ')).toBe('L');
  expect(iniciais('')).toBe('?');
});

it('monta cabeçalho, abas ARIA e a seção inicial indicada', () => {
  const um = secao('visao');
  const dois = secao('plano');
  const { aoSelecionar } = abrir([um.definicao, dois.definicao], { secaoInicial: 'plano' });
  expect(document.getElementById('ficha-title')?.textContent).toBe(paciente.nome);
  expect(raiz.textContent).toContain('Nome de preferência: Lena');
  expect(raiz.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
    'Seções da ficha',
  );
  expect(aba('plano').getAttribute('aria-selected')).toBe('true');
  expect(aba('visao').getAttribute('aria-selected')).toBe('false');
  expect(aba('plano').tabIndex).toBe(0);
  expect(aba('visao').tabIndex).toBe(-1);
  const painel = document.getElementById('ficha-painel');
  expect(painel?.getAttribute('role')).toBe('tabpanel');
  expect(painel?.getAttribute('aria-labelledby')).toBe('ficha-aba-plano');
  expect(painel?.textContent).toBe('conteúdo de plano');
  expect(um.desmontar).not.toHaveBeenCalled();
  expect(aoSelecionar).toHaveBeenCalledWith('plano');
});

it('usa a primeira seção quando a inicial não existe', () => {
  abrir([secao('visao').definicao, secao('plano').definicao], { secaoInicial: 'inexistente' });
  expect(aba('visao').getAttribute('aria-selected')).toBe('true');
});

it('troca de seção desmontando a anterior e mantendo uma só montada', () => {
  const um = secao('visao');
  const dois = secao('plano');
  const { aoSelecionar } = abrir([um.definicao, dois.definicao]);
  aba('plano').click();
  expect(um.desmontar).toHaveBeenCalledTimes(1);
  expect(document.getElementById('ficha-painel')?.textContent).toBe('conteúdo de plano');
  expect(document.querySelectorAll('.ficha-secao')).toHaveLength(1);
  expect(aoSelecionar).toHaveBeenLastCalledWith('plano');
});

it('navega as abas por teclado sem ativar até confirmar', () => {
  const um = secao('visao');
  const dois = secao('plano');
  const tres = secao('anamnese');
  abrir([um.definicao, dois.definicao, tres.definicao]);
  aba('visao').focus();
  aba('visao').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(document.activeElement).toBe(aba('plano'));
  expect(aba('visao').getAttribute('aria-selected')).toBe('true');
  expect(dois.desmontar).not.toHaveBeenCalled();
  aba('plano').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  expect(document.activeElement).toBe(aba('anamnese'));
  aba('anamnese').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(document.activeElement).toBe(aba('visao'));
  aba('visao').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  expect(document.activeElement).toBe(aba('anamnese'));
  aba('anamnese').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  expect(document.activeElement).toBe(aba('visao'));
  aba('visao').focus();
  aba('visao').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  aba('plano').click();
  expect(aba('plano').getAttribute('aria-selected')).toBe('true');
});

it('indica seção sem fonte como em breve, sem dados nem ação de gravação', () => {
  const um = secao('visao');
  abrir([um.definicao, { id: 'diario', rotulo: 'Diário', montar: null }]);
  expect(aba('diario').textContent).toContain('em breve');
  aba('diario').click();
  const painel = document.getElementById('ficha-painel') as HTMLElement;
  expect(painel.textContent).toContain('Diário: em breve');
  expect(painel.textContent).toContain('Nada foi registrado nem enviado aqui');
  expect(painel.querySelector('button, input, textarea, select, form')).toBeNull();
  expect(um.desmontar).toHaveBeenCalledTimes(1);
});

it('pede confirmação ao sair de seção com alteração pendente e respeita a recusa', async () => {
  const um = secao('anamnese', { descarte: 'Descartar anamnese?' });
  const dois = secao('plano');
  const { confirmar } = abrir([um.definicao, dois.definicao]);
  um.pendenteRef.atual?.(true);
  confirmar.mockResolvedValueOnce(false);
  aba('plano').click();
  await aguardarConfirmacao();
  expect(confirmar).toHaveBeenCalledWith('Descartar anamnese?');
  expect(aba('anamnese').getAttribute('aria-selected')).toBe('true');
  expect(um.desmontar).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(aba('anamnese'));
  aba('plano').click();
  await aguardarConfirmacao();
  expect(um.desmontar).toHaveBeenCalledTimes(1);
  expect(aba('plano').getAttribute('aria-selected')).toBe('true');
});

it('pede confirmação ao voltar com alteração pendente e só então avisa a saída', async () => {
  const um = secao('anamnese');
  const { confirmar, aoVoltar } = abrir([um.definicao]);
  document.getElementById('ficha-voltar')?.click();
  await aguardarConfirmacao();
  expect(confirmar).not.toHaveBeenCalled();
  expect(aoVoltar).toHaveBeenCalledTimes(1);
  um.pendenteRef.atual?.(true);
  confirmar.mockResolvedValueOnce(false);
  document.getElementById('ficha-voltar')?.click();
  await aguardarConfirmacao();
  expect(aoVoltar).toHaveBeenCalledTimes(1);
  document.getElementById('ficha-voltar')?.click();
  await aguardarConfirmacao();
  expect(aoVoltar).toHaveBeenCalledTimes(2);
});

it('não deixa resíduo do paciente anterior nem herda pendência dele', () => {
  const anterior = secao('visao');
  const { ficha } = abrir([anterior.definicao]);
  const pendenteAntiga = anterior.pendenteRef.atual;
  pendenteAntiga?.(true);
  expect(ficha.pendencia()).not.toBeNull();
  ficha.desmontar();
  expect(raiz.textContent).toBe('');
  expect(anterior.desmontar).toHaveBeenCalledTimes(1);
  const novo = secao('visao');
  const { ficha: seguinte } = abrir([novo.definicao], {
    paciente: {
      id: '10000000-0000-4000-8000-000000000002',
      nome: 'Outra Pessoa',
      nome_preferencia: null,
    },
  });
  pendenteAntiga?.(true);
  expect(seguinte.pendencia()).toBeNull();
  expect(raiz.textContent).not.toContain('Helena');
  expect(raiz.textContent).toContain('Nome de preferência não informado');
});

it('limpa a seção atual e a remonta quando pedido', () => {
  const um = secao('visao');
  const { ficha } = abrir([um.definicao]);
  ficha.limparSecao();
  expect(ficha.secaoVazia()).toBe(true);
  expect(document.getElementById('ficha-painel')?.textContent).toBe('');
  expect(um.desmontar).toHaveBeenCalledTimes(1);
  ficha.remontarSecao();
  expect(ficha.secaoVazia()).toBe(false);
  expect(document.getElementById('ficha-painel')?.textContent).toBe('conteúdo de visao');
});

it('mostra erro genérico quando a seção não consegue montar', () => {
  abrir([
    {
      id: 'visao',
      rotulo: 'Visão',
      montar: () => {
        throw new Error('detalhe interno');
      },
    },
  ]);
  const painel = document.getElementById('ficha-painel') as HTMLElement;
  expect(painel.textContent).toBe('Não foi possível abrir esta seção. Tente novamente.');
  expect(painel.textContent).not.toContain('detalhe interno');
});

it('sem lista de primárias mantém todas as seções numa faixa só, como antes', () => {
  abrir([secao('visao').definicao, secao('plano').definicao, secao('anamnese').definicao]);
  expect(document.querySelector('.ficha-mais')).toBeNull();
  expect(aba('visao').getAttribute('role')).toBe('tab');
  expect(aba('anamnese').getAttribute('role')).toBe('tab');
});

it('separa seções primárias de "Mais seções" e permite acesso a todas as permitidas', () => {
  const visao = secao('visao');
  const plano = secao('plano');
  const anamnese = secao('anamnese');
  const rede = secao('rede');
  const { aoSelecionar } = abrir(
    [visao.definicao, plano.definicao, anamnese.definicao, rede.definicao],
    {
      primarias: ['visao', 'plano'],
    },
  );
  const tablist = document.querySelector('[role="tablist"]') as HTMLElement;
  expect(tablist.contains(aba('visao'))).toBe(true);
  expect(tablist.contains(aba('plano'))).toBe(true);
  expect(tablist.contains(aba('anamnese'))).toBe(false);
  expect(tablist.contains(aba('rede'))).toBe(false);
  const mais = document.querySelector('.ficha-mais') as HTMLDetailsElement;
  expect(mais).not.toBeNull();
  expect(mais.contains(aba('anamnese'))).toBe(true);
  expect(mais.contains(aba('rede'))).toBe(true);
  // Toda seção autorizada continua acessível, esteja na faixa primária ou em "Mais seções".
  aba('rede').click();
  expect(document.getElementById('ficha-painel')?.textContent).toBe('conteúdo de rede');
  expect(aoSelecionar).toHaveBeenLastCalledWith('rede');
});

it('abre "Mais seções" sozinho quando a seção ativa vem do segundo nível (link direto ou troca)', () => {
  const visao = secao('visao');
  const plano = secao('plano');
  const rede = secao('rede');
  const { ficha } = abrir([visao.definicao, plano.definicao, rede.definicao], {
    primarias: ['visao', 'plano'],
    secaoInicial: 'rede',
  });
  const mais = document.querySelector('.ficha-mais') as HTMLDetailsElement;
  expect(mais.open).toBe(true);
  expect(aba('rede').getAttribute('aria-current')).toBe('true');
  ficha.selecionar('visao');
  expect(mais.open).toBe(false);
  expect(aba('rede').getAttribute('aria-current')).toBe('false');
});

it('restringe a navegação por seta às abas primárias; as demais seguem a ordem de Tab', () => {
  const visao = secao('visao');
  const plano = secao('plano');
  const rede = secao('rede');
  abrir([visao.definicao, plano.definicao, rede.definicao], { primarias: ['visao', 'plano'] });
  aba('visao').focus();
  aba('visao').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(document.activeElement).toBe(aba('plano'));
  aba('plano').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  // Só duas primárias: o ciclo volta para "visao" e nunca alcança "rede" pela seta.
  expect(document.activeElement).toBe(aba('visao'));
});

it('abre "Mais seções" antes de rolar até a aba secundária, não depois (senão o scroll é inútil)', () => {
  const rolar = vi.fn(function (this: HTMLElement) {
    // No instante da rolagem, "Mais seções" já precisa estar aberto — rolar até uma aba
    // dentro de um <details> fechado não leva a nada à vista.
    const mais = this.closest('.ficha-mais') as HTMLDetailsElement | null;
    if (mais) estadoAoRolar.push(mais.open);
  });
  const estadoAoRolar: boolean[] = [];
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: rolar,
  });
  try {
    abrir([secao('visao').definicao, secao('rede').definicao], {
      primarias: ['visao'],
      secaoInicial: 'rede',
    });
    expect(estadoAoRolar).toEqual([true]);
  } finally {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
});

it('traz a aba atual para a área visível da faixa de abas ao abrir e ao trocar de seção', () => {
  const rolar = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: rolar,
  });
  try {
    const { ficha } = abrir([secao('visao').definicao, secao('cadastro').definicao], {
      secaoInicial: 'cadastro',
    });
    expect(rolar.mock.contexts.at(-1)).toBe(document.getElementById('ficha-aba-cadastro'));
    rolar.mockClear();
    ficha.selecionar('visao');
    expect(rolar.mock.contexts.at(-1)).toBe(document.getElementById('ficha-aba-visao'));
    expect(rolar).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  } finally {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
});

it('mantém entrada por Tab nas abas primárias com seção secundária ativa', () => {
  abrir([secao('visao').definicao, secao('plano').definicao, secao('rede').definicao], {
    primarias: ['visao', 'plano'],
    secaoInicial: 'rede',
  });
  expect(aba('visao').tabIndex).toBe(0);
  expect(aba('visao').getAttribute('aria-selected')).toBe('false');
  expect(aba('plano').tabIndex).toBe(-1);
  aba('visao').focus();
  aba('visao').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(document.activeElement).toBe(aba('plano'));
});
