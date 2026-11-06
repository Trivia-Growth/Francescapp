import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarPacienteNativo } from './cadastro-handler-nativo.ts';

const identidade = {
  usuario_id: 'a0000000-0000-4000-8000-000000000001',
  session_id: 'b0000000-0000-4000-8000-000000000002',
};
const reserva = { reserva_id: 'd0000000-0000-4000-8000-000000000001', geracao_reserva: 1 };
const pedido = (nome = 'Paciente fictício') =>
  new Request('https://exemplo.test/api/pacientes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sessao': identidade.session_id,
      'x-chave-idempotencia': 'chave_ficticia_123456',
    },
    body: JSON.stringify({ entrada: { nome }, ...reserva }),
  });
function portas() {
  const autorizado = async () => ({ estado: 'autorizado' as const, identidade });
  return {
    autorizar: autorizado,
    revalidar: autorizado,
    metadados: () => ({
      key_id: 'teste',
      emitido_em: '2026-10-29T12:00:00Z',
      expira_em: '2026-10-29T12:01:00Z',
    }),
    cifra: criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
      chaveHmac: new Uint8Array(32).fill(2),
    }),
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    idempotencia: {
      async calcularDigestIdempotencia(valor: string) {
        return createHmac('sha256', Buffer.alloc(32, 4)).update(valor).digest('base64url');
      },
    },
    executar: vi.fn(
      async (
        _request: Request,
        transporte: {
          p_entrada: { entrada: { request_id: string; paciente_id: string; nome: unknown } };
        },
      ) => {
        const entrada = transporte.p_entrada.entrada;
        expect(JSON.stringify(transporte)).not.toContain('Paciente fictício');
        return {
          ok: true,
          request_id: entrada.request_id,
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
    ),
  };
}
describe('cadastro com sessão nativa', () => {
  it('não executa com solicitação cancelada antes da leitura ou durante autorização', async () => {
    const antes = new AbortController();
    antes.abort();
    const dependencias = portas();
    const cancelada = new Request(pedido(), { signal: antes.signal });
    expect((await (await criarPacienteNativo(cancelada, dependencias)).json()).erro.codigo).toBe(
      'servico_indisponivel',
    );
    let iniciar!: () => void;
    let liberar!: () => void;
    const inicio = new Promise<void>((resolve) => {
      iniciar = resolve;
    });
    const espera = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const durante = new AbortController();
    const resposta = criarPacienteNativo(new Request(pedido(), { signal: durante.signal }), {
      ...dependencias,
      autorizar: async () => {
        iniciar();
        await espera;
        return { estado: 'autorizado' as const, identidade };
      },
    });
    await inicio;
    durante.abort();
    expect((await (await resposta).json()).erro.codigo).toBe('servico_indisponivel');
    liberar();
    await Promise.resolve();
    expect(dependencias.executar).not.toHaveBeenCalled();
  });
  it('considera incerta criação já enviada quando cliente cancela', async () => {
    let iniciar!: () => void;
    const inicio = new Promise<void>((resolve) => {
      iniciar = resolve;
    });
    const controle = new AbortController();
    const resposta = criarPacienteNativo(new Request(pedido(), { signal: controle.signal }), {
      ...portas(),
      executar: async () => {
        iniciar();
        return new Promise(() => {});
      },
    });
    await inicio;
    controle.abort();
    expect((await (await resposta).json()).erro.codigo).toBe('pendencia_externa');
  });
  it('não inicia RPC se preparação terminar depois do prazo', async () => {
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
      const dependencias = portas();
      const resposta = criarPacienteNativo(pedido(), {
        ...dependencias,
        idempotencia: {
          calcularDigestIdempotencia: async () => {
            iniciou();
            await espera;
            return 'ficticio';
          },
        },
      });
      await inicio;
      await vi.advanceTimersByTimeAsync(15_001);
      const corpo = await (await resposta).json();
      expect(corpo.erro.codigo).toBe('servico_indisponivel');
      liberar();
      await vi.advanceTimersByTimeAsync(0);
      expect(dependencias.executar).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('considera criação incerta quando resposta se perde, mas não antes de executá-la', async () => {
    const dependencias = portas();
    const falha = await criarPacienteNativo(pedido(), {
      ...dependencias,
      executar: async () => {
        throw new Error('resposta perdida');
      },
    });
    expect((await falha.json()).erro.codigo).toBe('pendencia_externa');
    const anterior = await criarPacienteNativo(pedido(), {
      ...dependencias,
      autorizar: async () => {
        throw new Error('indisponível');
      },
    });
    expect((await anterior.json()).erro.codigo).toBe('servico_indisponivel');
  });
  it('cifra e atesta antes de executar e retorna o paciente autorizado', async () => {
    const dependencias = portas();
    const resposta = await criarPacienteNativo(pedido(), dependencias);
    expect(resposta.status).toBe(200);
    expect(dependencias.executar.mock.calls[0]?.[1].p_entrada.entrada).toMatchObject(reserva);
    expect((await resposta.json()).dados.nome).toBe('Paciente fictício');
    expect(resposta.headers.get('cache-control')).toContain('no-store');
  });
  it('recusa DTO e sessão inválidos antes da mutação', async () => {
    const dependencias = portas();
    expect((await criarPacienteNativo(pedido(''), dependencias)).status).toBe(422);
    expect(
      (
        await criarPacienteNativo(pedido(), {
          ...dependencias,
          autorizar: async () => ({ estado: 'nao_autenticado' }),
        })
      ).status,
    ).toBe(401);
    expect(dependencias.executar).not.toHaveBeenCalled();
  });
  it('recusa reserva ausente, inválida ou campos adicionais antes de autorizar', async () => {
    for (const corpo of [
      { entrada: { nome: 'Paciente fictício' } },
      { entrada: { nome: 'Paciente fictício' }, ...reserva, geracao_reserva: 0 },
      { entrada: { nome: 'Paciente fictício' }, ...reserva, reserva_id: 'inválido' },
      { entrada: { nome: 'Paciente fictício' }, ...reserva, extra: true },
    ]) {
      const dependencias = portas();
      const autorizar = vi.fn(dependencias.autorizar);
      const request = new Request(pedido(), { body: JSON.stringify(corpo) });
      expect((await criarPacienteNativo(request, { ...dependencias, autorizar })).status).toBe(422);
      expect(autorizar).not.toHaveBeenCalled();
      expect(dependencias.executar).not.toHaveBeenCalled();
    }
  });
  it('não divulga dados após revogação e trata falha da RPC como incerta', async () => {
    const resposta = await criarPacienteNativo(pedido(), {
      ...portas(),
      revalidar: async () => ({ estado: 'nao_autenticado' }),
    });
    expect((await resposta.json()).erro.codigo).toBe('pendencia_externa');
    const falha = await criarPacienteNativo(pedido(), {
      ...portas(),
      executar: async () => {
        throw new Error('Paciente fictício');
      },
    });
    const texto = await falha.text();
    expect(texto).toContain('pendencia_externa');
    expect(texto).not.toContain('Paciente fictício');
  });
});
