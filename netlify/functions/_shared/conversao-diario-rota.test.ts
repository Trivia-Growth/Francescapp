import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./configurar-dependencias-nativas.ts', () => ({
  configurarDependenciasNativas: () => ({ pool: {} }),
}));
vi.mock('./configuracao-servidor.ts', () => ({ servicoAtivo: vi.fn(async () => false) }));
vi.mock('./conversao-diario-entrada-nativa.ts', () => ({
  criarEntradaConversaoDiarioNativa: vi.fn(() => ({
    atender: vi.fn(async () => Response.json({ ficticio: true })),
  })),
}));
import conversao from '../conversao-diario-tarefa.ts';
import { servicoAtivo } from './configuracao-servidor.ts';
import { criarEntradaConversaoDiarioNativa } from './conversao-diario-entrada-nativa.ts';
afterEach(() => vi.clearAllMocks());
it('exige cinco flags incluindo a nova false por padrão antes da composição', async () => {
  const resposta = await conversao(new Request('https://example.test'));
  expect(resposta.status).toBe(503);
  expect(servicoAtivo).toHaveBeenCalledTimes(5);
  expect(servicoAtivo).toHaveBeenCalledWith(
    expect.anything(),
    'ffcm.diario.conversao_tarefa_ativa',
    false,
  );
  expect(criarEntradaConversaoDiarioNativa).not.toHaveBeenCalled();
});
it('falha da leitura da flag retorna erro público sem ativar o serviço', async () => {
  vi.mocked(servicoAtivo).mockRejectedValueOnce(new Error('falha fictícia'));
  const resposta = await conversao(new Request('https://example.test'));
  expect((await resposta.json()).erro.codigo).toBe('servico_indisponivel');
  expect(criarEntradaConversaoDiarioNativa).not.toHaveBeenCalled();
});
