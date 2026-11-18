// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { ConfiguracaoSistema } from '../packages/contracts/src/configuracao-sistema.ts';
import { montarConfiguracaoSistema } from './configuracao-sistema.ts';

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
