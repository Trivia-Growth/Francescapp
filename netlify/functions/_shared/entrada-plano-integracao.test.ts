import type { Pool } from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import { criarEntradaPlanoNativa } from './entrada-plano-nativa.ts';

const origem = 'https://app.example.test';
const usuarioId = '11111111-1111-4111-8111-111111111111';
const sessaoId = '33333333-3333-4333-8333-333333333333';
const outroId = '44444444-4444-4444-8444-444444444444';
const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica',
  FFCM_APP_ORIGIN: origem,
};
const query = async (sql: string, args?: string[]) => {
  if (sql.includes('ler_chave_cifra_vault'))
    return {
      rows: [
        {
          chave: btoa(
            String.fromCharCode(...new Uint8Array(32).fill(args?.[0]?.endsWith('hmac') ? 2 : 1)),
          ),
        },
      ],
    };
  if (sql.includes('ler_chave_atestado_vault'))
    return { rows: [{ chave: new Uint8Array(32).fill(3) }] };
  return { rows: [] };
};
const pool = {
  options: { connectionTimeoutMillis: 1000, query_timeout: 1000 },
  connect: async () => ({ query, release: () => {} }),
} as unknown as Pool;
const dependencias = {
  fonte,
  pool,
  referencias: {
    keyIdAtiva: 'v1',
    referenciasCifra: { v1: 'ffcmapp.cifra.ativa' },
    referenciaHmac: 'ffcmapp.cifra.hmac',
  },
  keyIdAtestado: 'v1',
};
const objetivo = {
  descricao: 'Fictício',
  area: 'Área',
  responsavel: 'Equipe',
  situacaoInicial: 'Inicial',
  observacaoProgresso: 'Progresso',
  dataRevisao: '2026-12-01',
  estado: 'proposto',
};
function prepararRede() {
  const usuario = { id: usuarioId, aud: 'authenticated' };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: usuario.id, exp })).toString('base64url')}.ZmFrZQ`;
  const sessao = {
    access_token: token,
    refresh_token: 'ficticio',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user: usuario,
  };
  const cookie = `sb-projeto-ficticio-auth-token=base64-${Buffer.from(JSON.stringify(sessao)).toString('base64url')}`;
  const rede = vi.fn(async (input: RequestInfo | URL) => {
    const caminho = new URL(String(input)).pathname;
    if (caminho === '/auth/v1/user') return Response.json(usuario);
    if (caminho === '/rest/v1/rpc/consultar_sessao_nativa')
      return Response.json({
        session_id: sessaoId,
        usuario: { id: usuario.id, perfil: 'profissional', ativo: true, versao: 1 },
        capacidades: ['consultar_pacientes_vinculados'],
      });
    if (caminho === '/rest/v1/rpc/plano_cuidado_privado') throw new Error('Resposta perdida');
    throw new Error('Rota inesperada');
  });
  vi.stubGlobal('fetch', rede);
  return { cookie, rede };
}
afterEach(() => vi.unstubAllGlobals());
function pedido(
  metodo: 'POST' | 'PATCH',
  cookie: string,
  session = sessaoId,
  origin: string | null = origem,
) {
  const headers = new Headers({
    cookie,
    'x-sessao': session,
    'x-chave-idempotencia': outroId,
    'content-type': 'application/json',
  });
  if (origin) headers.set('origin', origin);
  const caminho = `/api/pacientes/${usuarioId}/plano${metodo === 'PATCH' ? `/${outroId}` : ''}`;
  const corpo =
    metodo === 'POST'
      ? { objetivo_id: outroId, objetivo, reserva_id: outroId, geracao_reserva: 1 }
      : { versao_esperada: 1, objetivo, motivo: 'Revisão' };
  return new Request(origem + caminho, { method: metodo, headers, body: JSON.stringify(corpo) });
}
it.each([null, 'https://estrangeira.example'])(
  'nega mutação com origem %s antes de consultar identidade',
  async (origin) => {
    const { cookie, rede } = prepararRede();
    const resposta = await criarEntradaPlanoNativa(dependencias).atender(
      pedido('POST', cookie, sessaoId, origin),
    );
    expect(resposta.status).toBe(401);
    expect(rede).not.toHaveBeenCalled();
  },
);
it('nega sessão diferente da identidade autenticada antes da operação', async () => {
  const { cookie, rede } = prepararRede();
  const resposta = await criarEntradaPlanoNativa(dependencias).atender(
    pedido('POST', cookie, outroId),
  );
  expect(resposta.status).toBe(401);
  expect(rede.mock.calls.some(([url]) => String(url).includes('plano_cuidado_privado'))).toBe(
    false,
  );
});
it.each(['POST', 'PATCH'] as const)(
  'classifica resposta perdida após início de %s como pendência externa',
  async (metodo) => {
    const { cookie, rede } = prepararRede();
    const resposta = await criarEntradaPlanoNativa(dependencias).atender(pedido(metodo, cookie));
    expect(await resposta.json()).toMatchObject({ erro: { codigo: 'pendencia_externa' } });
    expect(rede.mock.calls.some(([url]) => String(url).includes('plano_cuidado_privado'))).toBe(
      true,
    );
  },
);
