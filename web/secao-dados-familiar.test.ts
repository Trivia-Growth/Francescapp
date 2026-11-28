// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { montarCascaParaTeste } from './teste-casca.js';
import { type ClienteFFCM, FalhaApi } from './api.ts';
import { TelaDadosFamiliar } from './secao-dados-familiar.tsx';

function montarDadosFamiliar(
  raiz: HTMLElement,
  pacienteId: ComponentProps<typeof TelaDadosFamiliar>['pacienteId'],
  servico: ComponentProps<typeof TelaDadosFamiliar>['servico'],
  acessoPerdido: ComponentProps<typeof TelaDadosFamiliar>['acessoPerdido'],
) {
  const painel = render(createElement(TelaDadosFamiliar, { pacienteId, servico, acessoPerdido }), {
    container: raiz,
  });
  return () => painel.rerender(null);
}

/** Dados fictícios. */
const caso = '10000000-0000-4000-8000-00000000000a';
const outroCaso = '10000000-0000-4000-8000-00000000000b';
const sessionId = '20000000-0000-4000-8000-000000000001';
const usuarioId = '30000000-0000-4000-8000-000000000001';

type ServicoFamiliar = Pick<ClienteFFCM, 'consultarPacienteFamiliar'>;
type PacienteFamiliar = Awaited<ReturnType<ClienteFFCM['consultarPacienteFamiliar']>>;

const paciente = (parcial: Partial<PacienteFamiliar> = {}): PacienteFamiliar =>
  ({
    id: caso,
    nome: 'Paciente Fictício',
    nome_preferencia: 'Fictício',
    ...parcial,
  }) as PacienteFamiliar;

function servicoFalso(consultar: ServicoFamiliar['consultarPacienteFamiliar']): ServicoFamiliar {
  return { consultarPacienteFamiliar: consultar };
}

/** `acessoPerdido` devolve `true` quando a recusa já foi tratada fora da seção — é o mesmo
 * contrato de `main.ts`, onde a ficha é fechada e a pessoa recebe o aviso da área. */
const tratouRecusa = (erro: unknown) =>
  erro instanceof FalhaApi && (erro.status === 401 || erro.status === 403);

describe('dados do paciente vistos pela conta de família', () => {
  it('familiar vinculado vê os dados do paciente do próprio vínculo', async () => {
    const raiz = document.createElement('div');
    const consultar = vi.fn(async () => paciente());
    montarDadosFamiliar(raiz, caso, servicoFalso(consultar), () => false);

    await vi.waitFor(() => expect(raiz.querySelectorAll('dd')).toHaveLength(2));
    expect(consultar).toHaveBeenCalledWith(caso);
    expect(raiz.textContent).toContain('Paciente Fictício');
    expect(raiz.textContent).toContain('Fictício');
    expect(raiz.querySelector('p[role="status"]')?.textContent).toBe('');
    expect(raiz.querySelector<HTMLButtonElement>('button')?.hidden).toBe(true);
  });

  it('recusa de permissão não mostra dado nenhum nem oferece nova tentativa', async () => {
    const raiz = document.createElement('div');
    const recusa = new FalhaApi('sem_permissao', 403);
    const acessoPerdido = vi.fn(tratouRecusa);
    montarDadosFamiliar(raiz, caso, servicoFalso(vi.fn().mockRejectedValue(recusa)), acessoPerdido);

    await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledWith(recusa));
    expect(raiz.querySelectorAll('dd')).toHaveLength(0);
    expect(raiz.textContent).not.toContain('Paciente Fictício');
    // A recusa foi tratada fora: aqui não fica botão de repetir nem estado de erro mudo.
    expect(raiz.querySelector<HTMLButtonElement>('button')?.hidden).toBe(true);
    expect(raiz.querySelector('p[role="status"]')?.textContent).toBe('Consultando paciente…');
  });

  it('paciente de outro vínculo é recusado pela própria seção, sem ser exibido', async () => {
    const raiz = document.createElement('div');
    const acessoPerdido = vi.fn(tratouRecusa);
    montarDadosFamiliar(
      raiz,
      caso,
      servicoFalso(vi.fn(async () => paciente({ id: outroCaso, nome: 'Outro Paciente' }))),
      acessoPerdido,
    );

    await vi.waitFor(() =>
      expect(raiz.querySelector('p[role="status"]')?.dataset.tone).toBe('error'),
    );
    expect(raiz.querySelectorAll('dd')).toHaveLength(0);
    expect(raiz.textContent).not.toContain('Outro Paciente');
    expect(raiz.textContent).toContain('Tente novamente');
    expect(acessoPerdido).toHaveBeenCalledTimes(1);
  });

  it('revogação entre consultas limpa o que já estava na tela', async () => {
    const raiz = document.createElement('div');
    const recusa = new FalhaApi('sem_permissao', 403);
    const consultar = vi
      .fn<ServicoFamiliar['consultarPacienteFamiliar']>()
      .mockResolvedValueOnce(paciente())
      .mockRejectedValue(recusa);
    const acessoPerdido = vi.fn(tratouRecusa);
    montarDadosFamiliar(raiz, caso, servicoFalso(consultar), acessoPerdido);

    await vi.waitFor(() => expect(raiz.textContent).toContain('Paciente Fictício'));
    // A revogação acontece entre a primeira leitura e a repetição pedida pela pessoa.
    const tentar = raiz.querySelector<HTMLButtonElement>('button');
    if (!tentar) throw new Error('Botão de nova tentativa ausente');
    tentar.hidden = false;
    tentar.click();

    await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledWith(recusa));
    expect(raiz.querySelectorAll('dd')).toHaveLength(0);
    expect(raiz.textContent).not.toContain('Paciente Fictício');
  });

  it('falha passageira diz o que houve e oferece nova tentativa que funciona', async () => {
    const raiz = document.createElement('div');
    const consultar = vi
      .fn<ServicoFamiliar['consultarPacienteFamiliar']>()
      .mockRejectedValueOnce(new FalhaApi('servico_indisponivel'))
      .mockResolvedValue(paciente());
    const acessoPerdido = vi.fn(tratouRecusa);
    montarDadosFamiliar(raiz, caso, servicoFalso(consultar), acessoPerdido);

    await vi.waitFor(() => expect(raiz.textContent).toContain('Tente novamente'));
    expect(acessoPerdido).toHaveBeenCalledTimes(1);
    expect(acessoPerdido).toHaveReturnedWith(false);
    expect(raiz.querySelectorAll('dd')).toHaveLength(0);

    raiz.querySelector<HTMLButtonElement>('button')?.click();
    await vi.waitFor(() => expect(raiz.textContent).toContain('Paciente Fictício'));
    expect(raiz.querySelector<HTMLButtonElement>('button')?.hidden).toBe(true);
  });

  it('desmontar apaga os dados da tela e descarta resposta em voo', async () => {
    const raiz = document.createElement('div');
    let responder: (valor: PacienteFamiliar) => void = () => {};
    const consultar = vi.fn(
      () =>
        new Promise<PacienteFamiliar>((resolve) => {
          responder = resolve;
        }),
    );
    const desmontar = montarDadosFamiliar(
      raiz,
      caso,
      servicoFalso(consultar as ServicoFamiliar['consultarPacienteFamiliar']),
      () => false,
    );
    desmontar();
    responder(paciente());
    await Promise.resolve();
    expect(raiz.textContent).toBe('');
  });
});

describe('quem alcança a seção de dados da família', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
    window.history.replaceState(null, '', '/');
  });

  /** A conta de família só enxerga as seções do recorte familiar. A autorização real continua
   * no servidor e no banco (`/api/familiar/*` recusa o resto); aqui provamos que a interface
   * não apresenta nem consulta a ficha completa por essa conta. */
  it('a família vê os dados do paciente vinculado e nenhuma seção de equipe', async () => {
    document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
    sessionStorage.setItem('modo-acesso', 'familiar');
    sessionStorage.setItem('fluxo-familiar', 'AAAAAAAAAAAAAAAAAAAAAA');
    sessionStorage.setItem('sessao-familiar', sessionId);
    const caminhos: string[] = [];
    vi.stubGlobal('fetch', async (entrada: URL | string) => {
      const caminho = new URL(String(entrada), 'http://localhost').pathname;
      caminhos.push(caminho);
      if (caminho === '/api/familiar/sessao')
        return Response.json({
          dados: {
            session_id: sessionId,
            usuario: { id: usuarioId, perfil: 'familia', ativo: true, versao: 1 },
            capacidades: [],
          },
          request_id: caso,
        });
      if (caminho === '/api/familiar/pacientes')
        return Response.json({
          dados: {
            itens: [{ id: caso, nome: 'Paciente Fictício', nome_preferencia: null, versao: 1 }],
            proximo_cursor: null,
          },
          request_id: caso,
        });
      if (caminho === `/api/familiar/pacientes/${caso}`)
        return Response.json({
          dados: { id: caso, nome: 'Paciente Fictício', nome_preferencia: null, versao: 1 },
          request_id: caso,
        });
      throw new Error(`Rota inesperada: ${caminho}`);
    });
    window.history.replaceState(null, '', `/#paciente/${caso}/dados`);
    await montarCascaParaTeste();

    await vi.waitFor(() =>
      expect(document.getElementById('ficha-painel')?.textContent).toContain('Paciente Fictício'),
    );
    const abas = [...document.querySelectorAll('[role="tab"]')].map((aba) => aba.textContent);
    expect(abas).toContain('Dados do paciente');
    expect(abas).not.toContain('Visão do caso');
    expect(abas).not.toContain('Cadastro');
    expect(abas).not.toContain('Acesso da família');
    expect(abas).not.toContain('Equipe com acesso');
    // Nenhuma rota da equipe foi tocada por uma conta de família.
    expect(caminhos.every((caminho) => !caminho.startsWith('/api/admin/'))).toBe(true);
    expect(caminhos).not.toContain(`/api/pacientes/${caso}`);
  });
});
