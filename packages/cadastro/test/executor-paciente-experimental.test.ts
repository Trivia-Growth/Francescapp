/// <reference lib="dom" />

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.js';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.js';
import { executarCriacaoPacienteExperimental } from '../src/executor-paciente-experimental.js';

const cifra = criarCifraAutenticada({
  keyIdAtiva: 'teste',
  chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
  chaveHmac: new Uint8Array(32).fill(2),
});
const atestador = criarAtestadorOperacao({ keyId: 'atestado', chave: new Uint8Array(32).fill(3) });
const reserva = { reserva_id: 'd0000000-0000-4000-8000-000000000001', geracao_reserva: 1 };
const idempotencia = {
  async calcularDigestIdempotencia(valor: string) {
    return createHmac('sha256', Buffer.alloc(32, 4)).update(valor).digest('base64url');
  },
};
const contexto = {
  key_id: 'atestado',
  usuario_id: '10000000-0000-4000-8000-000000000001',
  session_id: '10000000-0000-4000-8000-000000000002',
  request_id: '10000000-0000-4000-8000-000000000003',
  emitido_em: '2026-10-29T12:00:00Z',
  expira_em: '2026-10-29T12:01:00Z',
};

describe('executor experimental de criação', () => {
  it('não chama RPC quando não recebe reserva interna', async () => {
    let chamadas = 0;
    await expect(
      executarCriacaoPacienteExperimental(
        {
          corpo: { nome: 'Pessoa fictícia' },
          cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
        },
        contexto,
        {
          cifra,
          atestador,
          idempotencia,
          reserva: undefined,
          rpc: {
            async executar() {
              chamadas += 1;
              throw new Error('não deveria executar');
            },
          },
        },
      ),
    ).rejects.toThrow('Não foi possível processar o cadastro.');
    expect(chamadas).toBe(0);
  });
  it.each(['entrada_invalida', 'sem_permissao', 'conflito_idempotencia'])(
    'preserva negativa prevista da criação: %s',
    async (codigo) => {
      const negado = { ok: false, request_id: contexto.request_id, erro: { codigo } };
      await expect(
        executarCriacaoPacienteExperimental(
          {
            corpo: { nome: 'Pessoa fictícia' },
            cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
          },
          contexto,
          {
            cifra,
            atestador,
            idempotencia,
            reserva,
            rpc: {
              async executar() {
                return negado;
              },
            },
          },
        ),
      ).resolves.toEqual(negado);
    },
  );

  it.each([
    'nao_autenticado',
    'nao_encontrado',
    'conflito_versao',
    'limite_excedido',
    'configuracao_indisponivel',
    'pendencia_externa',
  ])('não trata código não previsto como negativa definitiva: %s', async (codigo) => {
    await expect(
      executarCriacaoPacienteExperimental(
        {
          corpo: { nome: 'Pessoa fictícia' },
          cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
        },
        contexto,
        {
          cifra,
          atestador,
          idempotencia,
          reserva,
          rpc: {
            async executar() {
              return { ok: false, request_id: contexto.request_id, erro: { codigo } };
            },
          },
        },
      ),
    ).rejects.toMatchObject({ name: 'ResultadoCadastroIncerto' });
  });
  it('trata indisponibilidade da RPC como resultado incerto sem repetir', async () => {
    let chamadas = 0;
    const erro = await executarCriacaoPacienteExperimental(
      {
        corpo: { nome: 'Pessoa fictícia' },
        cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
      },
      contexto,
      {
        cifra,
        atestador,
        idempotencia,
        reserva,
        rpc: {
          async executar() {
            chamadas += 1;
            return {
              ok: false,
              request_id: contexto.request_id,
              erro: { codigo: 'servico_indisponivel' },
            };
          },
        },
      },
    ).catch((falha: unknown) => falha);
    expect(erro).toMatchObject({
      name: 'ResultadoCadastroIncerto',
      message: 'Não foi possível processar o cadastro.',
    });
    expect(chamadas).toBe(1);
  });
  it('distingue falha após chamada da RPC de falha anterior, sem repetir', async () => {
    const solicitacao = {
      corpo: { nome: 'Pessoa fictícia' },
      cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
    };
    let chamadas = 0;
    const rpc = {
      async executar() {
        chamadas += 1;
        throw new Error('conteúdo sensível fictício');
      },
    };
    const aposEnvio = await executarCriacaoPacienteExperimental(solicitacao, contexto, {
      cifra,
      atestador,
      idempotencia,
      reserva,
      rpc,
    }).catch((erro: unknown) => erro);
    expect(aposEnvio).toMatchObject({
      name: 'ResultadoCadastroIncerto',
      message: 'Não foi possível processar o cadastro.',
    });
    expect(chamadas).toBe(1);
    const antesEnvio = await executarCriacaoPacienteExperimental(
      { ...solicitacao, corpo: { nome: '' } },
      contexto,
      { cifra, atestador, idempotencia, reserva, rpc },
    ).catch((erro: unknown) => erro);
    expect(antesEnvio).toMatchObject({
      name: 'Error',
      message: 'Não foi possível processar o cadastro.',
    });
    expect(chamadas).toBe(1);
  });
  it('projeta a resposta autorizada fictícia em DTO administrativo legível', async () => {
    const retorno = await executarCriacaoPacienteExperimental(
      {
        corpo: { nome: 'Pessoa fictícia' },
        cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
      },
      contexto,
      {
        cifra,
        atestador,
        idempotencia,
        reserva,
        rpc: {
          async executar(entrada) {
            const paciente = entrada.p_entrada.entrada;
            return {
              ok: true,
              request_id: contexto.request_id,
              dados: {
                paciente_id: paciente.paciente_id,
                nome: paciente.nome,
                nome_preferencia: null,
                data_nascimento: null,
                contatos: [],
                versao: 1,
              },
            };
          },
        },
      },
    );
    expect(retorno).toMatchObject({
      ok: true,
      request_id: contexto.request_id,
      dados: {
        nome: 'Pessoa fictícia',
        nome_preferencia: null,
        data_nascimento: null,
        contatos: [],
        versao: 1,
      },
    });
  });

  it('preserva negativa auditável e rejeita resposta incompatível ou exceção bruta', async () => {
    const solicitacao = {
      corpo: { nome: 'Pessoa fictícia' },
      cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
    };
    const negado = {
      ok: false,
      request_id: contexto.request_id,
      erro: { codigo: 'sem_permissao' },
    };
    const deps = { cifra, atestador, idempotencia, reserva };
    await expect(
      executarCriacaoPacienteExperimental(solicitacao, contexto, {
        ...deps,
        rpc: { executar: async () => negado },
      }),
    ).resolves.toEqual(negado);
    for (const resposta of [
      { ...negado, request_id: '10000000-0000-4000-8000-000000000004' },
      { ...negado, erro: { codigo: 'sem_permissao', mensagem: 'Pessoa fictícia' } },
      { ok: true, request_id: contexto.request_id, dados: { nome: 'Pessoa fictícia' } },
    ]) {
      await expect(
        executarCriacaoPacienteExperimental(solicitacao, contexto, {
          ...deps,
          rpc: { executar: async () => resposta },
        }),
      ).rejects.toMatchObject({
        name: 'ResultadoCadastroIncerto',
        message: 'Não foi possível processar o cadastro.',
      });
    }
    await expect(
      executarCriacaoPacienteExperimental(solicitacao, contexto, {
        ...deps,
        rpc: {
          executar: async () => {
            throw new Error('Pessoa fictícia');
          },
        },
      }),
    ).rejects.toThrow('Não foi possível processar o cadastro.');
  });

  it('recusa resultado cifrado para outro paciente sem resposta parcial ou nova mutação', async () => {
    let chamadas = 0;
    await expect(
      executarCriacaoPacienteExperimental(
        {
          corpo: { nome: 'Pessoa fictícia' },
          cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
        },
        contexto,
        {
          cifra,
          atestador,
          idempotencia,
          reserva,
          rpc: {
            async executar(entrada) {
              chamadas += 1;
              return {
                ok: true,
                request_id: contexto.request_id,
                dados: {
                  paciente_id: '10000000-0000-4000-8000-000000000004',
                  nome: entrada.p_entrada.entrada.nome,
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
    ).rejects.toMatchObject({
      name: 'ResultadoCadastroIncerto',
      message: 'Não foi possível processar o cadastro.',
    });
    expect(chamadas).toBe(1);
  });

  it('recusa identidade incluída pelo chamador antes de executar RPC', async () => {
    let chamadas = 0;
    const rpc = {
      executar: async () => {
        chamadas += 1;
        return undefined;
      },
    };
    const solicitacao = {
      corpo: { nome: 'Pessoa fictícia' },
      cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
      usuario_id: contexto.usuario_id,
    };
    await expect(
      executarCriacaoPacienteExperimental(solicitacao, contexto, {
        cifra,
        atestador,
        idempotencia,
        reserva,
        rpc,
      }),
    ).rejects.toThrow('Não foi possível processar o cadastro.');
    expect(chamadas).toBe(0);
  });

  it('não aceita correlação alterada pelo executor durante a chamada', async () => {
    const solicitacao = {
      corpo: { nome: 'Pessoa fictícia' },
      cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
    };
    const rpc = {
      async executar(
        transporte: Parameters<
          Parameters<typeof executarCriacaoPacienteExperimental>[2]['rpc']['executar']
        >[0],
      ) {
        transporte.p_entrada.entrada.request_id = '10000000-0000-4000-8000-000000000004';
        return {
          ok: false,
          request_id: transporte.p_entrada.entrada.request_id,
          erro: { codigo: 'sem_permissao' },
        };
      },
    };
    await expect(
      executarCriacaoPacienteExperimental(solicitacao, contexto, {
        cifra,
        atestador,
        idempotencia,
        reserva,
        rpc,
      }),
    ).rejects.toThrow('Não foi possível processar o cadastro.');
  });
});
