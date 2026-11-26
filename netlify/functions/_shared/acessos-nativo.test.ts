import { beforeEach, expect, it, vi } from 'vitest';
import type { AdminUserAttributes, User } from '@supabase/supabase-js';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { operarAcessosNativo, type PortasAcessos } from './acessos-nativo.ts';
import type { z } from 'zod';
import type { acessoPrivadoSchema } from '../../../packages/contracts/src/acessos.ts';

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
const cifra = criarCifraAutenticada({
  keyIdAtiva: 'teste',
  chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
  chaveHmac: new Uint8Array(32).fill(2),
});
const atestador = criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) });
let portas: PortasAcessos;
let registro: z.infer<typeof acessoPrivadoSchema>;
let repeticao: boolean;
let tramas: unknown[];
let usuario: User;
function pedido() {
  return new Request('https://app.example.test/api/acessos', {
    method: 'POST',
    headers: { 'x-sessao': sessao, 'x-chave-idempotencia': operacaoId },
  });
}
beforeEach(async () => {
  repeticao = false;
  tramas = [];
  const aad = {
    tabela: 'identidade.acesso_gerenciado' as const,
    registro_id: operacaoId,
    formato: 1 as const,
  };
  registro = {
    operacao_id: operacaoId,
    usuario_id: '44444444-4444-4444-8444-444444444444',
    nome_cifrado: await cifra.cifrar(entrada.nome, { ...aad, campo: 'nome' }),
    email_cifrado: await cifra.cifrar(entrada.email, { ...aad, campo: 'email' }),
    funcao: 'profissional',
    metodo: 'interno',
    estado: 'reservado',
    criado_em: '2026-11-18T10:00:00Z',
    criado_por_usuario_id: ator,
  };
  usuario = {
    id: registro.usuario_id ?? '',
    email: entrada.email,
    app_metadata: { ffcm_provisionamento_id: operacaoId },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-11-18T10:00:00Z',
  };
  portas = {
    autorizar: vi.fn(async () => ({
      estado: 'autorizado' as const,
      identidade: { usuario_id: ator, session_id: sessao, perfil: 'administrador' },
    })),
    cifra,
    atestador,
    metadados: (requestId) => ({
      key_id: 'teste',
      request_id: requestId,
      emitido_em: new Date().toISOString(),
      expira_em: new Date(Date.now() + 30_000).toISOString(),
    }),
    executar: vi.fn(async (transporte) => {
      tramas.push(transporte);
      const dados = transporte.entrada;
      const operacao = (dados.atestado as { operacao: string }).operacao;
      if (operacao === 'api.confirmar_acesso_gerenciado')
        registro = {
          ...registro,
          estado:
            dados.resultado_auth === 'conflito'
              ? 'conflito'
              : dados.resultado_auth === 'recusado'
                ? 'falha_confirmada'
                : 'aguardando_confirmacao_email',
        };
      return { ok: true, repeticao, dados: registro, request_id: dados.request_id };
    }),
    auth: {
      criar: vi.fn(async (_atributos: AdminUserAttributes) => ({ user: usuario, conflito: false })),
      consultar: vi.fn(async (_id: string) => usuario),
    },
  };
});
it('reserva auditada antecede Auth e senha só cruza fronteira Auth, sem derivados SQL/recibo', async () => {
  const resposta = await operarAcessosNativo(pedido(), { operacao: 'criar', entrada }, portas);
  expect(resposta.status).toBe(200);
  expect(portas.auth.criar).toHaveBeenCalledWith(
    expect.objectContaining({
      id: registro.usuario_id,
      password: entrada.senha,
      email_confirm: false,
      app_metadata: { ffcm_provisionamento_id: operacaoId },
    }),
  );
  expect(JSON.stringify(tramas)).not.toContain(entrada.senha);
  const texto = await resposta.text();
  expect(texto).not.toContain(entrada.senha);
  expect(texto).toContain('aguardando_confirmacao_email');
  expect(vi.mocked(portas.executar).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(portas.auth.criar).mock.invocationCallOrder[0] ?? 0,
  );
});
it('replay da reserva só consulta UUID e não repete criação nem redefinição', async () => {
  repeticao = true;
  expect((await operarAcessosNativo(pedido(), { operacao: 'criar', entrada }, portas)).status).toBe(
    200,
  );
  expect(portas.auth.criar).not.toHaveBeenCalled();
  expect(portas.auth.consultar).toHaveBeenCalledWith(registro.usuario_id);
});
it('timeout de criação fica incerto; consulta subsequente reconcilia marcador sem senha', async () => {
  vi.mocked(portas.auth.criar).mockRejectedValueOnce(new Error('erro privado'));
  const primeira = await operarAcessosNativo(pedido(), { operacao: 'criar', entrada }, portas);
  expect((await primeira.json()).erro.codigo).toBe('pendencia_externa');
  const segunda = await operarAcessosNativo(
    pedido(),
    { operacao: 'consultar', operacao_id: operacaoId },
    portas,
  );
  expect(segunda.status).toBe(200);
  expect(portas.auth.criar).toHaveBeenCalledTimes(1);
  expect(portas.auth.consultar).toHaveBeenCalledOnce();
});
it('UUID com marcador alheio nunca confirma operação nem adota conta por email', async () => {
  repeticao = true;
  usuario = { ...usuario, app_metadata: { ffcm_provisionamento_id: sessao } };
  expect((await operarAcessosNativo(pedido(), { operacao: 'criar', entrada }, portas)).status).toBe(
    503,
  );
  expect(tramas).toHaveLength(1);
  expect(portas.auth.criar).not.toHaveBeenCalled();
});
it('marcador e função em user_metadata não substituem marcador Authadmin', async () => {
  repeticao = true;
  usuario = {
    ...usuario,
    app_metadata: {},
    user_metadata: { ffcm_provisionamento_id: operacaoId, funcao: 'administrador' },
  };
  expect((await operarAcessosNativo(pedido(), { operacao: 'criar', entrada }, portas)).status).toBe(
    503,
  );
  expect(tramas).toHaveLength(1);
  expect(portas.auth.criar).not.toHaveBeenCalled();
});
it('colisão registra conflito e jamais atualiza conta existente', async () => {
  vi.mocked(portas.auth.criar).mockResolvedValueOnce({ user: null, conflito: true });
  const resposta = await operarAcessosNativo(pedido(), { operacao: 'criar', entrada }, portas);
  expect((await resposta.json()).dados.estado).toBe('conflito');
  expect(portas.auth.consultar).not.toHaveBeenCalled();
});
it('R-07: recusa definitiva só vira terminal após confirmação SQL e replay nunca repete Auth', async () => {
  vi.mocked(portas.auth.criar).mockResolvedValueOnce({
    user: null,
    conflito: false,
    recusado: true,
  });
  const resposta = await operarAcessosNativo(pedido(), { operacao: 'criar', entrada }, portas);
  expect((await resposta.json()).dados.estado).toBe('falha_confirmada');
  expect(JSON.stringify(tramas)).toContain('"resultado_auth":"recusado"');
  expect(JSON.stringify(tramas)).not.toContain(entrada.senha);
  repeticao = true;
  await operarAcessosNativo(pedido(), { operacao: 'consultar', operacao_id: operacaoId }, portas);
  await operarAcessosNativo(pedido(), { operacao: 'criar', entrada }, portas);
  expect(portas.auth.criar).toHaveBeenCalledTimes(1);
  expect(portas.auth.consultar).not.toHaveBeenCalled();
});
it('R-07: confirmação da recusa perdida preserva incerteza sem repetir criação', async () => {
  vi.mocked(portas.auth.criar).mockResolvedValueOnce({
    user: null,
    conflito: false,
    recusado: true,
  });
  const executar = portas.executar;
  portas.executar = vi.fn(async (transporte) => {
    if (
      (transporte.entrada.atestado as { operacao: string }).operacao ===
      'api.confirmar_acesso_gerenciado'
    )
      throw new Error('resposta perdida');
    return executar(transporte);
  });
  const resposta = await operarAcessosNativo(pedido(), { operacao: 'criar', entrada }, portas);
  expect((await resposta.json()).erro.codigo).toBe('pendencia_externa');
  expect(registro.estado).toBe('reservado');
  expect(portas.auth.criar).toHaveBeenCalledTimes(1);
});
it('nega perfil não administrativo antes de cifra, banco e Auth', async () => {
  portas.autorizar = vi.fn(async () => ({
    estado: 'autorizado' as const,
    identidade: { usuario_id: ator, session_id: sessao, perfil: 'profissional' },
  }));
  expect((await operarAcessosNativo(pedido(), { operacao: 'criar', entrada }, portas)).status).toBe(
    403,
  );
  expect(portas.executar).not.toHaveBeenCalled();
  expect(portas.auth.criar).not.toHaveBeenCalled();
});
it('Google não depende de Authadmin e não recebe senha', async () => {
  registro = {
    ...registro,
    metodo: 'google_workspace',
    usuario_id: null,
    estado: 'aguardando_google',
  };
  const { senha: _senha, ...google } = entrada;
  const resposta = await operarAcessosNativo(
    pedido(),
    { operacao: 'criar', entrada: { ...google, metodo: 'google_workspace' } },
    portas,
  );
  expect(resposta.status).toBe(200);
  expect(portas.auth.criar).not.toHaveBeenCalled();
  expect(portas.auth.consultar).not.toHaveBeenCalled();
});
it('revogação após reserva impede efeito Auth', async () => {
  let chamadas = 0;
  portas.autorizar = vi.fn(async () =>
    ++chamadas < 3
      ? {
          estado: 'autorizado' as const,
          identidade: { usuario_id: ator, session_id: sessao, perfil: 'administrador' },
        }
      : { estado: 'nao_autenticado' as const },
  );
  expect((await operarAcessosNativo(pedido(), { operacao: 'criar', entrada }, portas)).status).toBe(
    503,
  );
  expect(portas.auth.criar).not.toHaveBeenCalled();
});
