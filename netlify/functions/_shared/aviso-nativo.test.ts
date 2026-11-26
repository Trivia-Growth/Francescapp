import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { operarAvisoNativo } from './aviso-nativo.ts';

const usuario = '10000000-0000-4000-8000-000000000002';
const sessao = '20000000-0000-4000-8000-000000000002';
const paciente = '47000000-0000-4000-8000-000000000001';

const pedido = (chave?: string) =>
  new Request('https://exemplo.test/api/avisos', {
    headers: new Headers({
      'x-sessao': sessao,
      ...(chave ? { 'x-chave-idempotencia': chave } : {}),
    }),
  });

function portas(resposta: (requestId: string) => unknown, executar = vi.fn()) {
  const atestado = (dados: Record<string, unknown>) => ({ ...dados, mac: 'mac-ficticio' });
  return {
    executar,
    portas: {
      autorizar: async () => ({
        estado: 'autorizado' as const,
        identidade: { usuario_id: usuario, session_id: sessao },
      }),
      revalidar: async () => ({
        estado: 'autorizado' as const,
        identidade: { usuario_id: usuario, session_id: sessao },
      }),
      metadados: (requestId: string) => ({
        key_id: 'chave-ficticia',
        emitido_em: new Date(Date.now() - 1000).toISOString(),
        expira_em: new Date(Date.now() + 20_000).toISOString(),
        request_id: requestId,
      }),
      idempotencia: { calcularDigestIdempotencia: async () => 'd'.repeat(43) },
      atestador: {
        canonicalizar: (valor: unknown) => JSON.stringify(valor),
        atestarEntrada: async (dados: unknown, entrada: Record<string, unknown>) => {
          const dadosCanonicos = JSON.stringify({
            ...(dados as Record<string, unknown>),
            digest_entrada: 'e'.repeat(43),
          });
          return {
            entradaCanonica: JSON.stringify(entrada),
            dadosCanonicos,
            atestado: atestado(JSON.parse(dadosCanonicos) as Record<string, unknown>),
          };
        },
      },
      executar: async (
        _request: Request,
        transporte: {
          p_transporte: { entrada: Record<string, unknown> };
        },
      ) => {
        executar(transporte);
        const requestId = String(transporte.p_transporte.entrada.request_id);
        return resposta(requestId);
      },
    },
  };
}

it('lista avisos sem pedir paciente e sem qualquer saída do aplicativo', async () => {
  const fetchEspiao = vi.fn(() => Promise.reject(new Error('rede proibida')));
  vi.stubGlobal('fetch', fetchEspiao);
  const { portas: p, executar } = portas((request_id) => ({
    ok: true,
    repeticao: false,
    request_id,
    dados: {
      itens: [
        {
          tipo: 'passagem_sem_ciencia',
          paciente_id: paciente,
          chave_origem: 'passagem:1',
          instante: '2026-11-19T10:00:00.000Z',
          destinatario_usuario_id: usuario,
          por_substituicao: false,
          lido: false,
          motivo: null,
        },
      ],
      nao_lidos: 1,
    },
  }));
  const resultado = await operarAvisoNativo(pedido(), { operacao: 'listar' }, p);
  expect(resultado.ok).toBe(true);
  // A entrada da listagem carrega só o identificador da requisição: o destinatário é a
  // pessoa autenticada, decidida no banco, e nunca um parâmetro vindo do cliente.
  expect(Object.keys(executar.mock.calls[0]?.[0].p_transporte.entrada ?? {}).sort()).toEqual([
    'atestado',
    'request_id',
  ]);
  expect(fetchEspiao).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('recusa resposta cujo indicador não corresponde aos itens devolvidos', async () => {
  const { portas: p } = portas((request_id) => ({
    ok: true,
    repeticao: false,
    request_id,
    dados: { itens: [], nao_lidos: 7 },
  }));
  const resultado = await operarAvisoNativo(pedido(), { operacao: 'listar' }, p);
  expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
});

it('exige chave de idempotência e corpo válido para marcar como lido', async () => {
  const { portas: p } = portas((request_id) => ({
    ok: true,
    repeticao: false,
    request_id,
    dados: { itens: [], nao_lidos: 0 },
  }));
  const semChave = await operarAvisoNativo(
    pedido(),
    {
      operacao: 'marcar_lido',
      paciente_id: paciente,
      tipo: 'relato_em_atencao',
      chave_origem: 'relato:1',
    },
    p,
  );
  expect(semChave).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
  const tipoInvalido = await operarAvisoNativo(
    pedido(crypto.randomUUID()),
    { operacao: 'marcar_lido', paciente_id: paciente, tipo: 'inventado', chave_origem: 'x' },
    p,
  );
  expect(tipoInvalido).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
});

it('não tem porta de envio externo nem registro de dispositivo no servidor da fatia', () => {
  // Decisão 0.3: nenhuma notificação sai do aplicativo. Qualquer chamada externa é achado.
  for (const caminho of [
    'netlify/functions/avisos.ts',
    'netlify/functions/_shared/aviso-nativo.ts',
    'netlify/functions/_shared/entrada-aviso-nativa.ts',
    'netlify/functions/_shared/executor-aviso-nativo.ts',
    'supabase/migrations/20261126300000_avisos_no_app.sql',
  ]) {
    const fonte = readFileSync(caminho, 'utf8');
    expect(fonte).not.toMatch(/fetch\(|pg_net|smtp|webhook|device_token|firebase|whatsapp/i);
  }
});
