// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { TelaModeloFichaPlantao } from './modelo-ficha-plantao-administracao.js';
import { TelaPapelDeclarado } from './papel-declarado-administracao.js';
import { ClienteFFCM, FalhaApi } from './api.ts';
import { clienteConsultas, esquecerConsultas } from './consultas.js';

/* Fatia 9 do plano visual (28/11/2026): os catálogos restantes passam ao cache de leituras
 * de `web/consultas.ts`, com a política do piloto (Estado emocional, provado em
 * `estado-emocional-administracao.test.ts`). Cada família prova por si a mesma barreira:
 * a volta não relê, e nenhuma leitura sobrevive à identidade que a fez — revogação, recusa
 * na própria tela, troca de conta e resposta atrasada da conta anterior. */

const contaA = {
  usuario_id: 'a0000000-0000-4000-8000-00000000000a',
  session_id: 'a1000000-0000-4000-8000-00000000000a',
};
const contaB = {
  usuario_id: 'b0000000-0000-4000-8000-00000000000b',
  session_id: 'b1000000-0000-4000-8000-00000000000b',
};
type Identidade = typeof contaA;

const papel = (nome: string) => ({
  papel_id: 'b0000000-0000-4000-8000-000000000001',
  nome,
  ativo: true,
  de_fabrica: false,
  versao: 1,
});
const campo = (nome: string) => ({
  campo_id: 'd0000000-0000-4000-8000-000000000001',
  escopo: 'ficha_plantao' as const,
  nome,
  tipo: 'texto_longo' as const,
  opcoes: null,
  ativo: true,
  ordem: 3,
  obrigatorio: false,
  de_fabrica: false,
  visibilidade: 'interna' as const,
  versao: 4,
});

type Servico = {
  identidade: Identidade;
  consultar: ReturnType<typeof vi.fn>;
  gravar: ReturnType<typeof vi.fn>;
};

const familias = [
  {
    nome: 'Papéis declarados',
    recurso: 'papel-declarado',
    atualizar: 'Atualizar catálogo de papéis',
    item: (nome: string) => [papel(nome)],
    montar: (raiz: HTMLElement, servico: Servico, perdido = vi.fn()) =>
      render(createElement(TelaPapelDeclarado, { servico, acessoPerdido: perdido }), {
        container: raiz,
      }).unmount,
  },
  {
    nome: 'Modelo da ficha de plantão',
    recurso: 'modelo-ficha-plantao',
    atualizar: 'Atualizar modelo',
    item: (nome: string) => [campo(nome)],
    montar: (raiz: HTMLElement, servico: Servico, perdido = vi.fn()) =>
      render(createElement(TelaModeloFichaPlantao, { servico, acessoPerdido: perdido }), {
        container: raiz,
      }).unmount,
  },
];

function adiada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}

const chaves = () =>
  clienteConsultas
    .getQueryCache()
    .getAll()
    .map((consulta) => consulta.queryKey);

beforeEach(() => esquecerConsultas());

describe.each(familias)('$nome', (familia) => {
  const servicoDe = (identidade: Identidade, consultar: ReturnType<typeof vi.fn>): Servico => ({
    identidade,
    consultar,
    gravar: vi.fn().mockResolvedValue(undefined),
  });
  const chaveDe = (conta: Identidade) => [
    'sessao',
    conta.usuario_id,
    conta.session_id,
    'admin',
    familia.recurso,
  ];

  it('cinco voltas fazem um GET só, com a lista no primeiro quadro', async () => {
    const servico = servicoDe(contaA, vi.fn().mockResolvedValue(familia.item('item fictício')));
    for (let volta = 0; volta < 5; volta += 1) {
      const raiz = document.createElement('div');
      const desmontar = familia.montar(raiz, servico);
      if (volta === 0) await vi.waitFor(() => expect(raiz.textContent).toContain('item fictício'));
      else expect(raiz.textContent).toContain('item fictício');
      desmontar();
    }
    expect(servico.consultar).toHaveBeenCalledOnce();
  });

  it('revogação: a sessão esquecida pela API zera o cache e a volta relê', async () => {
    const servico = servicoDe(contaA, vi.fn().mockResolvedValue(familia.item('item fictício')));
    const raiz = document.createElement('div');
    familia.montar(raiz, servico)();
    await vi.waitFor(() => expect(clienteConsultas.getQueryData(chaveDe(contaA))).toBeDefined());
    new ClienteFFCM().limpar();
    expect(chaves()).toHaveLength(0);
    const volta = document.createElement('div');
    const desmontar = familia.montar(volta, servico);
    expect(volta.textContent).not.toContain('item fictício');
    await vi.waitFor(() => expect(servico.consultar).toHaveBeenCalledTimes(2));
    desmontar();
  });

  it('negativo: 403 ao atualizar esvazia a tela e descarta a leitura guardada', async () => {
    const consultar = vi
      .fn()
      .mockResolvedValueOnce(familia.item('item fictício'))
      .mockRejectedValueOnce(new FalhaApi('sem_permissao', 403));
    const servico = servicoDe(contaA, consultar);
    const raiz = document.createElement('div');
    const perdido = vi.fn();
    familia.montar(raiz, servico, perdido);
    await vi.waitFor(() => expect(raiz.textContent).toContain('item fictício'));
    const atualizar = [...raiz.querySelectorAll('button')].find(
      (botao) => botao.textContent === familia.atualizar,
    );
    atualizar?.click();
    await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
    expect(raiz.textContent).toBe('');
    expect(chaves()).toHaveLength(0);
    const volta = document.createElement('div');
    familia.montar(volta, servico);
    expect(volta.textContent).not.toContain('item fictício');
  });

  it('troca de conta: a conta nova não encontra nada da anterior', async () => {
    const servicoA = servicoDe(contaA, vi.fn().mockResolvedValue(familia.item('da conta A')));
    familia.montar(document.createElement('div'), servicoA)();
    await vi.waitFor(() => expect(clienteConsultas.getQueryData(chaveDe(contaA))).toBeDefined());

    const servicoB = servicoDe(contaB, vi.fn().mockResolvedValue(familia.item('da conta B')));
    const raiz = document.createElement('div');
    const desmontar = familia.montar(raiz, servicoB);
    expect(chaves()).toEqual([chaveDe(contaB)]);
    expect(raiz.textContent).not.toContain('da conta A');
    await vi.waitFor(() => expect(raiz.textContent).toContain('da conta B'));
    desmontar();
  });

  it('resposta atrasada da conta anterior é descartada', async () => {
    const atrasada = adiada<unknown>();
    const servicoA = servicoDe(contaA, vi.fn().mockReturnValue(atrasada.promessa));
    familia.montar(document.createElement('div'), servicoA)();

    const servicoB = servicoDe(contaB, vi.fn().mockResolvedValue(familia.item('da conta B')));
    const raiz = document.createElement('div');
    const desmontar = familia.montar(raiz, servicoB);
    await vi.waitFor(() => expect(raiz.textContent).toContain('da conta B'));

    atrasada.resolver(familia.item('da conta A'));
    await new Promise((r) => setTimeout(r, 0));
    expect(raiz.textContent).not.toContain('da conta A');
    expect(chaves()).toEqual([chaveDe(contaB)]);
    desmontar();

    const volta = document.createElement('div');
    const desmontarVolta = familia.montar(volta, servicoB);
    expect(volta.textContent).toContain('da conta B');
    expect(volta.textContent).not.toContain('da conta A');
    desmontarVolta();
  });
});
