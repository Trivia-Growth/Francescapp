import { describe, expect, it, vi } from 'vitest';
import { ClienteFFCM } from './api.ts';
import { criarEquipePorSessao } from './catalogo-equipe.js';

/* Fatia 9b (28/11/2026): o catálogo da equipe era guardado por usuário e sobrevivia à saída.
 * A mesma conta numa sessão nova não pode reaproveitar a lista da anterior, a saída apaga
 * catálogo e nomes, e a resposta atrasada de uma identidade anterior não grava nomes. */

const sessaoA1 = {
  usuario_id: 'a0000000-0000-4000-8000-00000000000a',
  session_id: 'a1000000-0000-4000-8000-00000000000a',
};
const sessaoA2 = { ...sessaoA1, session_id: 'a2000000-0000-4000-8000-00000000000a' };
const contaB = {
  usuario_id: 'b0000000-0000-4000-8000-00000000000b',
  session_id: 'b1000000-0000-4000-8000-00000000000b',
};

const pagina = (email: string, usuario_id: string) => ({
  itens: [
    {
      id: usuario_id,
      email,
      perfil: 'profissional',
      estado: 'vinculada',
      ativo: true,
      usuario_id,
    },
  ],
  proximo_cursor: null,
});

function adiada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}

describe('catálogo da equipe por sessão', () => {
  it('a mesma sessão reaproveita a consulta', async () => {
    const listar = vi.fn().mockResolvedValue(pagina('ana@ficticio.test', sessaoA1.usuario_id));
    const equipe = criarEquipePorSessao(listar);
    await equipe.para(sessaoA1)();
    await equipe.para(sessaoA1)();
    expect(listar).toHaveBeenCalledOnce();
  });

  it('a mesma conta numa sessão nova consulta de novo', async () => {
    const listar = vi.fn().mockResolvedValue(pagina('ana@ficticio.test', sessaoA1.usuario_id));
    const equipe = criarEquipePorSessao(listar);
    const daSessao1 = equipe.para(sessaoA1);
    await daSessao1();
    const daSessao2 = equipe.para(sessaoA2);
    expect(daSessao2).not.toBe(daSessao1);
    await daSessao2();
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('troca de conta: a conta nova não vê os nomes da anterior', async () => {
    const listar = vi
      .fn()
      .mockResolvedValueOnce(pagina('ana@ficticio.test', 'c0000000-0000-4000-8000-00000000000a'))
      .mockResolvedValueOnce(pagina('bia@ficticio.test', 'c0000000-0000-4000-8000-00000000000b'));
    const equipe = criarEquipePorSessao(listar);
    equipe.carregarNomes(sessaoA1);
    await vi.waitFor(() =>
      expect(equipe.nome('c0000000-0000-4000-8000-00000000000a')).toBeDefined(),
    );
    equipe.carregarNomes(contaB);
    expect(equipe.nome('c0000000-0000-4000-8000-00000000000a')).toBeUndefined();
    await vi.waitFor(() =>
      expect(equipe.nome('c0000000-0000-4000-8000-00000000000b')).toBeDefined(),
    );
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('saída: a sessão esquecida pela API apaga catálogo e nomes', async () => {
    const listar = vi
      .fn()
      .mockResolvedValue(pagina('ana@ficticio.test', 'c0000000-0000-4000-8000-00000000000a'));
    const equipe = criarEquipePorSessao(listar);
    equipe.carregarNomes(sessaoA1);
    await vi.waitFor(() =>
      expect(equipe.nome('c0000000-0000-4000-8000-00000000000a')).toBeDefined(),
    );
    // Revogação, novo acesso e o fim de `sair` passam por aqui.
    new ClienteFFCM().limpar();
    expect(equipe.nome('c0000000-0000-4000-8000-00000000000a')).toBeUndefined();
    await equipe.para(sessaoA1)();
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('resposta atrasada da identidade anterior não grava nomes', async () => {
    const atrasada = adiada<ReturnType<typeof pagina>>();
    const listar = vi
      .fn()
      .mockReturnValueOnce(atrasada.promessa)
      .mockResolvedValueOnce(pagina('bia@ficticio.test', 'c0000000-0000-4000-8000-00000000000b'));
    const equipe = criarEquipePorSessao(listar);
    equipe.carregarNomes(sessaoA1);
    equipe.carregarNomes(contaB);
    await vi.waitFor(() =>
      expect(equipe.nome('c0000000-0000-4000-8000-00000000000b')).toBeDefined(),
    );
    atrasada.resolver(pagina('ana@ficticio.test', 'c0000000-0000-4000-8000-00000000000a'));
    await new Promise((r) => setTimeout(r, 0));
    expect(equipe.nome('c0000000-0000-4000-8000-00000000000a')).toBeUndefined();
    expect(equipe.nome('c0000000-0000-4000-8000-00000000000b')).toBeDefined();
  });
});
