import { expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { operarBarreiraPlanoNativa } from './barreira-plano-operacao.ts';

it('assina reserva, confere resposta e bloqueia divulgação após revogação', async () => {
  const identidade = {
    usuario_id: 'a0000000-0000-4000-8000-000000000001',
    session_id: 'b0000000-0000-4000-8000-000000000002',
  };
  const request = new Request('https://exemplo.test', {
    headers: { 'x-sessao': identidade.session_id },
  });
  const entrada = {
    operacao: 'api.reservar_plano',
    epoca: 1,
    reserva_id: 'c0000000-0000-4000-8000-000000000003',
    paciente_id: 'd0000000-0000-4000-8000-000000000004',
  };
  const executar = vi.fn(async (transporte) => {
    expect(JSON.parse(transporte.p_transporte.entrada_canonica)).toMatchObject(entrada);
    expect(transporte.p_transporte.entrada.atestado).toMatchObject({
      ...identidade,
      operacao: entrada.operacao,
    });
    return {
      ok: true,
      dados: { estado: 'aberta' },
      request_id: transporte.p_transporte.entrada.request_id,
    };
  });
  const portas = {
    autorizar: async () => ({ estado: 'autorizado' as const, identidade }),
    revalidar: async () => ({ estado: 'autorizado' as const, identidade }),
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-10-29T12:00:00Z',
      expira_em: '2026-10-29T12:00:30Z',
    }),
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    executar,
  };
  expect(await operarBarreiraPlanoNativa(request, entrada, portas)).toMatchObject({
    ok: true,
    dados: { estado: 'aberta' },
  });
  expect(
    await operarBarreiraPlanoNativa(request, entrada, {
      ...portas,
      revalidar: async () => ({ estado: 'nao_autenticado' as const }),
    }),
  ).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
  expect(
    await operarBarreiraPlanoNativa(
      request,
      { ...entrada, usuario_id: identidade.usuario_id },
      portas,
    ),
  ).toMatchObject({ ok: false });
  expect(executar).toHaveBeenCalledTimes(2);
});
