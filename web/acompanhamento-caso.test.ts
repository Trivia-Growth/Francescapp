import { expect, it, vi } from 'vitest';
import { criarCatalogoResponsaveis, descreverResponsavel } from './acompanhamento-caso.js';

const item = (usuario: string | null, parcial: Record<string, unknown> = {}) => ({
  perfil: 'profissional' as const,
  estado: 'vinculada',
  usuario_id: usuario,
  email: `${usuario ?? 'sem-usuario'}@exemplo.test`,
  ativo: true as boolean | null,
  ...parcial,
});

it('percorre as páginas, mantém só concessão vinculada com usuário e marca quem está inativo', async () => {
  const listar = vi
    .fn()
    .mockResolvedValueOnce({
      itens: [item('a'), item(null), item('b', { estado: 'pendente' })],
      proximo_cursor: 'p2',
    })
    .mockResolvedValueOnce({
      itens: [item('c', { ativo: false }), item('d', { perfil: 'administrador', ativo: null })],
      proximo_cursor: null,
    });
  const opcoes = await criarCatalogoResponsaveis(listar)();
  expect(listar.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, 'p2']);
  expect(opcoes).toEqual([
    { usuario_id: 'a', ativo: true, rotulo: 'A · Profissional' },
    { usuario_id: 'c', ativo: false, rotulo: 'C · Profissional' },
    { usuario_id: 'd', ativo: true, rotulo: 'D · Administrador' },
  ]);
});

it('reaproveita a lista carregada, mas tenta de novo depois de uma falha', async () => {
  const listar = vi
    .fn()
    .mockRejectedValueOnce(new Error())
    .mockResolvedValue({ itens: [item('a')], proximo_cursor: null });
  const catalogo = criarCatalogoResponsaveis(listar);
  await expect(catalogo()).rejects.toThrow();
  await Promise.resolve();
  expect(await catalogo()).toHaveLength(1);
  expect(await catalogo()).toHaveLength(1);
  expect(listar).toHaveBeenCalledTimes(2);
});

it('recusa equipe que não termina de paginar em vez de mostrar lista parcial', async () => {
  const listar = vi.fn().mockResolvedValue({ itens: [item('a')], proximo_cursor: 'sempre' });
  await expect(criarCatalogoResponsaveis(listar)()).rejects.toThrow('Equipe longa demais');
  expect(listar).toHaveBeenCalledTimes(10);
});

it('descreve o responsável sem afirmar atividade que o servidor não confirmou', () => {
  const opcoes = [{ usuario_id: 'a', ativo: true, rotulo: 'a@exemplo.test (Profissional)' }];
  expect(descreverResponsavel({ responsavel_id: null, responsavel_ativo: null }, opcoes)).toBe(
    'a completar',
  );
  expect(descreverResponsavel({ responsavel_id: 'a', responsavel_ativo: true }, opcoes)).toBe(
    'a@exemplo.test (Profissional)',
  );
  expect(descreverResponsavel({ responsavel_id: 'a', responsavel_ativo: false }, opcoes)).toBe(
    'a@exemplo.test (Profissional) (inativo: indique um novo responsável)',
  );
  expect(descreverResponsavel({ responsavel_id: 'x', responsavel_ativo: true }, opcoes)).toBe(
    'Responsável indicado',
  );
});
