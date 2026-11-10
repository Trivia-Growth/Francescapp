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
const responsavelId = 'a0000000-0000-4000-8000-000000000011';
/** Caso novo completo e fictício: todos os campos do contrato são obrigatórios. */
const casoNovo = {
  nome: 'Marina Fictícia',
  nome_preferencia: 'Mari',
  data_nascimento: '2000-01-01',
  contatos: [{ tipo: 'email', valor: 'marina@exemplo.test' }],
  situacao: 'entrada',
  responsavel_id: responsavelId,
} as const;

describe('contratos HTTP da fundação', () => {
  it('exige chave idempotente e prova de sessão na escrita preparada da anamnese', () => {
    const rota = contratosRotas.salvarAnamnese;
    const cabecalhos = {
      'x-chave-idempotencia': 'chave_ficticia_123456',
      'x-ffcm-prova-sessao': `${'A'.repeat(42)}A`,
      'x-ffcm-geracao-sessao': '1',
    };
    expect(rota.metodo).toBe('PATCH');
    expect(rota.caminho).toBe('/api/pacientes/:paciente_id/anamnese');
    expect(rota.parametros.safeParse({ paciente_id: uuid }).success).toBe(true);
    expect(rota.cabecalhos.safeParse(cabecalhos).success).toBe(true);
    expect(
      rota.cabecalhos.safeParse({ ...cabecalhos, 'x-chave-idempotencia': 'curta' }).success,
    ).toBe(false);
    expect(
      rota.cabecalhos.safeParse({ 'x-chave-idempotencia': cabecalhos['x-chave-idempotencia'] })
        .success,
    ).toBe(false);
    expect(rota.entrada.safeParse({ versao_esperada: 0, secoes: [] }).success).toBe(true);
    expect(rota.entrada.safeParse({ secoes: [] }).success).toBe(false);
    expect(rota.saida.safeParse({ versao: 1, secoes: [] }).success).toBe(true);
  });

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
  it('rejeita o cadastro antigo somente com nome e aceita o caso novo completo aplicando trim', () => {
    expect(criarPacienteSchema.safeParse({ nome: 'Marina' }).success).toBe(false);
    expect(
      criarPacienteSchema.parse({
        ...casoNovo,
        nome: '  Marina  ',
        nome_preferencia: '  Mari  ',
        contatos: [
          { tipo: 'email', valor: '  marina@exemplo.test  ' },
          { tipo: 'telefone', valor: '  +55 11 90000-0000  ' },
        ],
      }),
    ).toEqual({
      ...casoNovo,
      nome: 'Marina',
      nome_preferencia: 'Mari',
      contatos: [
        { tipo: 'email', valor: 'marina@exemplo.test' },
        { tipo: 'telefone', valor: '+55 11 90000-0000' },
      ],
    });
  });

  it('rejeita nome vazio e campos extras', () => {
    expect(criarPacienteSchema.safeParse({ ...casoNovo, nome: '   ' }).success).toBe(false);
    expect(criarPacienteSchema.safeParse({ ...casoNovo, nome_preferencia: '   ' }).success).toBe(
      false,
    );
    expect(criarPacienteSchema.safeParse({ ...casoNovo, cpf: 'não permitido' }).success).toBe(
      false,
    );
  });

  it('exige cada campo do caso novo, sem valor padrão', () => {
    expect(criarPacienteSchema.safeParse(casoNovo).success).toBe(true);
    for (const campo of Object.keys(casoNovo)) {
      const semCampo = Object.fromEntries(Object.entries(casoNovo).filter(([k]) => k !== campo));
      expect(criarPacienteSchema.safeParse(semCampo).success, `sem ${campo}`).toBe(false);
    }
  });

  it('limita os contatos do caso novo de 1 a 10 e valida cada um', () => {
    const contato = (indice: number) => ({
      tipo: 'email' as const,
      valor: `pessoa${indice}@exemplo.test`,
    });
    const com = (contatos: unknown[]) => criarPacienteSchema.safeParse({ ...casoNovo, contatos });
    expect(com([]).success).toBe(false);
    expect(com(Array.from({ length: 10 }, (_, i) => contato(i))).success).toBe(true);
    expect(com(Array.from({ length: 11 }, (_, i) => contato(i))).success).toBe(false);
    expect(com([{ tipo: 'email', valor: 'sem-arroba' }]).success).toBe(false);
    expect(com([{ tipo: 'telefone', valor: '.......' }]).success).toBe(false);
    expect(com([{ tipo: 'whatsapp', valor: '+55 11 90000-0000' }]).success).toBe(false);
    expect(com([{ ...contato(1), extra: true }]).success).toBe(false);
  });

  it('rejeita data de nascimento futura ou fora do formato ISO, e aceita hoje', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const amanha = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const com = (data_nascimento: string) =>
      criarPacienteSchema.safeParse({ ...casoNovo, data_nascimento }).success;
    expect(com(hoje)).toBe(true);
    expect(com(amanha)).toBe(false);
    expect(com('01/01/2000')).toBe(false);
    expect(com('2000-02-30')).toBe(false);
  });

  it('rejeita situação desconhecida e responsável que não é UUID', () => {
    expect(criarPacienteSchema.safeParse({ ...casoNovo, situacao: 'arquivado' }).success).toBe(
      false,
    );
    expect(criarPacienteSchema.safeParse({ ...casoNovo, responsavel_id: 'qualquer' }).success).toBe(
      false,
    );
    for (const situacao of ['entrada', 'ativo', 'pausado', 'encerrado', 'transferido']) {
      expect(criarPacienteSchema.safeParse({ ...casoNovo, situacao }).success).toBe(true);
    }
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

  it('exige responsável no cadastro de caso novo e mantém o perfil Família fora dele', () => {
    const { responsavel_id: _responsavel, ...semResponsavel } = casoNovo;
    expect(criarPacienteSchema.safeParse(semResponsavel).success).toBe(false);
    expect(criarPacienteSchema.parse(casoNovo)).not.toHaveProperty('familia');
    expect(criarPacienteSchema.safeParse({ ...casoNovo, familia: [] }).success).toBe(false);
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

  it('exige reserva prévia válida na criação de paciente', () => {
    const corpo = {
      entrada: casoNovo,
      reserva_id: 'd0000000-0000-4000-8000-000000000001',
      geracao_reserva: 1,
    };
    const schema = contratosRotas.criarPaciente.entrada;
    expect(schema.safeParse(corpo).success).toBe(true);
    expect(schema.safeParse(casoNovo).success).toBe(false);
    expect(schema.safeParse({ ...corpo, entrada: { nome: 'Pessoa fictícia' } }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...corpo, geracao_reserva: 0 }).success).toBe(false);
    expect(
      schema.safeParse({ ...corpo, geracao_reserva: Number.MAX_SAFE_INTEGER + 1 }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...corpo, reserva_id: 'inválido' }).success).toBe(false);
    expect(schema.safeParse({ ...corpo, extra: true }).success).toBe(false);
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
