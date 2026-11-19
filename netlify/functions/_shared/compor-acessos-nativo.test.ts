import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acessoPrivadoSchema } from '../../../packages/contracts/src/acessos.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import type { PortasAcessos } from './acessos-nativo.ts';
import { comporAcessosNativo } from './compor-acessos-nativo.ts';

const mocks = vi.hoisted(() => ({ autorizar: vi.fn(), cofre: vi.fn(), rpc: vi.fn() }));
vi.mock('./auth-nativo/operacao-protegida.ts', () => ({
  autorizarOperacaoNativa: mocks.autorizar,
}));
vi.mock('./cofre-nativo.ts', () => ({ carregarCofreNativo: mocks.cofre }));
vi.mock('./configurar-dependencias-nativas.ts', () => ({
  configurarDependenciasNativas: () => ({ pool: {}, referencias: {}, keyIdAtestado: 'teste' }),
}));
vi.mock('./compor-pacientes-nativo.ts', () => ({
  metadadosAtestadoNativo: (keyId: string, requestId: string, agora: number) => ({
    key_id: keyId,
    request_id: requestId,
    emitido_em: new Date(agora).toISOString(),
    expira_em: new Date(agora + 30_000).toISOString(),
  }),
}));

const operacaoId = '11111111-1111-4111-8111-111111111111';
const ator = '22222222-2222-4222-8222-222222222222';
const sessao = '33333333-3333-4333-8333-333333333333';
const entrada = {
  operacao_id: operacaoId,
  nome: 'Pessoa fictícia',
  email: 'ficticio@example.test',
  funcao: 'profissional',
  metodo: 'interno',
  senha: 'senha-ficticia-apenas-auth',
  motivo: 'Cadastro fictício',
};
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica-ficticia',
  FFCM_APP_ORIGIN: 'https://app.example.test',
  FFCM_SUPABASE_AUTH_SECRET_KEY: 'chave-privilegiada-ficticia',
};
const cifra = criarCifraAutenticada({
  keyIdAtiva: 'teste',
  chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
  chaveHmac: new Uint8Array(32).fill(2),
});
const atestador = criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) });
type Transporte = Parameters<PortasAcessos['executar']>[0];
let registro: ReturnType<typeof acessoPrivadoSchema.parse>;
let tramas: Transporte[];

beforeEach(() => {
  vi.clearAllMocks();
  tramas = [];
  mocks.autorizar.mockResolvedValue({
    estado: 'autorizado',
    sessao: { session_id: sessao, usuario: { id: ator, perfil: 'administrador' } },
    contexto: { cookiesAlterados: false, cliente: { schema: () => ({ rpc: mocks.rpc }) } },
  });
  mocks.cofre.mockResolvedValue({ cifra, atestador });
  mocks.rpc.mockImplementation(
    async (_nome: string, { p_transporte }: { p_transporte: Transporte }) => {
      tramas.push(p_transporte);
      const dados = p_transporte.entrada;
      if ((dados.atestado as { operacao: string }).operacao === 'api.reservar_acesso_gerenciado') {
        registro = acessoPrivadoSchema.parse({
          operacao_id: dados.operacao_id,
          usuario_id: dados.usuario_id,
          nome_cifrado: dados.nome_cifrado,
          email_cifrado: dados.email_cifrado,
          funcao: dados.funcao,
          metodo: dados.metodo,
          estado: 'reservado',
          criado_em: '2026-11-18T10:00:00+00:00',
          criado_por_usuario_id: ator,
        });
      } else if (dados.resultado_auth === 'recusado')
        registro = { ...registro, estado: 'falha_confirmada' };
      return {
        error: null,
        data: { ok: true, repeticao: false, dados: registro, request_id: dados.request_id },
      };
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function criar() {
  const request = new Request('https://app.example.test/api/acessos', {
    method: 'POST',
    headers: { 'x-chave-idempotencia': operacaoId },
  });
  return comporAcessosNativo(request, { operacao: 'criar', entrada }, fonte);
}

// SDK AuthAdmin real, somente HTTP e autorização/cofre substituídos por fontes fictícias.
// Detecta a classe AuthWeakPasswordError que um mock AuthApiError não exercitaria.
it.each([400, 422])(
  'R-07: rejeição nativa weak_password HTTP %s confirma terminal e não vaza senha/erro',
  async (status) => {
    const rede = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new URL(String(input)).pathname).toBe('/auth/v1/admin/users');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        id: registro.usuario_id,
        password: entrada.senha,
        email_confirm: false,
        app_metadata: { ffcm_provisionamento_id: operacaoId },
      });
      return Response.json(
        {
          code: 'weak_password',
          message: 'detalhe privado do fornecedor',
          weak_password: { reasons: ['length'] },
        },
        { status, headers: { 'x-supabase-api-version': '2024-01-01' } },
      );
    });
    vi.stubGlobal('fetch', rede);
    const resposta = await criar();
    expect(resposta.status).toBe(200);
    const publico = await resposta.text();
    expect(JSON.parse(publico).dados.estado).toBe('falha_confirmada');
    expect(publico).not.toContain('detalhe privado');
    expect(publico).not.toContain(entrada.senha);
    expect(JSON.stringify(tramas)).toContain('"resultado_auth":"recusado"');
    expect(JSON.stringify(tramas)).not.toContain(entrada.senha);
    expect(JSON.stringify(tramas)).not.toContain('weak_password');
    expect(rede).toHaveBeenCalledTimes(1);
  },
);

it.each([
  { status: 400, code: 'unexpected_failure' },
  { status: 500, code: 'weak_password' },
])('R-07: erro $status/$code não libera reserva nem confirma recusa', async ({ status, code }) => {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      { code, message: 'weak_password detalhe privado' },
      { status, headers: { 'x-supabase-api-version': '2024-01-01' } },
    ),
  );
  const resposta = await criar();
  expect(resposta.status).toBe(503);
  expect((await resposta.json()).erro.codigo).toBe('pendencia_externa');
  expect(registro.estado).toBe('reservado');
  expect(tramas).toHaveLength(1);
});
