// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  hashFicha,
  iniciais,
  lerRotaFicha,
  montarFicha,
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
  const confirmar = vi.fn(() => true);
  const aoSelecionar = vi.fn();
  const aoVoltar = vi.fn();
  const ficha = montarFicha({
    raiz,
    paciente,
    secoes,
    confirmar,
    aoSelecionar,
    aoVoltar,
    ...extra,
  });
  return { ficha, confirmar, aoSelecionar, aoVoltar };
}

const aba = (nome: string) => document.getElementById(`ficha-aba-${nome}`) as HTMLButtonElement;

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

it('pede confirmação ao sair de seção com alteração pendente e respeita a recusa', () => {
  const um = secao('anamnese', { descarte: 'Descartar anamnese?' });
  const dois = secao('plano');
  const { confirmar } = abrir([um.definicao, dois.definicao]);
  um.pendenteRef.atual?.(true);
  confirmar.mockReturnValueOnce(false);
  aba('plano').click();
  expect(confirmar).toHaveBeenCalledWith('Descartar anamnese?');
  expect(aba('anamnese').getAttribute('aria-selected')).toBe('true');
  expect(um.desmontar).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(aba('anamnese'));
  aba('plano').click();
  expect(um.desmontar).toHaveBeenCalledTimes(1);
  expect(aba('plano').getAttribute('aria-selected')).toBe('true');
});

it('pede confirmação ao voltar com alteração pendente e só então avisa a saída', () => {
  const um = secao('anamnese');
  const { confirmar, aoVoltar } = abrir([um.definicao]);
  document.getElementById('ficha-voltar')?.click();
  expect(confirmar).not.toHaveBeenCalled();
  expect(aoVoltar).toHaveBeenCalledTimes(1);
  um.pendenteRef.atual?.(true);
  confirmar.mockReturnValueOnce(false);
  document.getElementById('ficha-voltar')?.click();
  expect(aoVoltar).toHaveBeenCalledTimes(1);
  document.getElementById('ficha-voltar')?.click();
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
