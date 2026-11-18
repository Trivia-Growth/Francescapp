import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { comporSegredosIntegracoesNativo } from './compor-segredos-integracoes-nativo.ts';
import { operarSegredosIntegracoesNativo } from './segredos-integracoes-nativo.ts';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';

const mocks = vi.hoisted(() => ({ cofre: vi.fn(), usuario: vi.fn(), rpc: vi.fn() }));
vi.mock('./cofre-nativo.ts', () => ({ carregarCofreNativo: mocks.cofre }));
vi.mock('./auth-nativo/cliente.ts', () => ({
  criarContextoAuthNativo: () => ({
    origem: 'https://app.example.test',
    cookiesAlterados: false,
    cliente: { auth: { getUser: mocks.usuario }, schema: () => ({ rpc: mocks.rpc }) },
  }),
  credencialAuthRejeitada: () => false,
}));
const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const dependencias = {
  fonte: {},
  pool: {} as Pool,
  referencias: { keyIdAtiva: 'teste', referenciasCifra: {}, referenciaHmac: 'ficticio' },
  keyIdAtestado: 'teste',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.usuario.mockResolvedValue({ data: { user: { id: usuario } }, error: null });
});
afterEach(() => vi.restoreAllMocks());

it.each(['profissional', 'familia'])('servidor nega %s antes do Vault', async (perfil) => {
  mocks.rpc.mockResolvedValue({
    data: {
      session_id: sessao,
      usuario: { id: usuario, ativo: true, versao: 1, perfil },
      capacidades: [],
    },
    error: null,
  });
  const resultado = await comporSegredosIntegracoesNativo(
    new Request('https://app.example.test/api/admin/segredos-integracoes', {
      headers: { 'x-sessao': sessao },
    }),
    { operacao: 'listar' },
    dependencias,
  );
  expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
  expect(mocks.cofre).not.toHaveBeenCalled();
});

it('origem incorreta impede gravação antes da autorização e Vault', async () => {
  const resultado = await comporSegredosIntegracoesNativo(
    new Request('https://app.example.test/api/admin/segredos-integracoes', {
      headers: { 'x-sessao': sessao, origin: 'https://invasor.example.test' },
    }),
    {
      operacao: 'gravar',
      segredo_chave: 'ffcmapp.integracao.openrouter',
      valor: 'valor-ficticio-invalido',
      versao_esperada: 0,
    },
    dependencias,
  );
  expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
  expect(mocks.usuario).not.toHaveBeenCalled();
  expect(mocks.cofre).not.toHaveBeenCalled();
});

const autorizado = async () => ({
  estado: 'autorizado' as const,
  identidade: { usuario_id: usuario, session_id: sessao },
});
function portas() {
  return {
    autorizar: autorizado,
    revalidar: autorizado,
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: new Date(Date.now() - 1000).toISOString(),
      expira_em: new Date(Date.now() + 20000).toISOString(),
    }),
    idempotencia: { calcularDigestIdempotencia: async () => 'a'.repeat(43) },
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(42) }),
    executar: vi.fn(
      async (
        _request: Request,
        transporte: { p_transporte: { entrada: Record<string, unknown> } },
      ) => ({
        ok: true,
        request_id: transporte.p_transporte.entrada.request_id,
        dados: {
          chave: 'ffcmapp.integracao.openrouter',
          cadastrado: true,
          versao: 1,
          atualizado_por_usuario_id: usuario,
          atualizado_em: new Date().toISOString(),
        },
      }),
    ),
  };
}
const request = () =>
  new Request('https://app.example.test/api/admin/segredos-integracoes', {
    headers: { 'x-sessao': sessao, 'x-chave-idempotencia': 'ficticio-primeiro' },
  });
const comando = {
  operacao: 'gravar' as const,
  segredo_chave: 'ffcmapp.integracao.openrouter',
  valor: 'valor-ficticio-invalido',
  versao_esperada: 0,
};

it('Administrador grava primeira versão; saída nunca inclui valor e revalida sessão', async () => {
  const p = portas();
  const revalidar = vi.fn(autorizado);
  p.revalidar = revalidar;
  const resultado = await operarSegredosIntegracoesNativo(request(), comando, p);
  expect(resultado).toMatchObject({ ok: true, dados: { versao: 1, cadastrado: true } });
  expect(JSON.stringify(resultado)).not.toContain(comando.valor);
  expect(revalidar).toHaveBeenCalledOnce();
  expect(p.executar.mock.calls[0]?.[1].p_transporte.entrada.valor).toBe(comando.valor);
});

it('nega resposta que tentaria devolver valor; não repassa exceção nem corpo', async () => {
  const p = portas();
  p.executar.mockImplementation(async (_request, transporte) => ({
    ok: true,
    request_id: transporte.p_transporte.entrada.request_id,
    dados: {
      chave: 'ffcmapp.integracao.openrouter',
      cadastrado: true,
      versao: 1,
      atualizado_por_usuario_id: usuario,
      atualizado_em: new Date().toISOString(),
      valor: comando.valor,
    },
  }));
  const resultado = await operarSegredosIntegracoesNativo(request(), comando, p);
  expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
  expect(JSON.stringify(resultado)).not.toContain(comando.valor);
});
