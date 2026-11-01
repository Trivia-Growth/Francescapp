import { describe, expect, it, vi } from 'vitest';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarCursorCarteira } from '../src/cursor-carteira.ts';
import { criarHandlerCarteiraExperimental } from '../src/http-carteira-experimental.ts';

const usuario_id = '61000000-0000-4000-8000-000000000001';
const session_id = '63000000-0000-4000-8000-000000000001';
const pacienteId = '66000000-0000-4000-8000-000000000001';
const credenciais = { jwt: 'jwt-ficticio', prova: 'A'.repeat(43), geracao: 1 };
const cifra = criarCifraAutenticada({
  keyIdAtiva: 'ficticia',
  chavesDeCifra: { ficticia: new Uint8Array(32).fill(17) },
  chaveHmac: new Uint8Array(32).fill(43),
});

describe('handler experimental da carteira', () => {
  it('não inicia nova decifragem após expirar durante a primeira', async () => {
    const cursores = await criarCursorCarteira(new Uint8Array(32).fill(5));
    const envelope = await cifra.cifrar('Nome fictício', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome',
      formato: 1,
    });
    let liberar!: () => void;
    let iniciou!: () => void;
    const iniciado = new Promise<void>((resolve) => {
      iniciou = resolve;
    });
    const espera = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const decifrar = vi.fn(async () => {
      iniciou();
      await espera;
      return 'Nome fictício';
    });
    const handler = criarHandlerCarteiraExperimental({
      autorizar: async () => ({
        estado: 'autorizado',
        identidade: { usuario_id, session_id },
        ...credenciais,
      }),
      consultar: async (_, consulta) => ({
        ok: true,
        request_id: consulta.request_id,
        dados: {
          itens: [
            { paciente_id: pacienteId, nome: envelope, nome_preferencia: envelope, versao: 1 },
          ],
          proximo_cursor: null,
        },
      }),
      cursores,
      cifra: { decifrar },
    });
    vi.useFakeTimers();
    try {
      const pendente = handler(new Request('https://exemplo.test/api/pacientes?limite=1'));
      await iniciado;
      await vi.advanceTimersByTimeAsync(15_001);
      expect((await pendente).status).toBe(503);
      liberar();
      await vi.advanceTimersByTimeAsync(0);
      expect(decifrar).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(['autorização', 'consulta'])(
    'encerra %s tardia sem iniciar outra etapa',
    async (etapa) => {
      const cursores = await criarCursorCarteira(new Uint8Array(32).fill(5));
      let liberar!: () => void;
      let iniciou!: () => void;
      const iniciado = new Promise<void>((resolve) => {
        iniciou = resolve;
      });
      const espera = new Promise<void>((resolve) => {
        liberar = resolve;
      });
      let autorizacoes = 0;
      let consultas = 0;
      const handler = criarHandlerCarteiraExperimental({
        autorizar: async () => {
          autorizacoes++;
          if (etapa === 'autorização') {
            iniciou();
            await espera;
          }
          return { estado: 'autorizado', identidade: { usuario_id, session_id }, ...credenciais };
        },
        consultar: async (_, consulta) => {
          consultas++;
          if (etapa === 'consulta') {
            iniciou();
            await espera;
          }
          return {
            ok: true,
            request_id: consulta.request_id,
            dados: { itens: [], proximo_cursor: null },
          };
        },
        cursores,
        cifra,
      });
      vi.useFakeTimers();
      try {
        const pendente = handler(new Request('https://exemplo.test/api/pacientes?limite=1'));
        await iniciado;
        await vi.advanceTimersByTimeAsync(15_001);
        const resposta = await pendente;
        expect(resposta.status).toBe(503);
        expect(resposta.headers.get('cache-control')).toBe('no-store');
        expect(JSON.stringify(await resposta.json())).not.toContain('jwt-ficticio');
        liberar();
        await vi.advanceTimersByTimeAsync(0);
        expect(consultas).toBe(etapa === 'consulta' ? 1 : 0);
        expect(autorizacoes).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it('lista paciente autorizado e sela cursor por sessão', async () => {
    const nome = await cifra.cifrar('Paciente fictício', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome',
      formato: 1,
    });
    const cursores = await criarCursorCarteira(new Uint8Array(32).fill(5));
    const consultar = vi.fn(
      async (
        _identidade: { usuario_id: string; session_id: string },
        consulta: { request_id: string },
      ) => ({
        ok: true,
        request_id: consulta.request_id,
        dados: {
          itens: [{ paciente_id: pacienteId, nome, nome_preferencia: null, versao: 1 }],
          proximo_cursor: pacienteId,
        },
      }),
    );
    const handler = criarHandlerCarteiraExperimental({
      autorizar: async () => ({
        estado: 'autorizado',
        identidade: { usuario_id, session_id },
        ...credenciais,
      }),
      consultar,
      cursores,
      cifra,
    });
    const resposta = await handler(new Request('https://exemplo.test/api/pacientes?limite=1'));
    const corpo = await resposta.json();
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('cache-control')).toBe('no-store');
    expect(corpo.dados.itens[0].nome).toBe('Paciente fictício');
    expect(corpo.dados.proximo_cursor).not.toContain(pacienteId);
    expect(
      await cursores.abrir(corpo.dados.proximo_cursor, {
        usuarioId: usuario_id,
        sessaoId: session_id,
      }),
    ).toBe(pacienteId);
    expect(consultar).toHaveBeenCalledTimes(1);
  });
  it('recusa cursor adulterado ou de outra sessão antes de consultar banco', async () => {
    const cursores = await criarCursorCarteira(new Uint8Array(32).fill(5));
    const token = await cursores.emitir(pacienteId, {
      usuarioId: usuario_id,
      sessaoId: session_id,
    });
    const consultar = vi.fn();
    const handler = criarHandlerCarteiraExperimental({
      autorizar: async () => ({
        estado: 'autorizado',
        identidade: { usuario_id, session_id: pacienteId },
        ...credenciais,
      }),
      consultar,
      cursores,
      cifra,
    });
    expect(
      (await handler(new Request(`https://exemplo.test/api/pacientes?limite=1&cursor=${token}`)))
        .status,
    ).toBe(422);
    expect(
      (
        await handler(
          new Request(`https://exemplo.test/api/pacientes?limite=1&cursor=${token.slice(0, -1)}!`),
        )
      ).status,
    ).toBe(422);
    expect(consultar).not.toHaveBeenCalled();
  });
  it('não entrega resposta se sessão mudar após consulta', async () => {
    const cursores = await criarCursorCarteira(new Uint8Array(32).fill(5));
    const autorizar = vi
      .fn()
      .mockResolvedValueOnce({
        estado: 'autorizado',
        identidade: { usuario_id, session_id },
        ...credenciais,
      })
      .mockResolvedValueOnce({ estado: 'nao_autenticado' });
    const consultar = async (_: unknown, consulta: { request_id: string }) => ({
      ok: true,
      request_id: consulta.request_id,
      dados: { itens: [], proximo_cursor: null },
    });
    const resposta = await criarHandlerCarteiraExperimental({
      autorizar,
      consultar,
      cursores,
      cifra,
    })(new Request('https://exemplo.test/api/pacientes?limite=1'));
    expect(resposta.status).toBe(401);
    expect(JSON.stringify(await resposta.json())).not.toContain('itens');
  });
  it('não entrega resultado se geração da prova mudar após consulta', async () => {
    const cursores = await criarCursorCarteira(new Uint8Array(32).fill(5));
    const autorizar = vi
      .fn()
      .mockResolvedValueOnce({
        estado: 'autorizado',
        identidade: { usuario_id, session_id },
        ...credenciais,
      })
      .mockResolvedValueOnce({
        estado: 'autorizado',
        identidade: { usuario_id, session_id },
        ...credenciais,
        geracao: 2,
      });
    const consultar = async (_: unknown, consulta: { request_id: string }) => ({
      ok: true,
      request_id: consulta.request_id,
      dados: { itens: [], proximo_cursor: null },
    });
    const resposta = await criarHandlerCarteiraExperimental({
      autorizar,
      consultar,
      cursores,
      cifra,
    })(new Request('https://exemplo.test/api/pacientes?limite=1'));
    expect(resposta.status).toBe(401);
    expect(JSON.stringify(await resposta.json())).not.toContain('itens');
  });
  it('rejeita repetição de parâmetros sem consultar ou autorizar', async () => {
    const cursores = await criarCursorCarteira(new Uint8Array(32).fill(5));
    const autorizar = vi.fn();
    const consultar = vi.fn();
    const resposta = await criarHandlerCarteiraExperimental({
      autorizar,
      consultar,
      cursores,
      cifra,
    })(new Request('https://exemplo.test/api/pacientes?limite=1&limite=2'));
    expect(resposta.status).toBe(422);
    expect(autorizar).not.toHaveBeenCalled();
    expect(consultar).not.toHaveBeenCalled();
  });
  it('isola credenciais de requisições concorrentes sem serializá-las', async () => {
    const cursores = await criarCursorCarteira(new Uint8Array(32).fill(5));
    const barreira: Array<() => void> = [];
    const consultar = vi.fn(
      async (
        contexto: { jwt: string; prova: string; geracao: number },
        consulta: { request_id: string },
      ) => {
        expect(JSON.stringify(contexto)).not.toContain(contexto.jwt);
        expect(JSON.stringify(contexto)).not.toContain(contexto.prova);
        await new Promise<void>((resolve) => {
          barreira.push(resolve);
          if (barreira.length === 2) for (const liberar of barreira) liberar();
        });
        return {
          ok: true,
          request_id: consulta.request_id,
          dados: { itens: [], proximo_cursor: null },
        };
      },
    );
    const handler = criarHandlerCarteiraExperimental({
      autorizar: async (request) => ({
        estado: 'autorizado',
        identidade: { usuario_id, session_id },
        jwt: request.headers.get('x-fixture') ?? '',
        prova: 'A'.repeat(43),
        geracao: 1,
      }),
      consultar,
      cursores,
      cifra,
    });
    const resposta = await Promise.all(
      ['jwt-um', 'jwt-dois'].map((jwt) =>
        handler(
          new Request('https://exemplo.test/api/pacientes?limite=1', {
            headers: { 'x-fixture': jwt },
          }),
        ),
      ),
    );
    expect(resposta.map((item) => item.status)).toEqual([200, 200]);
    expect(consultar.mock.calls.map(([contexto]) => contexto.jwt).sort()).toEqual([
      'jwt-dois',
      'jwt-um',
    ]);
  });
});
