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
  sucessoRespostaSchema,
} from '../src/index.js';

const uuid = '31a7e0e6-8b2f-4c85-8baf-9422b39a4175';

describe('contratos HTTP da fundação', () => {
  it('valida apenas estrutura de cursor e envelope da reconciliação, sem provar opacidade', () => {
    const rota = contratosRotas.consultarOperacoesCadastro;
    const exemploQueNaoEOpaco = 'pessoa-ficticia@example.test';
    expect(rota.entrada.safeParse({ cursor: exemploQueNaoEOpaco, limite: 1 }).success).toBe(true);
    expect(rota.entrada.safeParse({ cursor: '', limite: 1 }).success).toBe(false);
    expect(rota.entrada.safeParse({ cursor: 'a'.repeat(513), limite: 1 }).success).toBe(false);
    expect(rota.entrada.safeParse({ limite: 0 }).success).toBe(false);
    const sucesso = sucessoRespostaSchema(rota.saida);
    expect(
      sucesso.safeParse({ dados: { itens: [], proximo_cursor: null }, request_id: uuid }).success,
    ).toBe(true);
    expect(
      sucesso.safeParse({
        dados: { itens: [], proximo_cursor: null },
        request_id: uuid,
        access_token: 'token-ficticio',
      }).success,
    ).toBe(false);
    expect(
      sucesso.safeParse({
        dados: { itens: [], proximo_cursor: null },
        request_id: uuid,
        nome: 'Pessoa fictícia',
      }).success,
    ).toBe(false);
  });
  it('define consulta de reconciliação sem ator autodeclarado e sem inferir falha de página vazia', () => {
    const rota = contratosRotas.consultarOperacoesCadastro;
    expect(rota.metodo).toBe('GET');
    expect(rota.caminho).toBe('/api/cadastro/operacoes');
    expect(rota.entrada.safeParse({ limite: 25 }).success).toBe(true);
    expect(rota.entrada.safeParse({ limite: 25, usuario_id: uuid }).success).toBe(false);
    expect(rota.entrada.safeParse({ limite: 101 }).success).toBe(false);
    expect(rota.entrada.safeParse({ limite: 25, perfil: 'administrador' }).success).toBe(false);
    expect(rota.saida.safeParse({ itens: [], proximo_cursor: null }).success).toBe(true);
    for (const estado of ['pendente', 'indeterminado']) {
      expect(
        rota.saida.safeParse({
          itens: [{ operacao_id: uuid, situacao: { estado } }],
          proximo_cursor: null,
        }).success,
      ).toBe(true);
    }
    expect(
      rota.saida.safeParse({
        itens: [
          {
            operacao_id: uuid,
            situacao: { estado: 'confirmado', resultado_id: uuid, resultado_versao: 1 },
          },
        ],
        proximo_cursor: null,
      }).success,
    ).toBe(true);
    expect(
      rota.saida.safeParse({
        itens: [
          { operacao_id: uuid, situacao: { estado: 'indeterminado', nome: 'Pessoa fictícia' } },
        ],
        proximo_cursor: null,
      }).success,
    ).toBe(false);
    expect(
      rota.saida.safeParse({
        itens: [{ operacao_id: uuid, situacao: { estado: 'pendente', resultado_id: uuid } }],
        proximo_cursor: null,
      }).success,
    ).toBe(false);
  });
  it('reserva transição para família à jornada familiar', () => {
    const base = { versao_esperada: 1, motivo: 'Alteração solicitada.' };
    const schema = contratosRotas.atualizarAcessoUsuario.entrada;
    expect(schema.safeParse({ ...base, perfil: 'familia' }).success).toBe(false);
    expect(schema.safeParse({ ...base, perfil: 'profissional' }).success).toBe(true);
    expect(schema.safeParse({ ...base, ativo: false }).success).toBe(true);
  });
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
        'x-sessao': '20000000-0000-4000-8000-000000000001',
        'x-ffcm-prova-sessao': 'A'.repeat(43),
        'x-ffcm-geracao-sessao': '1',
      }),
    ).toBeDefined();
    expect(contratosRotas.entrarGoogle.transporte?.accessToken).toBe('somente-memoria');
  });

  it('separa o cookie do desafio de login do cookie da sessão', () => {
    expect(contratosRotas.desafioGoogle.transporte?.cookiesSaida).toContain(
      'ffcm_csrf_desafio_<seletor>',
    );
    expect(contratosRotas.desafioGoogle.transporte?.cookiesSaida).not.toContain('ffcm_csrf');
    expect(contratosRotas.entrarTecnico.transporte?.cookiesEntrada).toContain(
      'ffcm_csrf_desafio_<seletor>',
    );
    expect(contratosRotas.entrarGoogle.transporte?.cookiesEntrada).toContain(
      'ffcm_csrf_desafio_<seletor>',
    );
    expect(contratosRotas.sairSessao.transporte?.cookiesEntrada).toContain('ffcm_csrf_<seletor>');
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
        seletor_sessao: '20000000-0000-4000-8000-000000000001',
        prova_sessao: 'A'.repeat(43),
        geracao_sessao: 1,
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

  it('exige prova e geração em consultas, mutações, renovação e saída', () => {
    const prova = { 'x-ffcm-prova-sessao': 'A'.repeat(43), 'x-ffcm-geracao-sessao': '1' };
    const sessao = {
      ...prova,
      origin: 'https://app.exemplo.test',
      'x-csrf': 'a'.repeat(43),
      'x-sessao': '20000000-0000-4000-8000-000000000001',
    };
    expect(contratosRotas.sessaoAtual.cabecalhos.safeParse(prova).success).toBe(true);
    expect(contratosRotas.sessaoAtual.cabecalhos.safeParse({}).success).toBe(false);
    expect(
      contratosRotas.criarPaciente.cabecalhos.safeParse({
        ...prova,
        'x-chave-idempotencia': 'P5_cjCGTgmWwg2TrV5KgEpMw',
      }).success,
    ).toBe(true);
    expect(contratosRotas.renovarSessao.cabecalhos.safeParse(sessao).success).toBe(true);
    expect(
      contratosRotas.sairSessao.cabecalhos.safeParse({ ...sessao, 'x-ffcm-geracao-sessao': '01' })
        .success,
    ).toBe(false);
    expect(
      contratosRotas.sairSessao.cabecalhos.safeParse({
        ...sessao,
        'x-ffcm-prova-sessao': `${'A'.repeat(42)}B`,
      }).success,
    ).toBe(false);
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
