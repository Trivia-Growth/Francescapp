import { describe, expect, it } from 'vitest';

import { criarModuloCadastro, type AdaptadorRpcCadastro } from '../src/index.js';

const ids = {
  paciente: '11111111-1111-4111-8111-111111111111',
  contato: '22222222-2222-4222-8222-222222222222',
  request: '33333333-3333-4333-8333-333333333333',
};

function adaptadorQueResponde(resposta: unknown): AdaptadorRpcCadastro {
  return {
    executar: async () => resposta,
  };
}

describe('módulo de cadastro', () => {
  it('cria paciente somente com nome sem receber perfil ou ator do chamador', async () => {
    const modulo = criarModuloCadastro(
      adaptadorQueResponde({
        dados: {
          id: ids.paciente,
          nome: 'Pessoa de Teste',
          nome_preferencia: null,
          data_nascimento: null,
          contatos: [],
          versao: 1,
        },
        request_id: ids.request,
      }),
    );

    const resposta = await modulo.executar({
      operacao: 'criarPaciente',
      corpo: { nome: 'Pessoa de Teste' },
      cabecalhos: {
        'x-chave-idempotencia': 'chave-idempotente-de-teste-001',
        'x-ffcm-prova-sessao': 'A'.repeat(43),
        'x-ffcm-geracao-sessao': '1',
      },
    });

    expect(resposta).toEqual({
      dados: {
        id: ids.paciente,
        nome: 'Pessoa de Teste',
        nome_preferencia: null,
        data_nascimento: null,
        contatos: [],
        versao: 1,
      },
      request_id: ids.request,
    });
  });

  it('fixa a rota e RPC de listagem, sem aceitar escopo de paciente no comando público', async () => {
    let recebida: unknown;
    const modulo = criarModuloCadastro({
      executar: async (chamada) => {
        recebida = chamada;
        return {
          dados: {
            itens: [
              {
                id: ids.paciente,
                nome: 'Pessoa de Teste',
                nome_preferencia: null,
                versao: 1,
              },
            ],
            proximo_cursor: null,
          },
          request_id: ids.request,
        };
      },
    });

    await modulo.executar({
      operacao: 'listarPacientes',
      consulta: { limite: 25 },
    });

    expect(recebida).toMatchObject({
      operacao: 'listarPacientes',
      caminho: '/api/pacientes',
      rpc: 'api.listar_pacientes',
      entrada: { limite: 25 },
    });
    expect(recebida).not.toHaveProperty('perfil');
    expect(recebida).not.toHaveProperty('usuario_id');
  });

  it('mantém a projeção básica sem contatos quando o adapter devolve leitura vinculada', async () => {
    const modulo = criarModuloCadastro(
      adaptadorQueResponde({
        dados: {
          id: ids.paciente,
          nome: 'Pessoa de Teste',
          nome_preferencia: null,
          versao: 1,
        },
        request_id: ids.request,
      }),
    );

    const resposta = await modulo.executar({
      operacao: 'consultarPaciente',
      parametros: { paciente_id: ids.paciente },
    });

    if (!('dados' in resposta)) {
      throw new Error('A consulta vinculada deveria retornar o DTO básico.');
    }

    expect(resposta).toEqual({
      dados: {
        id: ids.paciente,
        nome: 'Pessoa de Teste',
        nome_preferencia: null,
        versao: 1,
      },
      request_id: ids.request,
    });
    expect(resposta.dados).not.toHaveProperty('contatos');
  });

  it('valida resposta pela operação original mesmo se pedido e chamada mudarem durante a espera', async () => {
    const pedido = {
      operacao: 'consultarPaciente' as const,
      parametros: { paciente_id: ids.paciente },
    };
    const modulo = criarModuloCadastro({
      executar: async (chamada) => {
        (pedido as { operacao: string }).operacao = 'listarPacientes';
        chamada.operacao = 'listarPacientes';
        return {
          dados: { id: ids.paciente, nome: 'Pessoa de Teste', nome_preferencia: null, versao: 1 },
          request_id: ids.request,
        };
      },
    });

    await expect(modulo.executar(pedido)).resolves.toEqual({
      dados: { id: ids.paciente, nome: 'Pessoa de Teste', nome_preferencia: null, versao: 1 },
      request_id: ids.request,
    });
  });

  it('preserva negativa explícita em vez de devolver uma lista vazia', async () => {
    const modulo = criarModuloCadastro(
      adaptadorQueResponde({
        erro: { codigo: 'nao_encontrado', mensagem: 'Recurso não encontrado.' },
        request_id: ids.request,
      }),
    );

    const resposta = await modulo.executar({
      operacao: 'consultarPaciente',
      parametros: { paciente_id: ids.paciente },
    });

    expect(resposta).toEqual({
      erro: { codigo: 'nao_encontrado', mensagem: 'Recurso não encontrado.' },
      request_id: ids.request,
    });
  });

  it('rejeita perfil autodeclarado antes de alcançar o adapter', async () => {
    let chamado = false;
    const modulo = criarModuloCadastro({
      executar: async () => {
        chamado = true;
        return undefined;
      },
    });

    await expect(
      modulo.executar({
        operacao: 'listarPacientes',
        consulta: { limite: 25 },
        perfil: 'administrador',
      } as unknown as Parameters<typeof modulo.executar>[0]),
    ).rejects.toThrow('Solicitação de cadastro inválida.');

    expect(chamado).toBe(false);
  });

  it('não transforma indisponibilidade do adapter em resposta vazia', async () => {
    const modulo = criarModuloCadastro({
      executar: async () => {
        throw new Error('Indisponibilidade simulada.');
      },
    });

    await expect(
      modulo.executar({
        operacao: 'listarPacientes',
        consulta: { limite: 25 },
      }),
    ).rejects.toThrow('Não foi possível processar a solicitação de cadastro.');
  });

  it('não propaga dados recebidos em falhas inesperadas do adapter', async () => {
    const modulo = criarModuloCadastro({
      executar: async () => {
        throw new Error('Falha no provedor: Pessoa Fictícia, segredo-fictício');
      },
    });

    await expect(
      modulo.executar({ operacao: 'listarPacientes', consulta: { limite: 25 } }),
    ).rejects.toThrow('Não foi possível processar a solicitação de cadastro.');
  });

  it('não expõe detalhes nem causa de resposta inválida do adapter', async () => {
    const modulo = criarModuloCadastro(
      adaptadorQueResponde({ dados: { nome: 'Pessoa Fictícia' } }),
    );
    const erro = await modulo
      .executar({ operacao: 'listarPacientes', consulta: { limite: 25 } })
      .catch((falha: unknown) => falha);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe('Não foi possível processar a solicitação de cadastro.');
    expect((erro as Error).cause).toBeUndefined();
    expect(JSON.stringify(erro)).not.toContain('Pessoa Fictícia');
  });

  it('rejeita nome vazio antes de delegar e não sugere sucesso parcial', async () => {
    const modulo = criarModuloCadastro(adaptadorQueResponde(undefined));

    await expect(
      modulo.executar({
        operacao: 'criarPaciente',
        corpo: { nome: '   ' },
        cabecalhos: {
          'x-chave-idempotencia': 'chave-idempotente-de-teste-001',
          'x-ffcm-prova-sessao': 'A'.repeat(43),
          'x-ffcm-geracao-sessao': '1',
        },
      }),
    ).rejects.toThrow('Solicitação de cadastro inválida.');
  });
});
