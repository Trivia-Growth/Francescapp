// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResponsavelOpcao } from './acompanhamento-caso.js';
import { montarCamposCasoNovo } from './campos-caso-novo.js';

const ana: ResponsavelOpcao = {
  usuario_id: '30000000-0000-4000-8000-000000000003',
  rotulo: 'ana@exemplo.test (Profissional)',
  ativo: true,
};
const bia: ResponsavelOpcao = {
  usuario_id: '30000000-0000-4000-8000-000000000004',
  rotulo: 'bia@exemplo.test (Profissional)',
  ativo: false,
};
const PLACEHOLDER = 'Selecione quem acompanha o caso';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function adiado<T>() {
  let resolver!: (valor: T) => void;
  let rejeitar!: (erro: unknown) => void;
  const promessa = new Promise<T>((resolve, reject) => {
    resolver = resolve;
    rejeitar = reject;
  });
  return { promessa, resolver, rejeitar };
}

/** Monta os campos sobre o HTML real da aplicação, para pegar divergência entre marcação e módulo. */
function montar(listar: () => Promise<ResponsavelOpcao[]> = async () => [ana]) {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  const listarResponsaveis = vi.fn(listar);
  const campos = montarCamposCasoNovo(
    {
      contatos: el('contacts-list'),
      adicionar: el<HTMLButtonElement>('add-contact'),
      erroContatos: el('contacts-error'),
      situacao: el<HTMLSelectElement>('case-status'),
      responsavel: el<HTMLSelectElement>('case-manager'),
      estadoResponsavel: el('manager-state'),
      tentarNovamente: el<HTMLButtonElement>('manager-retry'),
    },
    listarResponsaveis,
  );
  return { campos, listarResponsaveis };
}

const linhas = () => [...document.querySelectorAll<HTMLElement>('#contacts-list .contact-row')];
const adicionar = () => el<HTMLButtonElement>('add-contact');
const opcoes = () =>
  [...el<HTMLSelectElement>('case-manager').options].map((opcao) => opcao.textContent);
const removerDa = (linha: HTMLElement) =>
  linha.querySelector<HTMLButtonElement>('.contact-remove') as HTMLButtonElement;

beforeEach(() => {
  document.body.replaceChildren();
});

describe('contatos', () => {
  it('começa vazio, com uma linha, e nada vem pré-selecionado', () => {
    const { campos } = montar();
    expect(linhas()).toHaveLength(1);
    expect(el<HTMLInputElement>('contact-value-1').value).toBe('');
    expect(el<HTMLSelectElement>('contact-type-1').value).toBe('email');
    expect(campos.contatos()).toEqual([]);
    expect(el<HTMLSelectElement>('case-status').value).toBe('');
    expect(campos.situacao()).toBeUndefined();
    expect(el<HTMLSelectElement>('case-manager').value).toBe('');
    expect(campos.responsavelId()).toBeUndefined();
    expect(campos.equipeDisponivel()).toBe(false);
  });

  it('adicionar cria linhas com identificadores sequenciais ligados aos rótulos e para em 10', () => {
    montar();
    for (let numero = 2; numero <= 10; numero += 1) {
      adicionar().click();
      expect(linhas()).toHaveLength(numero);
      expect(el(`contact-type-${numero}`)).not.toBeNull();
      expect(el(`contact-value-${numero}`)).not.toBeNull();
      expect(document.activeElement).toBe(el(`contact-value-${numero}`));
      expect(
        document.querySelector<HTMLLabelElement>(`label[for="contact-value-${numero}"]`)
          ?.textContent,
      ).toBe(`Contato ${numero}`);
      expect(adicionar().disabled).toBe(numero === 10);
    }
    adicionar().click();
    expect(linhas()).toHaveLength(10);
    const ids = [...document.querySelectorAll('#contacts-list [id]')].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('remover tira só a linha escolhida, preserva as outras e reabilita o botão de adicionar', () => {
    const { campos } = montar();
    for (let vez = 0; vez < 9; vez += 1) adicionar().click();
    for (const numero of [1, 2, 3])
      el<HTMLInputElement>(`contact-value-${numero}`).value = `contato${numero}@exemplo.test`;
    expect(adicionar().disabled).toBe(true);

    removerDa(linhas()[1] as HTMLElement).click();

    expect(linhas()).toHaveLength(9);
    expect(document.getElementById('contact-value-2')).toBeNull();
    expect(adicionar().disabled).toBe(false);
    expect(campos.contatos().map((contato) => contato.valor)).toEqual([
      'contato1@exemplo.test',
      'contato3@exemplo.test',
    ]);
    expect(document.activeElement).toBe(el('contact-value-10'));
    adicionar().click();
    expect(linhas()).toHaveLength(10);
    const ids = [...document.querySelectorAll('#contacts-list [id]')].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('só a primeira linha fica sem o botão Remover', () => {
    montar();
    adicionar().click();
    adicionar().click();
    const [primeira, ...demais] = linhas() as [HTMLElement, ...HTMLElement[]];
    expect(removerDa(primeira).hidden).toBe(true);
    expect(demais).toHaveLength(2);
    for (const linha of demais) {
      expect(removerDa(linha).hidden).toBe(false);
      expect(removerDa(linha).textContent).toBe('Remover');
    }
    removerDa(demais[1] as HTMLElement).click();
    expect(removerDa(primeira).hidden).toBe(true);
    expect(removerDa(demais[0] as HTMLElement).hidden).toBe(false);
  });

  it('linhas vazias ou só com espaços não contam; o tipo escolhido acompanha o valor', () => {
    const { campos } = montar();
    adicionar().click();
    adicionar().click();
    el<HTMLInputElement>('contact-value-1').value = 'contato@exemplo.test';
    el<HTMLInputElement>('contact-value-2').value = '   ';
    const tipo3 = el<HTMLSelectElement>('contact-type-3');
    tipo3.value = 'telefone';
    tipo3.dispatchEvent(new Event('change'));
    el<HTMLInputElement>('contact-value-3').value = '11 90000-0000';
    expect(campos.contatos()).toEqual([
      { tipo: 'email', valor: 'contato@exemplo.test' },
      { tipo: 'telefone', valor: '11 90000-0000' },
    ]);
    expect(el<HTMLInputElement>('contact-value-1').type).toBe('email');
    expect(el<HTMLInputElement>('contact-value-3').type).toBe('tel');
  });

  it('reiniciar volta a uma linha vazia, limpa as escolhas e mantém a equipe carregada', async () => {
    const { campos } = montar();
    await campos.carregarResponsaveis();
    adicionar().click();
    el<HTMLInputElement>('contact-value-1').value = 'contato@exemplo.test';
    el<HTMLInputElement>('contact-value-2').value = 'outro@exemplo.test';
    el<HTMLSelectElement>('case-status').value = 'ativo';
    el<HTMLSelectElement>('case-manager').value = ana.usuario_id;
    campos.marcarContatos(true);

    campos.reiniciar();

    expect(linhas()).toHaveLength(1);
    expect(el<HTMLInputElement>('contact-value-1').value).toBe('');
    expect(document.getElementById('contact-value-2')).toBeNull();
    expect(campos.contatos()).toEqual([]);
    expect(campos.situacao()).toBeUndefined();
    expect(campos.responsavelId()).toBeUndefined();
    expect(el('contacts-error').textContent).toBe('');
    expect(campos.equipeDisponivel()).toBe(true);
    expect(opcoes()).toEqual([PLACEHOLDER, ana.rotulo]);
  });

  it('marcarContatos aponta só as linhas inválidas, ou a primeira se nada foi digitado, e limpa', () => {
    const { campos } = montar();
    adicionar().click();
    adicionar().click();
    const [v1, v2, v3] = [1, 2, 3].map((n) => el<HTMLInputElement>(`contact-value-${n}`));
    expect(campos.marcarContatos(true)).toBe(v1);
    expect(v1?.getAttribute('aria-invalid')).toBe('true');
    expect(v2?.hasAttribute('aria-invalid')).toBe(false);
    expect(el('contacts-error').textContent).not.toBe('');

    if (!v1 || !v2 || !v3) throw new Error('Linhas ausentes');
    v1.value = 'contato@exemplo.test';
    v2.value = 'sem arroba';
    expect(campos.marcarContatos(true)).toBe(v2);
    expect(v1.hasAttribute('aria-invalid')).toBe(false);
    expect(v2.getAttribute('aria-invalid')).toBe('true');
    expect(v3.hasAttribute('aria-invalid')).toBe(false);

    expect(campos.marcarContatos(false)).toBeUndefined();
    expect(v2.hasAttribute('aria-invalid')).toBe(false);
    expect(el('contacts-error').textContent).toBe('');
  });
});

describe('equipe do responsável', () => {
  it('mostra "Carregando equipe…" e depois oferece só quem está ativo', async () => {
    const consulta = adiado<ResponsavelOpcao[]>();
    const { campos } = montar(() => consulta.promessa);

    const carga = campos.carregarResponsaveis();
    expect(el('manager-state').textContent).toBe('Carregando equipe…');
    expect(el<HTMLSelectElement>('case-manager').disabled).toBe(true);
    expect(el<HTMLButtonElement>('manager-retry').hidden).toBe(true);
    expect(campos.equipeDisponivel()).toBe(false);

    consulta.resolver([ana, bia]);
    await carga;

    expect(opcoes()).toEqual([PLACEHOLDER, ana.rotulo]);
    expect(el<HTMLSelectElement>('case-manager').disabled).toBe(false);
    expect(el('manager-state').textContent).toBe('');
    expect(el<HTMLButtonElement>('manager-retry').hidden).toBe(true);
    expect(campos.equipeDisponivel()).toBe(true);
    expect(campos.responsavelId()).toBeUndefined();
    el<HTMLSelectElement>('case-manager').value = ana.usuario_id;
    expect(campos.responsavelId()).toBe(ana.usuario_id);
  });

  it('falha de consulta avisa, oferece nova tentativa e a nova tentativa funciona', async () => {
    const tentativas = [adiado<ResponsavelOpcao[]>(), adiado<ResponsavelOpcao[]>()];
    let chamada = 0;
    const { campos, listarResponsaveis } = montar(
      () => (tentativas[chamada++] as (typeof tentativas)[number]).promessa,
    );

    const primeira = campos.carregarResponsaveis();
    tentativas[0]?.rejeitar(new Error('indisponível'));
    await primeira;

    expect(el('manager-state').textContent).toContain('Não foi possível carregar a equipe');
    expect(el('manager-state').textContent).toContain('não pode ser enviado');
    expect(el<HTMLButtonElement>('manager-retry').hidden).toBe(false);
    expect(el<HTMLSelectElement>('case-manager').disabled).toBe(true);
    expect(opcoes()).toEqual([PLACEHOLDER]);
    expect(campos.equipeDisponivel()).toBe(false);

    el<HTMLButtonElement>('manager-retry').click();
    expect(listarResponsaveis).toHaveBeenCalledTimes(2);
    expect(el('manager-state').textContent).toBe('Carregando equipe…');
    expect(el<HTMLButtonElement>('manager-retry').hidden).toBe(true);

    tentativas[1]?.resolver([ana]);
    await vi.waitFor(() => expect(campos.equipeDisponivel()).toBe(true));
    expect(opcoes()).toEqual([PLACEHOLDER, ana.rotulo]);
    expect(el('manager-state').textContent).toBe('');
    expect(el<HTMLSelectElement>('case-manager').disabled).toBe(false);
  });

  it.each([
    ['sem ninguém', []],
    ['só com pessoas inativas', [bia]],
  ])('equipe %s avisa que o cadastro não pode ser enviado', async (_descricao, equipe) => {
    const { campos } = montar(async () => equipe);
    await campos.carregarResponsaveis();
    expect(el('manager-state').textContent).toContain('Nenhuma pessoa ativa da equipe');
    expect(el('manager-state').textContent).toContain('não pode ser enviado');
    expect(el<HTMLSelectElement>('case-manager').disabled).toBe(true);
    expect(el<HTMLButtonElement>('manager-retry').hidden).toBe(true);
    expect(opcoes()).toEqual([PLACEHOLDER]);
    expect(campos.equipeDisponivel()).toBe(false);
  });

  it.each([
    ['resolvida', 'resolver'],
    ['rejeitada', 'rejeitar'],
  ] as const)('descarta consulta antiga %s depois de uma nova carga', async (_descricao, como) => {
    const antiga = adiado<ResponsavelOpcao[]>();
    const recente = adiado<ResponsavelOpcao[]>();
    const consultas = [antiga, recente];
    let chamada = 0;
    const { campos } = montar(() => (consultas[chamada++] as typeof antiga).promessa);

    const primeira = campos.carregarResponsaveis();
    const segunda = campos.carregarResponsaveis();
    recente.resolver([ana]);
    await segunda;
    if (como === 'resolver')
      antiga.resolver([bia, { ...bia, ativo: true, rotulo: 'carlos@x.test' }]);
    else antiga.rejeitar(new Error('atrasada'));
    await primeira;

    expect(opcoes()).toEqual([PLACEHOLDER, ana.rotulo]);
    expect(el('manager-state').textContent).toBe('');
    expect(el<HTMLButtonElement>('manager-retry').hidden).toBe(true);
    expect(campos.equipeDisponivel()).toBe(true);
  });

  it('cancelarCarga descarta a consulta em andamento', async () => {
    const consulta = adiado<ResponsavelOpcao[]>();
    const { campos } = montar(() => consulta.promessa);
    const carga = campos.carregarResponsaveis();
    campos.cancelarCarga();
    consulta.resolver([ana]);
    await carga;
    expect(opcoes()).toEqual([PLACEHOLDER]);
    expect(campos.equipeDisponivel()).toBe(false);
  });

  it('cancelarCarga invalida a equipe já carregada, como ao encerrar a sessão', async () => {
    const { campos } = montar();
    await campos.carregarResponsaveis();
    expect(campos.equipeDisponivel()).toBe(true);
    campos.cancelarCarga();
    expect(campos.equipeDisponivel()).toBe(false);
  });

  it('equipeIndisponivel mostra a mensagem, esvazia as opções e descarta consulta pendente', async () => {
    const consulta = adiado<ResponsavelOpcao[]>();
    const { campos } = montar(() => consulta.promessa);
    const carga = campos.carregarResponsaveis();

    campos.equipeIndisponivel('Seu acesso não permite listar a equipe.');
    consulta.resolver([ana]);
    await carga;

    expect(el('manager-state').textContent).toBe('Seu acesso não permite listar a equipe.');
    expect(opcoes()).toEqual([PLACEHOLDER]);
    expect(el<HTMLSelectElement>('case-manager').disabled).toBe(true);
    expect(el<HTMLButtonElement>('manager-retry').hidden).toBe(true);
    expect(campos.equipeDisponivel()).toBe(false);
  });

  it('equipeIndisponivel depois de uma falha esconde a nova tentativa e a equipe anterior', async () => {
    const { campos } = montar(async () => {
      throw new Error('falha');
    });
    await campos.carregarResponsaveis();
    expect(el<HTMLButtonElement>('manager-retry').hidden).toBe(false);
    campos.equipeIndisponivel('Sem permissão.');
    expect(el<HTMLButtonElement>('manager-retry').hidden).toBe(true);
    expect(el('manager-state').textContent).toBe('Sem permissão.');
  });
});
