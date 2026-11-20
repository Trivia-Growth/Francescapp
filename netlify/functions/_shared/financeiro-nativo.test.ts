import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import {
  criarCifraAutenticada,
  ErroCifraAutenticada,
} from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import {
  nomeObjetoComprovante,
  operarFinanceiroNativo,
  type ComandoFinanceiro,
  type PortasFinanceiras,
} from './financeiro-nativo.ts';

/** Dados fictícios. Nenhum valor, nome, caso ou documento real. */
const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
const paciente_id = 'c0000000-0000-4000-8000-000000000003';
const despesa_id = 'd0000000-0000-4000-8000-000000000004';
const profissional_id = 'e0000000-0000-4000-8000-000000000005';
const valor_id = 'f0000000-0000-4000-8000-000000000006';
const chave = '11111111-1111-4111-8111-111111111111';

/** Cifra de produção com chaves fictícias — não é dublê. `criarCifraAutenticada` é a mesma
 * função que a composição usa, com o mesmo canonicalizador de AAD, o mesmo AES-GCM e o mesmo
 * HMAC de idempotência. O que estes testes passam a exercitar de verdade é a ida e volta pelo
 * caminho de produção: um AAD que o canonicalizador recusar derruba o teste aqui, e não só em
 * produção. As propriedades do próprio AAD estão em `cifra-financeira.test.ts`. */
function cifraDeTeste() {
  return criarCifraAutenticada({
    keyIdAtiva: 'fin-v1',
    chavesDeCifra: { 'fin-v1': new Uint8Array(32).fill(7) },
    chaveHmac: new Uint8Array(32).fill(23),
  });
}

type RespostaFalsa = (entrada: Record<string, unknown>, chamada: number) => unknown;

function preparar(opcoes: {
  responder: RespostaFalsa;
  obter?: () => Promise<Uint8Array>;
  enviar?: () => Promise<'criado' | 'existente'>;
  autorizado?: boolean;
  cifraQuebrada?: boolean;
}) {
  const real = cifraDeTeste();
  const cifra = opcoes.cifraQuebrada
    ? {
        ...real,
        cifrar: async () => {
          throw new ErroCifraAutenticada();
        },
      }
    : real;
  let chamadas = 0;
  const executar = vi.fn(
    async (
      _wrapper: string,
      transporte: { p_transporte: { entrada: Record<string, unknown> } },
    ) => {
      chamadas += 1;
      return opcoes.responder(transporte.p_transporte.entrada, chamadas);
    },
  );
  const obter = vi.fn(opcoes.obter ?? (async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 1])));
  const enviar = vi.fn(opcoes.enviar ?? (async () => 'criado' as const));
  const autorizacao = async () =>
    opcoes.autorizado === false
      ? ({ estado: 'nao_autenticado' } as const)
      : ({ estado: 'autorizado', identidade: { usuario_id, session_id } } as const);
  const portas: PortasFinanceiras = {
    cifra,
    idempotencia: criarIdempotenciaNativa(cifra),
    executar: executar as unknown as PortasFinanceiras['executar'],
    autorizar: autorizacao,
    revalidar: autorizacao,
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-11-19T12:00:00Z',
      expira_em: '2026-11-19T12:00:30Z',
    }),
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    storage: { obter, enviar },
  };
  const request = new Request('https://exemplo.test/', {
    headers: { 'x-sessao': session_id, 'x-chave-idempotencia': chave },
  });
  return { portas, request, executar, obter, enviar };
}

const linhaDespesa = (cifrado: unknown, extra: Record<string, unknown> = {}) => ({
  // `id` é a chave primária da linha; na versão 1 o banco grava `id = despesa_id`.
  id: despesa_id,
  despesa_id,
  versao: 1,
  paciente_id,
  descricao_cifrada: cifrado,
  valor_centavos: 12_345,
  data: '2026-11-10',
  responsavel_usuario_id: usuario_id,
  autorizacao_cifrada: cifrado,
  comprovante_objeto_nome: nomeObjetoComprovante(despesa_id),
  motivo_retificacao_cifrado: null,
  autor_usuario_id: usuario_id,
  registrado_em: '2026-11-10T12:00:00.000Z',
  ...extra,
});

const comandoDespesa: ComandoFinanceiro = {
  operacao: 'registrarDespesa',
  despesa_id,
  paciente_id,
  descricao: 'Transporte fictício',
  valor_centavos: 12_345,
  data: '2026-11-10',
  responsavel_usuario_id: usuario_id,
  autorizacao: 'Autorização fictícia da coordenação',
  comprovante: {
    objeto_nome: nomeObjetoComprovante(despesa_id),
    mime_type: 'application/pdf',
    tamanho_bytes: 5,
    digest: 'digest-ficticio',
  },
};

const superficies: readonly { nome: string; comando: ComandoFinanceiro }[] = [
  {
    nome: 'valor acordado (consulta)',
    comando: { operacao: 'consultarValores', profissional_usuario_id: profissional_id },
  },
  {
    nome: 'valor acordado (registro)',
    comando: {
      operacao: 'registrarValor',
      valor_id,
      profissional_usuario_id: profissional_id,
      valor_turno_centavos: 20_000,
      vigencia: { inicio: '2026-11-01', fim: null },
      motivo: 'Motivo fictício',
    },
  },
  { nome: 'despesa (registro)', comando: comandoDespesa },
  { nome: 'despesa (consulta)', comando: { operacao: 'consultarDespesas', paciente_id } },
  {
    nome: 'apuração de repasse',
    comando: {
      operacao: 'consultarApuracao',
      profissional_usuario_id: profissional_id,
      periodo_inicio: '2026-11-01',
      periodo_fim: '2026-11-30',
    },
  },
  { nome: 'comprovante', comando: { operacao: 'lerComprovante', paciente_id, despesa_id } },
];

describe('matriz de autorização no servidor (tarefa 5.1)', () => {
  // Esta é a METADE DE SERVIDOR da matriz. A decisão de audiência é do banco — provada em
  // `supabase/tests/financeiro_*_local.sql` —, e o que se prova aqui é que o handler repassa
  // a negativa sem inventar dado, sem cair em outro código e sem devolver conteúdo nenhum.
  it.each(superficies)(
    'nega e não devolve dado quando o banco responde sem_permissao: $nome',
    async ({ comando }) => {
      const { portas, request, obter } = preparar({
        responder: (entrada) => ({
          ok: false,
          erro: { codigo: 'sem_permissao' },
          request_id: entrada.request_id,
        }),
      });
      const resultado = await operarFinanceiroNativo(request, comando, portas);
      expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
      expect(resultado).not.toHaveProperty('dados');
      expect(obter).not.toHaveBeenCalled();
    },
  );

  it.each(superficies)(
    'nega sem tocar no banco quando a sessão caiu: $nome',
    async ({ comando }) => {
      const { portas, request, executar } = preparar({
        autorizado: false,
        responder: () => {
          throw new Error('não deveria chegar ao banco');
        },
      });
      const resultado = await operarFinanceiroNativo(request, comando, portas);
      expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'nao_autenticado' } });
      expect(executar).not.toHaveBeenCalled();
    },
  );

  it('permite quando o banco confirma a audiência financeira', async () => {
    const { portas, request } = preparar({
      responder: (entrada) => ({
        ok: true,
        request_id: entrada.request_id,
        dados: {
          origem: 'consulta_aberta',
          consultado_em: '2026-11-19T12:00:10.000Z',
          profissional_usuario_id: profissional_id,
          periodo_inicio: '2026-11-01',
          periodo_fim: '2026-11-30',
          linhas: [],
          total_centavos: 0,
          pendentes: 0,
        },
      }),
    });
    const resultado = await operarFinanceiroNativo(
      request,
      {
        operacao: 'consultarApuracao',
        profissional_usuario_id: profissional_id,
        periodo_inicio: '2026-11-01',
        periodo_fim: '2026-11-30',
      },
      portas,
    );
    expect(resultado.ok).toBe(true);
  });

  it('a sondagem de audiência devolve só o booleano, nunca valores', async () => {
    const cifrado = await cifraDeTeste().cifrar('Motivo fictício', {
      tabela: 'financeiro.valor_acordado_turno',
      registro_id: valor_id,
      campo: 'motivo',
      formato: 1,
    });
    const { portas, request } = preparar({
      responder: (entrada) => ({
        ok: true,
        request_id: entrada.request_id,
        dados: [
          {
            valor_id,
            profissional_usuario_id: usuario_id,
            valor_turno_centavos: 20_000,
            vigencia: { inicio: '2026-11-01', fim: null },
            motivo_cifrado: cifrado,
            autor_usuario_id: usuario_id,
            registrado_em: '2026-11-01T12:00:00.000Z',
          },
        ],
      }),
    });
    const resultado = await operarFinanceiroNativo(
      request,
      { operacao: 'consultarAudiencia' },
      portas,
    );
    expect(resultado).toMatchObject({ ok: true, dados: { permitida: true } });
    expect(JSON.stringify(resultado)).not.toContain('20000');
    expect(JSON.stringify(resultado)).not.toContain('Motivo');
  });

  it('a sondagem negada responde permitida=false, sem erro que revele a existência do recurso', async () => {
    const { portas, request } = preparar({
      responder: (entrada) => ({
        ok: false,
        erro: { codigo: 'sem_permissao' },
        request_id: entrada.request_id,
      }),
    });
    const resultado = await operarFinanceiroNativo(
      request,
      { operacao: 'consultarAudiencia' },
      portas,
    );
    expect(resultado).toMatchObject({ ok: true, dados: { permitida: false } });
  });
});

describe('falha de persistência na despesa (tarefa 2.7)', () => {
  it('não apresenta sucesso quando a gravação falha', async () => {
    const { portas, request } = preparar({
      responder: () => {
        throw new Error('banco indisponível');
      },
    });
    const resultado = await operarFinanceiroNativo(request, comandoDespesa, portas);
    // Escrita já iniciada: pendência, nunca sucesso e nunca "falhou, pode repetir à vontade".
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
    expect(resultado).not.toHaveProperty('dados');
  });

  it('a repetição com a mesma chave não duplica: o banco devolve conflito_idempotencia', async () => {
    const { portas, request, executar } = preparar({
      responder: (entrada) => ({
        ok: false,
        erro: { codigo: 'conflito_idempotencia' },
        request_id: entrada.request_id,
      }),
    });
    const resultado = await operarFinanceiroNativo(request, comandoDespesa, portas);
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'conflito_idempotencia' } });
    expect(resultado).not.toHaveProperty('dados');
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it('o digest de idempotência é o mesmo em duas tentativas do mesmo lançamento', async () => {
    const digests: unknown[] = [];
    const responder: RespostaFalsa = (entrada) => {
      digests.push(entrada.digest_idempotencia);
      return { ok: false, erro: { codigo: 'conflito' }, request_id: entrada.request_id };
    };
    const primeira = preparar({ responder });
    await operarFinanceiroNativo(primeira.request, comandoDespesa, primeira.portas);
    const segunda = preparar({ responder });
    await operarFinanceiroNativo(segunda.request, comandoDespesa, segunda.portas);
    expect(digests).toHaveLength(2);
    expect(digests[0]).toBe(digests[1]);
    // E o objeto do comprovante é o mesmo, então repetir não cria segundo arquivo.
    expect(nomeObjetoComprovante(despesa_id)).toBe(nomeObjetoComprovante(despesa_id.toUpperCase()));
  });

  it('recusa sem tocar no banco quando falta a chave de idempotência', async () => {
    const { portas, executar } = preparar({ responder: () => ({}) });
    const semChave = new Request('https://exemplo.test/', {
      headers: { 'x-sessao': session_id },
    });
    const resultado = await operarFinanceiroNativo(semChave, comandoDespesa, portas);
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
    expect(executar).not.toHaveBeenCalled();
  });
});

describe('entrega do comprovante por fluxo autorizado (tarefa 2.4)', () => {
  const cifra = cifraDeTeste();
  const comprovante = async (
    situacao: 'permitido' | 'negado' | 'revogado' | 'alterado' | 'ausente',
  ) => {
    const aad = {
      tabela: 'financeiro.despesa_lancamento',
      registro_id: despesa_id,
      campo: 'descricao',
      formato: 1,
    } as const;
    const descricao = await cifra.cifrar('Transporte fictício', aad);
    const autorizacao = await cifra.cifrar('Transporte fictício', {
      ...aad,
      campo: 'autorizacao',
    });
    return preparar({
      responder: (entrada, chamada) => {
        if (situacao === 'negado' || (situacao === 'revogado' && chamada === 2))
          return {
            ok: false,
            erro: { codigo: 'sem_permissao' },
            request_id: entrada.request_id,
          };
        const linha = linhaDespesa(descricao, {
          autorizacao_cifrada: autorizacao,
          ...(situacao === 'alterado' && chamada === 2
            ? { registrado_em: '2026-11-11T12:00:00.000Z' }
            : {}),
          ...(situacao === 'ausente' ? { comprovante_objeto_nome: null } : {}),
        });
        return { ok: true, request_id: entrada.request_id, dados: [linha] };
      },
    });
  };

  it('entrega os bytes só depois de duas leituras atestadas, com o I/O no meio', async () => {
    const { portas, request, executar, obter } = await comprovante('permitido');
    const resultado = await operarFinanceiroNativo(
      request,
      { operacao: 'lerComprovante', paciente_id, despesa_id },
      portas,
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error('entrega ausente');
    expect([...(resultado.dados as Uint8Array)]).toEqual([0x25, 0x50, 0x44, 0x46, 1]);
    expect(executar).toHaveBeenCalledTimes(2);
    expect(obter).toHaveBeenCalledExactlyOnceWith(nomeObjetoComprovante(despesa_id));
    expect(executar.mock.invocationCallOrder[0]).toBeLessThan(
      obter.mock.invocationCallOrder[0] ?? 0,
    );
    expect(obter.mock.invocationCallOrder[0]).toBeLessThan(
      executar.mock.invocationCallOrder[1] ?? 0,
    );
  });

  it('leitura negada não chega ao repositório nem devolve bytes', async () => {
    const { portas, request, obter } = await comprovante('negado');
    const resultado = await operarFinanceiroNativo(
      request,
      { operacao: 'lerComprovante', paciente_id, despesa_id },
      portas,
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    expect(obter).not.toHaveBeenCalled();
  });

  it('revogação da concessão durante o I/O nega a leitura e descarta os bytes', async () => {
    const { portas, request, executar, obter } = await comprovante('revogado');
    const resultado = await operarFinanceiroNativo(
      request,
      { operacao: 'lerComprovante', paciente_id, despesa_id },
      portas,
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    expect(resultado).not.toHaveProperty('dados');
    expect(executar).toHaveBeenCalledTimes(2);
    expect(obter).toHaveBeenCalledTimes(1);
  });

  it('lançamento alterado entre as duas leituras não entrega bytes antigos', async () => {
    const { portas, request } = await comprovante('alterado');
    const resultado = await operarFinanceiroNativo(
      request,
      { operacao: 'lerComprovante', paciente_id, despesa_id },
      portas,
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    expect(resultado).not.toHaveProperty('dados');
  });

  it('despesa sem comprovante responde nao_encontrado, sem ir ao repositório', async () => {
    const { portas, request, obter } = await comprovante('ausente');
    const resultado = await operarFinanceiroNativo(
      request,
      { operacao: 'lerComprovante', paciente_id, despesa_id },
      portas,
    );
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'nao_encontrado' } });
    expect(obter).not.toHaveBeenCalled();
  });

  it('nenhuma URL é emitida em qualquer caminho da entrega', async () => {
    const { portas, request } = await comprovante('permitido');
    const resultado = await operarFinanceiroNativo(
      request,
      { operacao: 'lerComprovante', paciente_id, despesa_id },
      portas,
    );
    expect(JSON.stringify(resultado)).not.toMatch(/https?:|signedUrl|publicUrl|token=/i);
  });
});

describe('a cifra do financeiro falha fechada (FR-069)', () => {
  // A cifra é a de produção; aqui ela é forçada a falhar. O que precisa valer é que a falha
  // vire recusa, não gravação em claro: a composição nem chega ao banco, e nenhum texto
  // pessoal ou de autorização aparece em qualquer lugar da resposta.
  const comandoValor: ComandoFinanceiro = {
    operacao: 'registrarValor',
    valor_id,
    profissional_usuario_id: profissional_id,
    valor_turno_centavos: 20_000,
    motivo: 'Motivo fictício do reajuste',
    vigencia: { inicio: '2026-11-01', fim: null },
  };

  it.each([
    { nome: 'despesa', comando: comandoDespesa, claros: ['Transporte fictício', 'Autorização'] },
    { nome: 'valor acordado', comando: comandoValor, claros: ['Motivo fictício do reajuste'] },
  ])('não grava nada em claro quando a cifra falha: $nome', async ({ comando, claros }) => {
    const { portas, request, executar } = preparar({
      cifraQuebrada: true,
      responder: () => {
        throw new Error('não deveria chegar ao banco');
      },
    });
    const resultado = await operarFinanceiroNativo(request, comando, portas);
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
    expect(resultado).not.toHaveProperty('dados');
    // Nenhuma chamada ao banco: não existe caminho em que o campo `_cifrado` receba texto.
    expect(executar).not.toHaveBeenCalled();
    for (const claro of claros) expect(JSON.stringify(resultado)).not.toContain(claro);
  });
});
