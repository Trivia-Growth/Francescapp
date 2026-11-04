import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { operarAnamneseNativa } from './anamnese-nativa.ts';

const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
const paciente_id = 'c0000000-0000-4000-8000-000000000003';
const secoes = [
  {
    id: 'saude',
    camposEsperados: ['alergia'],
    respostas: [{ campo: 'alergia', estado: 'pendente' }],
  },
];
const request = () => new Request('https://exemplo.test/', { headers: { 'x-sessao': session_id } });
function portas() {
  const identidade = { usuario_id, session_id };
  return {
    autorizar: async () => ({ estado: 'autorizado' as const, identidade }),
    revalidar: async () => ({ estado: 'autorizado' as const, identidade }),
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-11-04T12:00:00Z',
      expira_em: '2026-11-04T12:00:30Z',
    }),
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    cifra: criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
      chaveHmac: new Uint8Array(32).fill(4),
    }),
    executar: vi.fn(
      async (
        _request: Request,
        { p_transporte }: { p_transporte: { entrada: Record<string, unknown> } },
      ) => {
        const entrada = p_transporte.entrada;
        return {
          ok: true,
          request_id: entrada.request_id,
          dados: {
            registro_id: entrada.registro_id,
            paciente_id: entrada.paciente_id,
            versao: Number(entrada.versao_esperada) + 1,
            conteudo: entrada.conteudo,
          },
        };
      },
    ),
  };
}
describe('composição interna da anamnese', () => {
  it('cifra conteúdo, atesta e recupera versão com AAD vinculado', async () => {
    const deps = portas();
    const resultado = await operarAnamneseNativa(
      request(),
      { operacao: 'gravar', paciente_id, versao_esperada: 0, secoes },
      deps,
    );
    expect(resultado).toMatchObject({ ok: true, dados: { versao: 1, secoes } });
    const chamada = deps.executar.mock.calls[0];
    if (!chamada) throw new Error('Execução não ocorreu.');
    const transporte = chamada[1].p_transporte;
    expect(JSON.stringify(transporte)).not.toContain('alergia');
    expect(transporte.entrada.atestado).toMatchObject({
      operacao: 'api.gravar_anamnese',
      usuario_id,
      session_id,
    });
  });
  it('nega sessão divergente antes de executar', async () => {
    const deps = portas();
    const resultado = await operarAnamneseNativa(
      new Request('https://exemplo.test/'),
      { operacao: 'ler', paciente_id },
      deps,
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'nao_autenticado' } });
    expect(deps.executar).not.toHaveBeenCalled();
  });
  it('não entrega conteúdo quando sessão é revogada durante leitura', async () => {
    const deps = portas();
    const resultado = await operarAnamneseNativa(
      request(),
      { operacao: 'ler', paciente_id },
      {
        ...deps,
        executar: async (_req, { p_transporte }) => ({
          ok: true,
          request_id: p_transporte.entrada.request_id,
          dados: null,
        }),
        revalidar: async () => ({ estado: 'nao_autenticado' }),
      },
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'nao_autenticado' } });
  });
});
