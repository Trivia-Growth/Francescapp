import { afterEach, describe, expect, it, vi } from 'vitest';
import * as configuracao from './configurar-pacientes-nativo.ts';
import { criarEntradaPacientesNativa } from './entrada-pacientes-nativa.ts';

afterEach(() => vi.restoreAllMocks());

describe('entrada interna de pacientes', () => {
  it.each([
    ['GET', '/api/pacientes', 'carteira'],
    ['POST', '/api/pacientes', 'cadastro'],
    ['GET', '/api/cadastro/barreira', 'consultar'],
    ['POST', '/api/cadastro/barreira/reservar', 'reservar'],
    ['POST', '/api/cadastro/barreira/encerrar', 'encerrar'],
    ['POST', '/api/cadastro/barreira/reconhecer', 'reconhecer'],
  ])('encaminha %s %s para %s', async (metodo, caminho, rota) => {
    const executar = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const encerrar = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(configuracao, 'configurarPacientesNativo').mockReturnValue({ executar, encerrar });
    const entrada = criarEntradaPacientesNativa({});
    const pedido = new Request(`https://app.example.test${caminho}`, { method: metodo });
    expect((await entrada.atender(pedido)).status).toBe(204);
    expect(executar).toHaveBeenCalledWith(pedido, rota);
    await entrada.encerrar();
    expect(encerrar).toHaveBeenCalledOnce();
  });

  it('falha fechada sem expor configuração ausente', async () => {
    const resposta = await criarEntradaPacientesNativa({}).atender(
      new Request('https://app.example.test/api/pacientes'),
    );
    expect(resposta.status).toBe(503);
    expect(resposta.headers.get('cache-control')).toContain('no-store');
    expect(await resposta.json()).toMatchObject({ erro: { codigo: 'configuracao_indisponivel' } });
  });

  it('rejeita caminho ou método desconhecido sem configurar dependências', async () => {
    const configurar = vi.spyOn(configuracao, 'configurarPacientesNativo');
    const entrada = criarEntradaPacientesNativa({});
    for (const pedido of [
      new Request('https://app.example.test/api/desconhecida'),
      new Request('https://app.example.test/api/pacientes', { method: 'DELETE' }),
    ]) {
      expect((await entrada.atender(pedido)).status).toBe(404);
    }
    expect(configurar).not.toHaveBeenCalled();
  });
});
