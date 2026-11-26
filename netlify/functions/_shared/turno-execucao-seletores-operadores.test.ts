import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { operarDiarioNativo } from './diario-nativo.ts';
import { operarTarefaCuidadoNativo } from './tarefa-cuidado-nativo.ts';

const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
const paciente_id = 'c0000000-0000-4000-8000-000000000003';
const registro_id_exportacao = 'd0000000-0000-4000-8000-000000000004';
const versao_exportacao = 2;
const operadores = [
  { nome: 'Diário', operar: operarDiarioNativo, acao: 'api.ler_diario' },
  { nome: 'Tarefa', operar: operarTarefaCuidadoNativo, acao: 'api.ler_tarefas_cuidado' },
] as const;
function fixture() {
  const atestador = criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) });
  const executar = vi.fn(
    async (
      _request: Request,
      transporte: {
        p_transporte: {
          entrada: Record<string, unknown>;
          entrada_canonica: string;
          dados_canonicos: string;
        };
      },
    ) => ({
      ok: false,
      erro: { codigo: 'sem_permissao' },
      request_id: transporte.p_transporte.entrada.request_id,
    }),
  );
  const autorizar = vi.fn(async () => ({
    estado: 'autorizado' as const,
    identidade: { usuario_id, session_id },
  }));
  const portas = {
    autorizar,
    revalidar: autorizar,
    atestador,
    cifra: { cifrar: vi.fn(), decifrar: vi.fn() },
    idempotencia: { calcularDigestIdempotencia: vi.fn() },
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-11-19T12:00:00Z',
      expira_em: '2026-11-19T12:00:30Z',
    }),
    executar,
  };
  const request = new Request('https://exemplo.test/', { headers: { 'x-sessao': session_id } });
  return { portas, request, executar };
}
// These invoke the real READ operators: placing the seam in a write preparer cannot pass.
// SQL authorization is intentionally denied; this test proves transport/MAC placement only.
describe.each(operadores)(
  '$nome: alvo histórico no comando de leitura assinado',
  ({ operar, acao }) => {
    it('envia o par exato no corpo canônico antes de atestar, sem acionar preparador de escrita', async () => {
      const { portas, request, executar } = fixture();
      const resultado = await operar(
        request,
        { operacao: 'ler', paciente_id, registro_id_exportacao, versao_exportacao },
        portas,
      );
      expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
      expect(executar).toHaveBeenCalledTimes(1);
      const transporte = executar.mock.calls[0]?.[1].p_transporte;
      expect(transporte).toBeDefined();
      if (!transporte) throw new Error('Operador não chamou a fronteira SQL.');
      const alvo = { paciente_id, registro_id_exportacao, versao_exportacao };
      expect(transporte.entrada).toMatchObject(alvo);
      expect(JSON.parse(transporte.entrada_canonica)).toMatchObject(alvo);
      expect(JSON.parse(transporte.dados_canonicos)).toMatchObject({
        usuario_id,
        session_id,
        operacao: acao,
      });
      expect(portas.cifra.cifrar).not.toHaveBeenCalled();
      expect(portas.cifra.decifrar).not.toHaveBeenCalled();
      expect(portas.idempotencia.calcularDigestIdempotencia).not.toHaveBeenCalled();
    });
    it.each([{ registro_id_exportacao }, { versao_exportacao }])(
      'par incompleto não chega ao executor SQL: %j',
      async (seletor) => {
        const { portas, request, executar } = fixture();
        const resultado = await operar(
          request,
          { operacao: 'ler', paciente_id, ...seletor },
          portas,
        );
        expect(resultado.ok).toBe(false);
        expect(executar).not.toHaveBeenCalled();
      },
    );
    it('sessão diferente não recebe um transporte histórico assinado', async () => {
      const { portas, executar } = fixture();
      const request = new Request('https://exemplo.test/', {
        headers: { 'x-sessao': registro_id_exportacao },
      });
      const resultado = await operar(
        request,
        { operacao: 'ler', paciente_id, registro_id_exportacao, versao_exportacao },
        portas,
      );
      expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'nao_autenticado' } });
      expect(executar).not.toHaveBeenCalled();
    });
  },
);
