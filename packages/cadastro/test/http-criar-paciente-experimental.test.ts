import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.js';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.js';
import { executarCriacaoPacienteExperimental } from '../src/executor-paciente-experimental.js';
import { criarHandlerCriarPacienteExperimental } from '../src/http-criar-paciente-experimental.js';

const caminho = 'https://app.example.test/api/pacientes';
const reserva = { reserva_id: 'd0000000-0000-4000-8000-000000000001', geracao_reserva: 1 };
const pedido = (body = JSON.stringify({ entrada: { nome: 'Paciente fictício' }, ...reserva })) =>
  new Request(caminho, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-chave-idempotencia': 'chave_ficticia_123456',
      'x-ffcm-prova-sessao': 'A'.repeat(43),
      'x-ffcm-geracao-sessao': '1',
    },
    body,
  });

describe('borda experimental de criação de paciente', () => {
  it('não inicia operação quando autorização de sessão, origem ou CSRF é negada', async () => {
    const executar = vi.fn();
    const resposta = await criarHandlerCriarPacienteExperimental({
      autorizar: async () => ({ estado: 'nao_autenticado' }),
      executar,
      revalidar: async () => true,
    })(pedido());
    expect(resposta.status).toBe(401);
    expect(executar).not.toHaveBeenCalled();
  });

  it('trata falha depois de iniciar execução como incerta, sem repetir ou expor dados', async () => {
    const executar = vi.fn(async () => {
      throw new Error('Paciente fictício');
    });
    const resposta = await criarHandlerCriarPacienteExperimental({
      autorizar: async () => ({ estado: 'autorizado', contexto: {} }),
      executar,
      revalidar: async () => true,
    })(pedido());
    expect(resposta.status).toBe(503);
    expect(resposta.headers.get('cache-control')).toBe('no-store');
    const erro = await resposta.json();
    expect(erro.erro.codigo).toBe('pendencia_externa');
    expect(JSON.stringify(erro)).not.toContain('Paciente fictício');
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it('retorna cadastro validado somente após revalidar a autorização', async () => {
    const executar = vi.fn(async (_solicitacao, _contexto, request_id: string) => ({
      ok: true,
      request_id,
      dados: {
        id: '10000000-0000-4000-8000-000000000001',
        nome: 'Paciente fictício',
        nome_preferencia: null,
        data_nascimento: null,
        contatos: [],
        versao: 1,
      },
    }));
    const revalidar = vi.fn(async () => true);
    const handler = criarHandlerCriarPacienteExperimental({
      autorizar: async () => ({ estado: 'autorizado', contexto: {} }),
      executar,
      revalidar,
    });
    const resposta = await handler(pedido());
    expect(resposta.status).toBe(200);
    expect((await resposta.json()).dados.nome).toBe('Paciente fictício');
    expect(revalidar).toHaveBeenCalledTimes(1);
    revalidar.mockResolvedValue(false);
    const negada = await handler(pedido());
    expect(negada.status).toBe(503);
    expect(JSON.stringify(await negada.json())).not.toContain('Paciente fictício');
  });

  it('rejeita corpo inválido ou grande antes da autorização e da mutação', async () => {
    const autorizar = vi.fn();
    const executar = vi.fn();
    const handler = criarHandlerCriarPacienteExperimental({
      autorizar,
      executar,
      revalidar: async () => true,
    });
    expect(
      (await handler(pedido(JSON.stringify({ entrada: { nome: '' }, ...reserva })))).status,
    ).toBe(422);
    expect(
      (
        await handler(
          pedido(
            JSON.stringify({
              entrada: { nome: 'Paciente fictício' },
              ...reserva,
              geracao_reserva: 0,
            }),
          ),
        )
      ).status,
    ).toBe(422);
    expect((await handler(pedido('x'.repeat(16_385)))).status).toBe(422);
    expect(autorizar).not.toHaveBeenCalled();
    expect(executar).not.toHaveBeenCalled();
  });

  it('compõe a borda com o executor e a cifra reais, usando reserva e RPC fictícias', async () => {
    const cifra = criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
      chaveHmac: new Uint8Array(32).fill(2),
    });
    const atestador = criarAtestadorOperacao({
      keyId: 'atestado',
      chave: new Uint8Array(32).fill(3),
    });
    const handler = criarHandlerCriarPacienteExperimental({
      autorizar: async () => ({ estado: 'autorizado', contexto: {} }),
      revalidar: async () => true,
      executar: async (solicitacao, _, request_id, reservaRecebida) =>
        executarCriacaoPacienteExperimental(
          solicitacao,
          {
            key_id: 'atestado',
            usuario_id: '10000000-0000-4000-8000-000000000001',
            session_id: '10000000-0000-4000-8000-000000000002',
            request_id,
            emitido_em: '2026-10-29T12:00:00Z',
            expira_em: '2026-10-29T12:01:00Z',
          },
          {
            cifra,
            atestador,
            reserva: reservaRecebida,
            idempotencia: {
              async calcularDigestIdempotencia(valor) {
                return createHmac('sha256', Buffer.alloc(32, 4)).update(valor).digest('base64url');
              },
            },
            rpc: {
              async executar(transporte) {
                const entrada = transporte.p_entrada.entrada;
                expect(entrada).toMatchObject(reserva);
                expect(entrada.chave_idempotencia).toBe('chave_ficticia_123456');
                expect(JSON.stringify(entrada)).not.toContain('Paciente fictício');
                return {
                  ok: true,
                  request_id,
                  dados: {
                    paciente_id: entrada.paciente_id,
                    nome: entrada.nome,
                    nome_preferencia: null,
                    data_nascimento: null,
                    contatos: [],
                    versao: 1,
                  },
                };
              },
            },
          },
        ),
    });
    const resposta = await handler(pedido());
    expect(resposta.status).toBe(200);
    expect((await resposta.json()).dados.nome).toBe('Paciente fictício');
  });

  it('não inicia mutação quando autorização só termina após o prazo', async () => {
    vi.useFakeTimers();
    try {
      let liberar!: () => void;
      let iniciou!: () => void;
      const inicio = new Promise<void>((resolve) => {
        iniciou = resolve;
      });
      const espera = new Promise<void>((resolve) => {
        liberar = resolve;
      });
      const executar = vi.fn();
      const handler = criarHandlerCriarPacienteExperimental({
        autorizar: async () => {
          iniciou();
          await espera;
          return { estado: 'autorizado', contexto: {} };
        },
        executar,
        revalidar: async () => true,
      });
      const pendente = handler(pedido());
      await inicio;
      await vi.advanceTimersByTimeAsync(15_001);
      expect((await pendente).status).toBe(503);
      liberar();
      await vi.advanceTimersByTimeAsync(0);
      expect(executar).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('só trata negativa da execução como definitiva se a resposta for estrita e correlacionada', async () => {
    const autorizar = async () => ({ estado: 'autorizado' as const, contexto: {} });
    const negada = criarHandlerCriarPacienteExperimental({
      autorizar,
      revalidar: async () => true,
      executar: async (_, __, request_id) => ({
        ok: false,
        request_id,
        erro: { codigo: 'sem_permissao' },
      }),
    });
    expect((await negada(pedido())).status).toBe(403);
    const invalida = criarHandlerCriarPacienteExperimental({
      autorizar,
      revalidar: async () => true,
      executar: async (_, __, request_id) => ({
        ok: false,
        request_id,
        erro: { codigo: 'sem_permissao', detalhe: 'Paciente fictício' },
      }),
    });
    const resposta = await invalida(pedido());
    expect(resposta.status).toBe(503);
    expect(JSON.stringify(await resposta.json())).not.toContain('Paciente fictício');
  });

  it('não inicia mutação se revalidação obrigatória não estiver configurada', async () => {
    const executar = vi.fn();
    const portas = {
      autorizar: async () => ({ estado: 'autorizado' as const, contexto: {} }),
      executar,
    };
    const handler = criarHandlerCriarPacienteExperimental(
      portas as unknown as Parameters<typeof criarHandlerCriarPacienteExperimental>[0],
    );
    const resposta = await handler(pedido());
    expect(resposta.status).toBe(503);
    expect((await resposta.json()).erro.codigo).toBe('configuracao_indisponivel');
    expect(executar).not.toHaveBeenCalled();
  });

  it('retorna pendência se execução ultrapassa prazo, mesmo que conclua depois', async () => {
    vi.useFakeTimers();
    try {
      let liberar!: () => void;
      let iniciou!: () => void;
      let terminou = false;
      const inicio = new Promise<void>((resolve) => {
        iniciou = resolve;
      });
      const espera = new Promise<void>((resolve) => {
        liberar = resolve;
      });
      const revalidar = vi.fn(async () => true);
      const executar = vi.fn(async () => {
        iniciou();
        await espera;
        terminou = true;
        return {};
      });
      const handler = criarHandlerCriarPacienteExperimental({
        autorizar: async () => ({ estado: 'autorizado', contexto: {} }),
        executar,
        revalidar,
      });
      const pendente = handler(pedido());
      await inicio;
      await vi.advanceTimersByTimeAsync(15_001);
      const resposta = await pendente;
      expect(resposta.status).toBe(503);
      expect((await resposta.json()).erro.codigo).toBe('pendencia_externa');
      liberar();
      await vi.advanceTimersByTimeAsync(0);
      expect(terminou).toBe(true);
      expect(executar).toHaveBeenCalledTimes(1);
      expect(revalidar).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retorna pendência sem expor paciente se revalidação excede o prazo', async () => {
    vi.useFakeTimers();
    try {
      let liberar!: () => void;
      let iniciou!: () => void;
      const inicio = new Promise<void>((resolve) => {
        iniciou = resolve;
      });
      const espera = new Promise<void>((resolve) => {
        liberar = resolve;
      });
      const handler = criarHandlerCriarPacienteExperimental({
        autorizar: async () => ({ estado: 'autorizado', contexto: {} }),
        executar: async (_, __, request_id) => ({
          ok: true,
          request_id,
          dados: {
            id: '10000000-0000-4000-8000-000000000001',
            nome: 'Paciente fictício',
            nome_preferencia: null,
            data_nascimento: null,
            contatos: [],
            versao: 1,
          },
        }),
        revalidar: async () => {
          iniciou();
          await espera;
          return true;
        },
      });
      const pendente = handler(pedido());
      await inicio;
      await vi.advanceTimersByTimeAsync(15_001);
      const resposta = await pendente;
      expect(resposta.status).toBe(503);
      const corpo = await resposta.json();
      expect(corpo.erro.codigo).toBe('pendencia_externa');
      expect(JSON.stringify(corpo)).not.toContain('Paciente fictício');
      liberar();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancela leitura do corpo lento ao expirar, sem iniciar operação', async () => {
    vi.useFakeTimers();
    try {
      let leu!: () => void;
      const inicio = new Promise<void>((resolve) => {
        leu = resolve;
      });
      const cancelar = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        pull() {
          leu();
        },
        cancel: cancelar,
      });
      const executar = vi.fn();
      const autorizar = vi.fn();
      const handler = criarHandlerCriarPacienteExperimental({
        autorizar,
        executar,
        revalidar: async () => true,
      });
      const request = new Request(caminho, {
        method: 'POST',
        headers: pedido().headers,
        body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' });
      const pendente = handler(request);
      await inicio;
      await vi.advanceTimersByTimeAsync(15_001);
      const resposta = await pendente;
      expect(resposta.status).toBe(503);
      expect((await resposta.json()).erro.codigo).toBe('servico_indisponivel');
      expect(cancelar).toHaveBeenCalledTimes(1);
      expect(autorizar).not.toHaveBeenCalled();
      expect(executar).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
