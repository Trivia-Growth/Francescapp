import { expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { operarTarefaCuidadoNativo } from './tarefa-cuidado-nativo.ts';

const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
const paciente_id = 'c0000000-0000-4000-8000-000000000003';
it.each([false, true])(
  'autorização somente é atestada e nunca decifra registros inesperados: %s',
  async (retornaRegistro) => {
    const decifrar = vi.fn();
    const executar = vi.fn(
      async (
        _request: Request,
        transporte: {
          p_transporte: { entrada: Record<string, unknown>; entrada_canonica: string };
        },
      ) => {
        expect(transporte.p_transporte.entrada.autorizacao_somente).toBe(true);
        expect(JSON.parse(transporte.p_transporte.entrada_canonica).autorizacao_somente).toBe(true);
        return {
          ok: true,
          request_id: transporte.p_transporte.entrada.request_id,
          dados: retornaRegistro
            ? [
                {
                  tarefa_id: 'd0000000-0000-4000-8000-000000000004',
                  registro_id: 'e0000000-0000-4000-8000-000000000005',
                  paciente_id,
                  versao: 1,
                  conteudo: {
                    formato: 1,
                    key_id: 'teste',
                    nonce: 'a'.repeat(16),
                    ciphertext: 'YQ',
                    tag: 'a'.repeat(22),
                  },
                },
              ]
            : [],
        };
      },
    );
    const request = new Request('https://exemplo.test/', { headers: { 'x-sessao': session_id } });
    const resultado = await operarTarefaCuidadoNativo(
      request,
      { operacao: 'ler', paciente_id, autorizacao_somente: true },
      {
        autorizar: async () => ({ estado: 'autorizado', identidade: { usuario_id, session_id } }),
        revalidar: async () => ({ estado: 'autorizado', identidade: { usuario_id, session_id } }),
        atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
        cifra: { cifrar: vi.fn(), decifrar },
        idempotencia: { calcularDigestIdempotencia: vi.fn() },
        metadados: (request_id) => ({
          key_id: 'teste',
          request_id,
          emitido_em: '2026-11-04T12:00:00Z',
          expira_em: '2026-11-04T12:00:30Z',
        }),
        executar,
      },
    );
    expect(resultado.ok).toBe(!retornaRegistro);
    expect(decifrar).not.toHaveBeenCalled();
    expect(executar).toHaveBeenCalledTimes(1);
  },
);
