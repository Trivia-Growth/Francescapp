import { describe, expect, it } from 'vitest';

import {
  atualizarPacienteSchema,
  cabecalhosMutacaoSchema,
  consultaPacientesSchema,
  contratosRotas,
  criarConcessaoEquipeSchema,
  criarPacienteSchema,
  erroRespostaSchema,
  pacienteBasicoSchema,
  criarErroPublico,
  statusErroHttp,
  politicaCookiesSessao,
  novoContatoSchema,
} from '../src/index.js';

const uuid = '31a7e0e6-8b2f-4c85-8baf-9422b39a4175';

describe('contratos HTTP da fundação', () => {
  it('aceita o cadastro mínimo somente com nome e aplica trim', () => {
    expect(criarPacienteSchema.parse({ nome: '  Marina  ' })).toEqual({ nome: 'Marina' });
  });

  it('rejeita nome vazio e campos extras', () => {
    expect(criarPacienteSchema.safeParse({ nome: '   ' }).success).toBe(false);
    expect(criarPacienteSchema.safeParse({ nome: 'Marina', cpf: 'não permitido' }).success).toBe(
      false,
    );
  });

  it('distingue campo omitido de limpeza explícita em PATCH', () => {
    expect(
      atualizarPacienteSchema.parse({
        nome_preferencia: null,
        versao_esperada: 1,
        motivo: 'Atualização solicitada.',
      }),
    ).toMatchObject({ nome_preferencia: null });

    expect(
      atualizarPacienteSchema.safeParse({
        versao_esperada: 1,
        motivo: 'Sem alteração.',
      }).success,
    ).toBe(false);
  });

  it('mantém família e responsável fora do cadastro mínimo obrigatório', () => {
    expect(criarPacienteSchema.parse({ nome: 'Helena' })).not.toHaveProperty('familia');
  });

  it('rejeita UUID, versão, cursor e perfil fora do contrato', () => {
    expect(
      contratosRotas.consultarPaciente.parametros.safeParse({ paciente_id: 'invalido' }).success,
    ).toBe(false);
    expect(
      atualizarPacienteSchema.safeParse({
        nome: 'Helena',
        versao_esperada: 0,
        motivo: 'Teste.',
      }).success,
    ).toBe(false);
    expect(consultaPacientesSchema.safeParse({ cursor: '', limite: 25 }).success).toBe(false);
    expect(
      criarConcessaoEquipeSchema.safeParse({
        email: 'equipe@exemplo.test',
        perfil: 'familia',
        metodo: 'google_workspace',
        motivo: 'Não é concessão de equipe.',
      }).success,
    ).toBe(false);
  });

  it('aplica paginação limitada e chave de idempotência opaca', () => {
    expect(consultaPacientesSchema.parse({})).toEqual({ limite: 25 });
    expect(consultaPacientesSchema.safeParse({ limite: 101 }).success).toBe(false);
    expect(cabecalhosMutacaoSchema.safeParse({ 'x-chave-idempotencia': 'curta' }).success).toBe(
      false,
    );
    expect(
      cabecalhosMutacaoSchema.parse({
        'x-chave-idempotencia': 'P5_cjCGTgmWwg2TrV5KgEpMw',
      }),
    ).toBeDefined();
  });

  it('separa DTO básico de dados administrativos', () => {
    expect(
      pacienteBasicoSchema.safeParse({
        id: uuid,
        nome: 'Helena',
        nome_preferencia: null,
        versao: 1,
        contatos: [],
      }).success,
    ).toBe(false);
  });

  it('não admite eco de senha ou PII em envelope de erro', () => {
    expect(
      erroRespostaSchema.safeParse({
        erro: {
          codigo: 'entrada_invalida',
          mensagem: 'Dados inválidos.',
          senha: 'segredo',
        },
        request_id: uuid,
      }).success,
    ).toBe(false);
  });

  it('expõe a revogação de pré-concessão por seu próprio identificador', () => {
    expect(contratosRotas.revogarConcessao.caminho).toBe(
      '/api/admin/concessoes-equipe/:concessao_id/revogar',
    );
    expect(contratosRotas.revogarConcessao.parametros.parse({ concessao_id: uuid })).toEqual({
      concessao_id: uuid,
    });
  });

  it('exige origem e CSRF no transporte que usa refresh cookie', () => {
    expect(
      contratosRotas.renovarSessao.cabecalhos.safeParse({ origin: 'https://app.exemplo.test' })
        .success,
    ).toBe(false);
    expect(
      contratosRotas.renovarSessao.cabecalhos.parse({
        origin: 'https://app.exemplo.test',
        'x-csrf': 'a'.repeat(32),
      }),
    ).toBeDefined();
    expect(contratosRotas.entrarGoogle.transporte?.accessToken).toBe('somente-memoria');
  });

  it('rejeita eco sensível em mensagem e caminhos de erro', () => {
    const resposta = criarErroPublico('entrada_invalida', uuid);
    expect(
      erroRespostaSchema.safeParse({
        ...resposta,
        erro: { ...resposta.erro, mensagem: 'Senha recebida: segredo' },
      }).success,
    ).toBe(false);
    expect(
      erroRespostaSchema.safeParse({
        ...resposta,
        erro: {
          ...resposta.erro,
          campos: [{ campo: 'nome-do-paciente', codigo: 'formato_invalido' }],
        },
      }).success,
    ).toBe(false);
    expect(statusErroHttp.entrada_invalida).toBe(422);
    expect(statusErroHttp.nao_encontrado).toBe(404);
  });

  it('entrega access token e CSRF apenas na resposta de entrada', () => {
    const sessao = {
      usuario: { id: uuid, perfil: 'administrador', ativo: true, versao: 1 },
      capacidades: [],
    };
    expect(
      contratosRotas.entrarTecnico.saida.safeParse({
        sessao,
        access_token: 'token-ficticio',
        csrf: 'a'.repeat(32),
      }).success,
    ).toBe(true);
    expect(
      contratosRotas.sessaoAtual.saida.safeParse({ ...sessao, access_token: 'token-ficticio' })
        .success,
    ).toBe(false);
    expect(
      contratosRotas.entrarTecnico.cabecalhos.safeParse({ origin: 'https://app.exemplo.test' })
        .success,
    ).toBe(false);
    expect(politicaCookiesSessao).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
      path: '/api/sessao',
      domain: null,
      limpar: { maxAge: 0 },
    });
  });

  it('rejeita telefone formado somente por pontuação ou espaços', () => {
    for (const valor of ['.......', '-------', '(     )']) {
      expect(novoContatoSchema.safeParse({ tipo: 'telefone', valor }).success).toBe(false);
    }
    expect(
      novoContatoSchema.safeParse({ tipo: 'telefone', valor: '(11) 99999-0000' }).success,
    ).toBe(true);
  });
});
