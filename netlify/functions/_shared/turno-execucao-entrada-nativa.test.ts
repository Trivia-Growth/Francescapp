import { describe, it, expect, vi } from 'vitest';
import { criarEntradaExecucaoTurno } from './turno-execucao-entrada-nativa.ts';
import type { DependenciasExecucaoTurno } from './turno-execucao-compor-nativo.ts';
const paciente = 'c0000000-0000-4000-8000-000000000003';
const sessao = 'b0000000-0000-4000-8000-000000000002';
const id: ReturnType<Crypto['randomUUID']> = 'd0000000-0000-4000-8000-000000000004';
const base = `https://exemplo.test/api/pacientes/${paciente}/execucao-turno`;
const deps = {} as DependenciasExecucaoTurno;
describe('fronteira HTTP execução', () => {
  it.each(['?limite=1&limite=2', '?atestado=forjado', '?paciente_id=outro'])(
    'rejeita parâmetros ambíguos/privados %s antes do servidor',
    async (sufixo) => {
      const operar = vi.fn();
      const r = await criarEntradaExecucaoTurno(deps, operar).atender(
        new Request(`${base}/catalogo${sufixo}`, { headers: { 'x-sessao': sessao } }),
      );
      expect(r.status).toBe(422);
      expect(operar).not.toHaveBeenCalled();
    },
  );
  it('sem sessão não chama composição', async () => {
    const operar = vi.fn();
    const r = await criarEntradaExecucaoTurno(deps, operar).atender(
      new Request(`${base}/catalogo`),
    );
    expect(r.status).toBe(401);
    expect(operar).not.toHaveBeenCalled();
  });
  it('corpo excessivo não chega a cifra/SQL', async () => {
    const operar = vi.fn();
    const r = await criarEntradaExecucaoTurno(deps, operar).atender(
      new Request(base, {
        method: 'POST',
        headers: {
          'x-sessao': sessao,
          'x-chave-idempotencia': 'chave_ficticia_123456',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ texto: 'a'.repeat(131073) }),
      }),
    );
    expect(r.status).toBe(422);
    expect(operar).not.toHaveBeenCalled();
  });
  it('GET download mantém ID da rota e envia binário privado sem URL de Storage', async () => {
    const operar = vi.fn(async () => ({
      ok: true as const,
      dados: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(16).fill(0)]),
      request_id: id,
    }));
    const r = await criarEntradaExecucaoTurno(deps, operar).atender(
      new Request(`${base}/anexos/${id}`, { headers: { 'x-sessao': sessao } }),
    );
    expect(r.status).toBe(200);
    expect((operar.mock.calls as unknown as unknown[][])[0]?.[1]).toMatchObject({
      operacao: 'baixarAnexo',
      paciente_id: paciente,
      anexo_id: id,
      entrada: {},
    });
    expect(r.headers.get('cache-control')).toContain('no-store');
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('content-disposition')).toContain('attachment');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(16).fill(0)]),
    );
  });
  it('resultado incerto conserva request_id da mutação para conferência', async () => {
    const operar = vi.fn(async () => ({
      ok: false as const,
      erro: { codigo: 'pendencia_externa' },
      request_id: id,
    }));
    const r = await criarEntradaExecucaoTurno(deps, operar).atender(
      new Request(`${base}/localizacao`, {
        method: 'POST',
        headers: {
          'x-sessao': sessao,
          'x-chave-idempotencia': 'chave_ficticia_123456',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          turno_id: id,
          momento: 'abertura',
          motivo_ausencia: 'indisponivel',
        }),
      }),
    );
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ request_id: id });
  });
});

// Exercita o handler real; composição simulada não prova persistência nem autorização SQL.
const administracao = {
  turno_id: id,
  item_id: id,
  versao: 1,
  executor: { nome: 'Executor fictício', vinculo: 'Equipe externa fictícia' },
  situacao: 'administrado' as const,
};
function pedidoAdministracao(entrada: unknown) {
  return new Request(base, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sessao': sessao,
      'x-chave-idempotencia': 'chave_ficticia_123456',
    },
    body: JSON.stringify(entrada),
  });
}
it.each([0, 1])(
  'descarta somente registrador conhecido na administração, versão esperada %s',
  async (versaoEsperada) => {
    const entrada = {
      epoca: 1,
      registro_id: id,
      versao_esperada: versaoEsperada,
      conteudo: { classe: 'administracao' as const, dados: administracao },
      ...(versaoEsperada ? { motivo: 'Correção fictícia' } : {}),
    };
    const operar = vi.fn(async () => ({
      ok: true as const,
      request_id: id,
      dados: {
        paciente_id: paciente,
        turno_id: id,
        registro_id: id,
        versao: versaoEsperada + 1,
        conteudo: entrada.conteudo,
        ...(versaoEsperada ? { motivo: 'Correção fictícia' } : {}),
        registrador_usuario_id: paciente,
        registrador_nome: null,
        criado_em: '2026-11-19T12:00:00Z',
        instante_ocorrencia: '2026-11-19T12:00:00Z',
        retificada: versaoEsperada > 0,
        recibo_id: id,
      },
    }));
    const r = await criarEntradaExecucaoTurno(deps, operar).atender(
      pedidoAdministracao({
        ...entrada,
        conteudo: { ...entrada.conteudo, dados: { ...administracao, registrador_usuario_id: id } },
      }),
    );
    expect(r.status).toBe(200);
    expect(operar).toHaveBeenCalledWith(
      expect.any(Request),
      { operacao: 'gravar', paciente_id: paciente, entrada },
      deps,
    );
    expect((await r.json()).dados.registrador_usuario_id).toBe(paciente);
  },
);
it.each([
  { dados: { ...administracao, executor: undefined, registrador_usuario_id: id }, extra: {} },
  { dados: { ...administracao, registrador_usuario_id: id, arbitrario: 'extra' }, extra: {} },
  { dados: { ...administracao, registrador_usuario_id: id, autor_usuario_id: id }, extra: {} },
  { dados: { ...administracao, registrador_usuario_id: id, atestado: {} }, extra: {} },
  { dados: administracao, extra: { registrador_usuario_id: id } },
])(
  'recusa executor ausente e extras que não são o registrador conhecido: %j',
  async ({ dados, extra }) => {
    const operar = vi.fn();
    const r = await criarEntradaExecucaoTurno(deps, operar).atender(
      pedidoAdministracao({
        epoca: 1,
        registro_id: id,
        versao_esperada: 0,
        conteudo: { classe: 'administracao', dados },
        ...extra,
      }),
    );
    expect(r.status).toBe(422);
    expect(operar).not.toHaveBeenCalled();
  },
);
