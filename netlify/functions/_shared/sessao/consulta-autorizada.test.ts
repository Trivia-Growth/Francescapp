import { expect, it, vi } from 'vitest';
import { criarAutorizacaoCurta } from '../../../../supabase/functions/_shared/autorizacao-curta.ts';
import type { criarEmissorAutorizacaoCurta } from '../../../../supabase/functions/_shared/emissor-autorizacao-curta.ts';
import { criarConsultaAutorizada } from './consulta-autorizada.ts';

const usuarioId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const identidade = { usuarioId, sessionId, geracao: 1, prova: 'A'.repeat(43), jwt: 'jwt-ficticio' };
const autorizador = criarAutorizacaoCurta({ keyId: 'teste', chave: new Uint8Array(32).fill(7) });

it('mantém o vínculo original quando identidade é alterada durante emissão', async () => {
  const mutavel = { ...identidade };
  let continuar!: () => void;
  let iniciado!: () => void;
  const espera = new Promise<void>((resolve) => {
    continuar = resolve;
  });
  const emissaoIniciada = new Promise<void>((resolve) => {
    iniciado = resolve;
  });
  const emitir: ReturnType<typeof criarEmissorAutorizacaoCurta> = async (
    contexto,
    _prova,
    entrada,
  ) => {
    iniciado();
    await espera;
    return autorizador.emitir(contexto, entrada, Date.now());
  };
  const consultar = vi.fn(async ({ jwt }: { jwt: string }) => {
    expect(jwt).toBe('jwt-ficticio');
    return {
      usuario: { id: usuarioId, perfil: 'administrador', ativo: true, versao: 1 },
      capacidades: [],
    };
  });
  const resultado = criarConsultaAutorizada({ emitir, consultar })(mutavel);
  await emissaoIniciada;
  mutavel.usuarioId = sessionId;
  mutavel.jwt = 'outro-jwt';
  continuar();
  expect((await resultado)?.usuario.id).toBe(usuarioId);
});

it('vincula autorização à identidade e entrega apenas a entrada canônica à consulta', async () => {
  const emitir = vi.fn(async (contexto, prova, entrada) => {
    expect(prova).toBe(identidade.prova);
    return autorizador.emitir(contexto, entrada, Date.now());
  });
  const consultar = vi.fn(async ({ autorizacao, entradaCanonica, jwt }) => {
    expect(jwt).toBe(identidade.jwt);
    expect(entradaCanonica).toBe('{}');
    expect(autorizacao.usuario_id).toBe(usuarioId);
    expect(autorizacao.session_id).toBe(sessionId);
    return {
      usuario: { id: usuarioId, perfil: 'administrador', ativo: true, versao: 1 },
      capacidades: [],
    };
  });
  const resultado = await criarConsultaAutorizada({ emitir, consultar })(identidade);
  expect(resultado?.usuario.id).toBe(usuarioId);
  expect(consultar).toHaveBeenCalledOnce();
});

it('recusa vínculo divergente ou entrada adulterada sem consultar o banco', async () => {
  const consultar = vi.fn(async () => null);
  for (const alteracao of ['usuario', 'entrada']) {
    const emitir: ReturnType<typeof criarEmissorAutorizacaoCurta> = async (
      contexto,
      _prova,
      entrada,
    ) => {
      const resultado = await autorizador.emitir(contexto, entrada, Date.now());
      return alteracao === 'usuario'
        ? { ...resultado, autorizacao: { ...resultado.autorizacao, usuario_id: sessionId } }
        : { ...resultado, entradaCanonica: '{"extra":true}' };
    };
    await expect(criarConsultaAutorizada({ emitir, consultar })(identidade)).rejects.toThrow();
  }
  expect(consultar).not.toHaveBeenCalled();
});

it('falha fechada ao negar sessão, falhar emissor ou receber outro usuário', async () => {
  const emitir: ReturnType<typeof criarEmissorAutorizacaoCurta> = (contexto, _prova, entrada) =>
    autorizador.emitir(contexto, entrada, Date.now());
  const consultaNegada = criarConsultaAutorizada({ emitir, consultar: async () => null });
  expect(await consultaNegada(identidade)).toBeNull();
  const consultaFalha = criarConsultaAutorizada({
    emitir: async () => {
      throw new Error('segredo');
    },
    consultar: async () => null,
  });
  await expect(consultaFalha(identidade)).rejects.toThrow('Consulta indisponível.');
  const consultaOutra = criarConsultaAutorizada({
    emitir,
    consultar: async () => ({
      usuario: { id: sessionId, perfil: 'administrador', ativo: true, versao: 1 },
      capacidades: [],
    }),
  });
  await expect(consultaOutra(identidade)).rejects.toThrow('Consulta indisponível.');
});
