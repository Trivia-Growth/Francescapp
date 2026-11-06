import { expect, it } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { processarBarreiraAcessoNativa } from './barreira-acesso-handler-nativo.ts';

it('assina reserva de acesso e preserva paciente e época no transporte', async () => {
  const id = 'a0000000-0000-4000-8000-000000000001';
  const identidade = { usuario_id: id, session_id: id };
  const request = new Request('https://example.test/api/acessos/barreira/reservar', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://example.test', 'x-sessao': id },
    body: JSON.stringify({ epoca: 1, reserva_id: id, paciente_id: id }),
  });
  const atestador = criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(4) });
  const resultado = await processarBarreiraAcessoNativa(request, 'reservar', {
    autorizar: async () => ({ estado: 'autorizado', identidade }),
    revalidar: async () => ({ estado: 'autorizado', identidade }),
    validarOrigem: async () => true,
    metadados: (requestId) => ({
      key_id: 'teste',
      emitido_em: '2026-11-06T12:00:00Z',
      expira_em: '2026-11-06T12:00:30Z',
      request_id: requestId,
    }),
    atestador,
    executar: async (_request, transporte) => {
      const e = transporte.p_transporte.entrada;
      expect(e).toMatchObject({
        operacao: 'api.reservar_concessao_acesso_profissional',
        paciente_id: id,
        reserva_id: id,
        epoca: 1,
      });
      return { ok: true, dados: { estado: 'aberta' }, request_id: e.request_id };
    },
  });
  expect(resultado.status).toBe(200);
  expect((await resultado.json()).dados.estado).toBe('aberta');
});
