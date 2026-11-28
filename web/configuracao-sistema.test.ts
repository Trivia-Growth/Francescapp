// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { ConfiguracaoSistema } from '../packages/contracts/src/configuracao-sistema.ts';
import { createElement, type ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { TelaConfiguracaoSistema } from './configuracao-sistema.js';

function montarConfiguracaoSistema(
  raiz: HTMLElement,
  servico: ComponentProps<typeof TelaConfiguracaoSistema>['servico'],
  opcoes: { nomeDoUsuario?: ComponentProps<typeof TelaConfiguracaoSistema>['nomeDoUsuario'] } = {},
) {
  return render(
    createElement(TelaConfiguracaoSistema, { servico, nomeDoUsuario: opcoes.nomeDoUsuario }),
    { container: raiz },
  ).unmount;
}

it('permite limpar texto livre como raiz Drive sem inventar obrigatoriedade global', async () => {
  let item: ConfiguracaoSistema = {
    chave: 'ffcm.documentos.drive_pasta_raiz',
    valor: 'pasta-ficticia',
    tipo: 'texto',
    rotulo: 'Pasta raiz do Drive',
    descricao: 'Em branco, envio fica indisponível.',
    exposicao: 'administracao',
    versao: 1,
    opcoes: null,
    atualizado_por_usuario_id: null,
    atualizado_em: '2026-11-18T12:00:00Z',
  };
  const gravar = vi.fn(async (entrada: { valor: ConfiguracaoSistema['valor'] }) => {
    item = { ...item, valor: entrada.valor, versao: 2 };
    return item;
  });
  const raiz = document.createElement('div');
  const desmontar = montarConfiguracaoSistema(raiz, {
    listar: async () => [item],
    gravar,
  });
  try {
    await vi.waitFor(() => expect(raiz.querySelector('input')?.value).toBe('pasta-ficticia'));
    const controle = raiz.querySelector('input');
    if (!controle) throw new Error('Controle não montado');
    controle.value = '   ';
    raiz
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(gravar).toHaveBeenCalledExactlyOnceWith({
        configuracao_chave: 'ffcm.documentos.drive_pasta_raiz',
        valor: '',
        versao_esperada: 1,
      }),
    );
    await vi.waitFor(() => expect(raiz.querySelector('input')?.value).toBe(''));
  } finally {
    desmontar();
  }
});

/* Autorização (25/11/2026, migração para React). A tela não tinha nenhuma prova das duas
 * pontas: ela edita VALOR de chaves já definidas por migration, e mudar um valor aqui não
 * dá nem tira permissão de ninguém. Quem recusa é o servidor, e a tela precisa dizer isso
 * sem afirmar sucesso e sem expor o que não veio. */

const ajuste: ConfiguracaoSistema = {
  chave: 'ffcm.documentos.drive_pasta_raiz',
  valor: 'pasta-ficticia',
  tipo: 'texto',
  rotulo: 'Pasta raiz do Drive',
  descricao: null,
  exposicao: 'administracao',
  versao: 7,
  opcoes: null,
  atualizado_por_usuario_id: null,
  atualizado_em: '2026-11-18T12:00:00Z',
};

it('positivo: quem administra grava o valor sob a versão lida e a lista é relida', async () => {
  const raiz = document.createElement('div');
  const gravar = vi.fn(async () => ({ ...ajuste, valor: 'outra-pasta-ficticia', versao: 8 }));
  const listar = vi.fn(async () => [ajuste]);
  const desmontar = montarConfiguracaoSistema(raiz, { listar, gravar });
  try {
    await vi.waitFor(() => expect(raiz.querySelector('input')?.value).toBe('pasta-ficticia'));
    const controle = raiz.querySelector('input');
    if (!controle) throw new Error('Controle não montado');
    controle.value = 'outra-pasta-ficticia';
    raiz
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(gravar).toHaveBeenCalledExactlyOnceWith({
        configuracao_chave: 'ffcm.documentos.drive_pasta_raiz',
        valor: 'outra-pasta-ficticia',
        versao_esperada: 7,
      }),
    );
    await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
  } finally {
    desmontar();
  }
});

it('negativo: recusa do servidor na gravação não afirma sucesso', async () => {
  const raiz = document.createElement('div');
  const gravar = vi.fn().mockRejectedValue(
    Object.assign(new Error('recusado'), {
      codigo: 'sem_permissao',
    }),
  );
  const listar = vi.fn(async () => [ajuste]);
  const desmontar = montarConfiguracaoSistema(raiz, { listar, gravar });
  try {
    await vi.waitFor(() => expect(raiz.querySelector('input')?.value).toBe('pasta-ficticia'));
    const controle = raiz.querySelector('input');
    if (!controle) throw new Error('Controle não montado');
    controle.value = 'outra-pasta-ficticia';
    raiz
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Sua conta não pode alterar esta configuração.'),
    );
    expect(raiz.textContent).not.toContain('Salvo.');
    // A recusa não vira releitura: a lista continua sendo a mesma que foi autorizada.
    expect(listar).toHaveBeenCalledOnce();
  } finally {
    desmontar();
  }
});

it('negativo: leitura recusada não expõe ajuste nenhum e oferece recuperação', async () => {
  const raiz = document.createElement('div');
  const gravar = vi.fn();
  const listar = vi.fn().mockRejectedValue(new Error('sem acesso'));
  const desmontar = montarConfiguracaoSistema(raiz, { listar, gravar });
  try {
    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Não foi possível carregar os ajustes.'),
    );
    expect(raiz.querySelector('form')).toBeNull();
    expect(raiz.textContent).not.toContain('pasta-ficticia');
    expect(
      [...raiz.querySelectorAll('button')].some((item) => item.textContent === 'Recarregar'),
    ).toBe(true);
    expect(gravar).not.toHaveBeenCalled();
  } finally {
    desmontar();
  }
});
