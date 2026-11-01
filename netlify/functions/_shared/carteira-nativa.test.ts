import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { prepararCarteiraNativa } from './carteira-nativa.ts';

const identidade = {
  usuario_id: 'a0000000-0000-4000-8000-000000000001',
  session_id: 'b0000000-0000-4000-8000-000000000002',
};
const metadados = {
  key_id: 'teste',
  request_id: 'c0000000-0000-4000-8000-000000000003',
  emitido_em: '2026-10-29T12:00:00Z',
  expira_em: '2026-10-29T12:01:00Z',
};
const atestador = criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) });
const pedido = (caminho: string, session = identidade.session_id) =>
  new Request(`https://exemplo.test${caminho}`, { headers: { 'x-sessao': session } });

describe('preparação nativa da carteira', () => {
  it('assina consulta e abre cursor vinculado à identidade autorizada', async () => {
    const abrirCursor = vi.fn(async () => 'cursor-interno');
    const resultado = await prepararCarteiraNativa(
      pedido('/api/pacientes?limite=10&cursor=externo'),
      identidade,
      { metadados, atestador, abrirCursor },
    );
    expect(abrirCursor).toHaveBeenCalledWith('externo', {
      usuarioId: identidade.usuario_id,
      sessaoId: identidade.session_id,
    });
    expect(resultado.p_entrada.entrada).toMatchObject({
      limite: 10,
      cursor: 'cursor-interno',
      request_id: metadados.request_id,
      atestado: {
        usuario_id: identidade.usuario_id,
        session_id: identidade.session_id,
        operacao: 'api.listar_pacientes',
      },
    });
  });
  it.each([
    '/api/pacientes?limite=0',
    '/api/pacientes?limite=1&limite=2',
    '/api/pacientes?usuario_id=outro',
    '/api/outro',
  ])('recusa entrada inválida antes de assinar: %s', async (caminho) => {
    const abrirCursor = vi.fn();
    const assinar = vi.fn(atestador.atestarEntrada);
    await expect(
      prepararCarteiraNativa(pedido(caminho), identidade, {
        metadados,
        atestador: { atestarEntrada: assinar },
        abrirCursor,
      }),
    ).rejects.toThrow('Não foi possível preparar a carteira.');
    expect(assinar).not.toHaveBeenCalled();
  });
  it('recusa sessão divergente e falha de cursor sem assinar', async () => {
    const abrirCursor = vi.fn(async () => {
      throw new Error('segredo');
    });
    const assinar = vi.fn(atestador.atestarEntrada);
    const dependencias = { metadados, atestador: { atestarEntrada: assinar }, abrirCursor };
    await expect(
      prepararCarteiraNativa(
        pedido('/api/pacientes', 'd0000000-0000-4000-8000-000000000004'),
        identidade,
        dependencias,
      ),
    ).rejects.toThrow('Não foi possível preparar a carteira.');
    await expect(
      prepararCarteiraNativa(pedido('/api/pacientes?cursor=externo'), identidade, dependencias),
    ).rejects.toThrow(/^Não foi possível preparar a carteira\.$/);
    expect(assinar).not.toHaveBeenCalled();
  });
});
