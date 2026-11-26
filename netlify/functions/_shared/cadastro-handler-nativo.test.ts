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
/** Caso novo completo e fictício: todos os campos do contrato são obrigatórios. */
const casoNovo = {
  nome: 'Paciente fictício',
  nome_preferencia: 'Nome fictício',
  data_nascimento: '2000-01-01',
  contatos: [
    { tipo: 'email', valor: 'paciente.ficticio@exemplo.test' },
    { tipo: 'telefone', valor: '+55 11 90000-0000' },
  ],
  situacao: 'entrada',
  responsavel_id: 'e0000000-0000-4000-8000-000000000001',
};
const pedido = (nome = 'Paciente fictício') =>
  new Request('https://exemplo.test/api/pacientes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sessao': identidade.session_id,
      'x-chave-idempotencia': 'chave_ficticia_123456',
    },
    body: JSON.stringify({ entrada: { ...casoNovo, nome }, ...reserva }),
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
          p_entrada: {
            entrada: {
              request_id: string;
              paciente_id: string;
              nome: unknown;
              nome_preferencia: unknown;
              data_nascimento: unknown;
              contatos: { contato_id: string; tipo: string; valor: unknown }[];
              situacao: string;
              responsavel_id: string;
            };
          };
        },
      ) => {
        const entrada = transporte.p_entrada.entrada;
        for (const claro of ['Paciente fictício', 'Nome fictício', 'ficticio@exemplo.test'])
          expect(JSON.stringify(transporte)).not.toContain(claro);
        expect(entrada.situacao).toBe(casoNovo.situacao);
        expect(entrada.responsavel_id).toBe(casoNovo.responsavel_id);
        expect(entrada.contatos).toHaveLength(casoNovo.contatos.length);
        return {
          ok: true,
          request_id: entrada.request_id,
          dados: {
            paciente_id: entrada.paciente_id,
            nome: entrada.nome,
            nome_preferencia: entrada.nome_preferencia,
            data_nascimento: entrada.data_nascimento,
            contatos: entrada.contatos.map(({ contato_id, tipo, valor }) => ({
              contato_id,
              tipo,
              valor,
              versao: 1,
            })),
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
    const { dados } = await resposta.json();
    expect(dados).toMatchObject({
      nome: 'Paciente fictício',
      nome_preferencia: 'Nome fictício',
      data_nascimento: '2000-01-01',
    });
    expect(dados.contatos.map((c: { tipo: string; valor: string }) => [c.tipo, c.valor])).toEqual(
      casoNovo.contatos.map((c) => [c.tipo, c.valor]),
    );
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
      { entrada: casoNovo },
      { entrada: casoNovo, ...reserva, geracao_reserva: 0 },
      { entrada: casoNovo, ...reserva, reserva_id: 'inválido' },
      { entrada: casoNovo, ...reserva, extra: true },
      // Cadastro antigo, somente com nome, e caso novo sem contatos ou sem responsável.
      { entrada: { nome: 'Paciente fictício' }, ...reserva },
      { entrada: { ...casoNovo, contatos: [] }, ...reserva },
      { entrada: { ...casoNovo, responsavel_id: undefined }, ...reserva },
    ]) {
      const dependencias = portas();
      const autorizar = vi.fn(dependencias.autorizar);
      const request = new Request(pedido(), { body: JSON.stringify(corpo) });
      expect((await criarPacienteNativo(request, { ...dependencias, autorizar })).status).toBe(422);
      expect(autorizar).not.toHaveBeenCalled();
      expect(dependencias.executar).not.toHaveBeenCalled();
    }
  });
  it('responde 422 responsavel_invalido quando o banco recusa o responsável, sem tratá-lo como incerto', async () => {
    const dependencias = portas();
    const recusa = await criarPacienteNativo(pedido(), {
      ...dependencias,
      executar: async (_request, transporte) => ({
        ok: false,
        request_id: transporte.p_entrada.entrada.request_id,
        erro: { codigo: 'responsavel_invalido' },
      }),
    });
    expect(recusa.status).toBe(422);
    const texto = await recusa.text();
    expect(JSON.parse(texto).erro.codigo).toBe('responsavel_invalido');
    expect(texto).not.toContain(casoNovo.responsavel_id);
    expect(texto).not.toContain('Paciente fictício');
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
