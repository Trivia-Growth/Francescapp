import { describe, expect, it } from 'vitest';

import {
  assinaturasRpc,
  contratosRotas,
  contratosRpc,
  criarTransporteRpcAtestadaSchema,
  metadadosAadSchema,
  pacienteBasicoRpcSaidaSchema,
  resultadoAtestacaoSchema,
} from '../src/index.js';

const uuid = '31a7e0e6-8b2f-4c85-8baf-9422b39a4175';
const outroUuid = '41a7e0e6-8b2f-4c85-8baf-9422b39a4175';
const instante = '2026-10-16T12:00:00.000Z';
const cifra = {
  formato: 1,
  key_id: 'pii-v1',
  nonce: 'bm9uY2U',
  ciphertext: 'Y2lwaGVy',
  tag: 'dGFn',
};
const tecnica = { usuario_id: uuid, session_id: uuid, metodo: 'tecnica' };
const identidadeSessao = { usuario_id: uuid, session_id: uuid };
const google = {
  usuario_id: uuid,
  session_id: uuid,
  metodo: 'google_workspace',
  subject_google: 'subject-ficticio',
  email_hmac: 'aGFzaA',
  desafio_id: uuid,
  nonce_hash: 'bm9uY2U',
};
const sessao = {
  usuario_id: uuid,
  session_id: uuid,
  concessao_id: uuid,
  perfil: 'administrador',
  versao_usuario: 1,
};
const paciente = { paciente_id: uuid, nome: cifra, nome_preferencia: null, versao: 1 };
const administrativo = { ...paciente, data_nascimento: null, contatos: [] };
const concessao = {
  concessao_id: uuid,
  email: cifra,
  perfil: 'profissional',
  estado: 'pendente',
  usuario_id: null,
  versao: 1,
};
const pagina = (item: unknown) => ({ itens: [item], proximo_cursor: null });
const concluida = { id: uuid, versao: 1 };
const mutacao = {
  chave_idempotencia: 'chave_opaca_ficticia_123',
  digest_idempotencia: 'aG1hYy1sb2dpY28',
  auditoria_id: uuid,
};
const alteracao = { ...mutacao, versao_esperada: 1, motivo: cifra };

type Rota = keyof typeof assinaturasRpc;
const entradas: Record<Rota, Record<string, unknown>> = {
  desafioGoogle: { desafio_id: uuid, nonce_hash: 'bm9uY2U', expira_em: instante },
  entrarGoogle: { identidade: google, credencial_refresh: cifra },
  entrarTecnico: { identidade: tecnica, credencial_refresh: cifra },
  renovarSessao: { identidade: identidadeSessao },
  sairSessao: { identidade: identidadeSessao },
  sessaoAtual: {},
  listarConcessoes: { limite: 25 },
  criarConcessao: {
    ...mutacao,
    concessao_id: uuid,
    email: cifra,
    email_hmac: 'aGFzaA',
    perfil: 'profissional',
    metodo: 'google_workspace',
    motivo: cifra,
  },
  revogarConcessao: { ...alteracao, concessao_id: uuid },
  atualizarAcessoUsuario: { ...alteracao, usuario_id: uuid, ativo: false },
  listarPacientes: { limite: 25 },
  criarPaciente: {
    ...mutacao,
    reserva_id: uuid,
    geracao_reserva: 1,
    paciente_id: uuid,
    nome: cifra,
    nome_preferencia: cifra,
    data_nascimento: cifra,
    aad: {
      nome: { tabela: 'cadastro.paciente', registro_id: uuid, campo: 'nome', formato: 1 },
      nome_preferencia: {
        tabela: 'cadastro.paciente',
        registro_id: uuid,
        campo: 'nome_preferencia',
        formato: 1,
      },
      data_nascimento: {
        tabela: 'cadastro.paciente',
        registro_id: uuid,
        campo: 'data_nascimento',
        formato: 1,
      },
    },
  },
  consultarPaciente: { paciente_id: uuid },
  atualizarPaciente: {
    ...alteracao,
    paciente_id: uuid,
    nome: cifra,
    nome_preferencia: cifra,
    data_nascimento: cifra,
    aad: {
      nome: { tabela: 'cadastro.paciente', registro_id: uuid, campo: 'nome', formato: 1 },
      nome_preferencia: {
        tabela: 'cadastro.paciente',
        registro_id: uuid,
        campo: 'nome_preferencia',
        formato: 1,
      },
      data_nascimento: {
        tabela: 'cadastro.paciente',
        registro_id: uuid,
        campo: 'data_nascimento',
        formato: 1,
      },
    },
  },
  criarContato: {
    ...mutacao,
    paciente_id: uuid,
    contato_id: uuid,
    reserva_id: uuid,
    geracao_reserva: 1,
    tipo: 'email',
    valor: cifra,
    aad: { tabela: 'cadastro.contato_paciente', registro_id: uuid, campo: 'valor', formato: 1 },
  },
  atualizarContato: {
    ...alteracao,
    paciente_id: uuid,
    contato_id: uuid,
    tipo: 'telefone',
    valor: cifra,
  },
  criarRelacao: {
    ...mutacao,
    paciente_id: uuid,
    pessoa_id: uuid,
    relacao_id: uuid,
    nome: cifra,
    descricao_relacao: cifra,
    responsabilidade: cifra,
    contatos: [{ contato_id: uuid, tipo: 'email', valor: cifra }],
  },
  atualizarRelacao: {
    ...alteracao,
    paciente_id: uuid,
    relacao_id: uuid,
    descricao_relacao: cifra,
    responsabilidade: cifra,
  },
  criarAcessoPaciente: {
    ...mutacao,
    paciente_id: uuid,
    acesso_id: uuid,
    usuario_id: uuid,
    reserva_id: uuid,
    geracao_reserva: 1,
    motivo: cifra,
  },
  revogarAcessoPaciente: {
    ...alteracao,
    paciente_id: uuid,
    acesso_id: uuid,
    motivo_auditoria: cifra,
  },
  consultarAuditoria: { limite: 25 },
};
const saidas: Record<Rota, unknown> = {
  desafioGoogle: { desafio_id: uuid, nonce_hash: 'bm9uY2U', expira_em: instante },
  entrarGoogle: sessao,
  entrarTecnico: sessao,
  renovarSessao: sessao,
  sairSessao: { encerrada_localmente: true, pendencia_externa: false },
  sessaoAtual: sessao,
  listarConcessoes: pagina({ ...concessao, ativo: null }),
  criarConcessao: concessao,
  revogarConcessao: concessao,
  atualizarAcessoUsuario: { usuario_id: uuid, perfil: 'profissional', ativo: false, versao: 1 },
  listarPacientes: pagina(paciente),
  criarPaciente: administrativo,
  consultarPaciente: paciente,
  atualizarPaciente: administrativo,
  criarContato: administrativo,
  atualizarContato: administrativo,
  criarRelacao: concluida,
  atualizarRelacao: concluida,
  criarAcessoPaciente: concluida,
  revogarAcessoPaciente: concluida,
  consultarAuditoria: pagina({
    id: uuid,
    instante,
    ator_usuario_id: uuid,
    operador_restrito: null,
    acao: 'consultar',
    tipo_objeto: 'paciente',
    objeto_id: uuid,
    resultado: 'permitido',
  }),
};

function entrada(rota: Rota): Record<string, unknown> {
  const contrato = assinaturasRpc[rota];
  return {
    ...entradas[rota],
    request_id: uuid,
    ...(contrato.executor === 'jwt-do-solicitante'
      ? {
          atestado: {
            key_id: 'atestado-v1',
            usuario_id: uuid,
            session_id: uuid,
            emitido_em: instante,
            expira_em: '2026-10-16T12:01:00.000Z',
            request_id: uuid,
            operacao: contrato.rpc,
            digest_entrada: 'ZGlnZXN0',
            mac: 'bWFj',
          },
        }
      : {}),
  };
}

describe('interfaces internas consumidas por banco, sessão e handlers', () => {
  it('exige AAD correspondente apenas aos campos cifrados da atualização', () => {
    const { aad: _aad, ...base } = entrada('atualizarPaciente');
    const schema = assinaturasRpc.atualizarPaciente.entrada;
    const aad = {
      nome: { tabela: 'cadastro.paciente', registro_id: uuid, campo: 'nome', formato: 1 },
      nome_preferencia: {
        tabela: 'cadastro.paciente',
        registro_id: uuid,
        campo: 'nome_preferencia',
        formato: 1,
      },
      data_nascimento: {
        tabela: 'cadastro.paciente',
        registro_id: uuid,
        campo: 'data_nascimento',
        formato: 1,
      },
    };
    expect(schema.safeParse({ ...base, aad }).success).toBe(true);
    expect(schema.safeParse(base).success).toBe(false);
    expect(
      schema.safeParse({ ...base, aad: { ...aad, nome: { ...aad.nome, registro_id: outroUuid } } })
        .success,
    ).toBe(false);
    expect(schema.safeParse({ ...base, aad: { ...aad, nome: undefined } }).success).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        nome_preferencia: null,
        aad: { nome: aad.nome, data_nascimento: aad.data_nascimento },
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ ...base, nome_preferencia: null, aad }).success).toBe(false);
  });
  it('exige AAD do valor de contato vinculado ao identificador e formato', () => {
    const { aad: _aad, ...base } = entrada('criarContato');
    const aad = {
      tabela: 'cadastro.contato_paciente',
      registro_id: uuid,
      campo: 'valor',
      formato: 1,
    };
    expect(assinaturasRpc.criarContato.entrada.safeParse({ ...base, aad }).success).toBe(true);
    expect(assinaturasRpc.criarContato.entrada.safeParse(base).success).toBe(false);
    for (const invalido of [
      { ...aad, registro_id: outroUuid },
      { ...aad, campo: 'outro' },
      { ...aad, tabela: 'cadastro.paciente' },
      { ...aad, formato: 2 },
    ])
      expect(
        assinaturasRpc.criarContato.entrada.safeParse({ ...base, aad: invalido }).success,
      ).toBe(false);
  });
  it('exige reserva e geração seguras no comando assinado de paciente', () => {
    const valor = entrada('criarPaciente');
    const schema = assinaturasRpc.criarPaciente.entrada;
    expect(schema.safeParse(valor).success).toBe(true);
    expect(schema.safeParse({ ...valor, reserva_id: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...valor, geracao_reserva: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...valor, geracao_reserva: 0 }).success).toBe(false);
    expect(
      schema.safeParse({ ...valor, geracao_reserva: Number.MAX_SAFE_INTEGER + 1 }).success,
    ).toBe(false);
  });
  it('exige AAD pareado a cada campo cifrado de novo paciente e vinculado ao seu ID', () => {
    const valor = entrada('criarPaciente');
    const aad = {
      nome: { tabela: 'cadastro.paciente', registro_id: uuid, campo: 'nome', formato: 1 },
      nome_preferencia: {
        tabela: 'cadastro.paciente',
        registro_id: uuid,
        campo: 'nome_preferencia',
        formato: 1,
      },
      data_nascimento: {
        tabela: 'cadastro.paciente',
        registro_id: uuid,
        campo: 'data_nascimento',
        formato: 1,
      },
    };
    const schema = assinaturasRpc.criarPaciente.entrada;
    expect(schema.safeParse({ ...valor, aad }).success).toBe(true);
    expect(schema.safeParse({ ...valor, aad: undefined }).success).toBe(false);
    expect(
      schema.safeParse({
        ...valor,
        nome_preferencia: undefined,
        data_nascimento: undefined,
        aad: { nome: aad.nome },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...valor, aad: { ...aad, nome: { ...aad.nome, registro_id: outroUuid } } })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...valor,
        aad: { ...aad, nome: { ...aad.nome, campo: 'data_nascimento' } },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...valor, aad: { ...aad, nome: { ...aad.nome, formato: 2 } } }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...valor, aad: { ...aad, nome_preferencia: undefined } }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...valor, nome_preferencia: undefined, aad }).success).toBe(false);
  });
  it('transporta entrada da RPC e os dois snapshots sem aceitar campos extras', () => {
    const schema = criarTransporteRpcAtestadaSchema('criarPaciente');
    const transporte = {
      p_entrada: {
        entrada: entrada('criarPaciente'),
        entrada_canonica: '{"request_id":"valor-ficticio"}',
        dados_canonicos: '{"operacao":"api.criar_paciente"}',
      },
    };
    expect(schema.safeParse(transporte).success).toBe(true);
    expect(
      schema.safeParse({ p_entrada: { ...transporte.p_entrada, entrada_canonica: undefined } })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({ p_entrada: { ...transporte.p_entrada, dados_canonicos: undefined } })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        p_entrada: {
          ...transporte.p_entrada,
          entrada: { ...entrada('criarPaciente'), atestado: undefined },
        },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ p_entrada: { ...transporte.p_entrada, chave: 'segredo-ficticio' } })
        .success,
    ).toBe(false);
    expect(schema.safeParse({ ...transporte, outro: true }).success).toBe(false);
    expect(
      contratosRotas.criarPaciente.entrada.safeParse({ nome: 'Fictício', ...transporte }).success,
    ).toBe(false);
    expect(
      assinaturasRpc.criarPaciente.saida.safeParse({
        ok: true,
        dados: administrativo,
        request_id: uuid,
        ...transporte,
      }).success,
    ).toBe(false);
    expect(() => criarTransporteRpcAtestadaSchema('entrarGoogle')).toThrow();
  });
  it('valida a estrutura interna e rejeita campos extras no envelope e no DTO público', () => {
    const prova = entrada('criarPaciente').atestado;
    const resultado = {
      atestado: prova,
      entradaCanonica: '{"request_id":"31a7e0e6-8b2f-4c85-8baf-9422b39a4175"}',
      dadosCanonicos: '{"operacao":"api.criar_paciente"}',
    };
    expect(resultadoAtestacaoSchema.parse(resultado)).toEqual(resultado);
    expect(
      resultadoAtestacaoSchema.safeParse({ ...resultado, chave: 'segredo-ficticio' }).success,
    ).toBe(false);
    expect(
      resultadoAtestacaoSchema.safeParse({ ...resultado, entradaCanonica: undefined }).success,
    ).toBe(false);
    expect(
      contratosRotas.criarPaciente.entrada.safeParse({ nome: 'Pessoa fictícia', ...resultado })
        .success,
    ).toBe(false);
  });
  it('limita cada snapshot a 1.048.576 bytes UTF-8, inclusive Unicode', () => {
    const resultado = {
      atestado: entrada('criarPaciente').atestado,
      entradaCanonica: '{}',
      dadosCanonicos: '{}',
    };
    const noLimite = `"${'é'.repeat(524_287)}"`;
    const acimaDoLimite = `"${'é'.repeat(524_288)}"`;
    for (const campo of ['entradaCanonica', 'dadosCanonicos'] as const) {
      expect(resultadoAtestacaoSchema.safeParse({ ...resultado, [campo]: noLimite }).success).toBe(
        true,
      );
      expect(
        resultadoAtestacaoSchema.safeParse({ ...resultado, [campo]: acimaDoLimite }).success,
      ).toBe(false);
    }
  });
  it('não aceita transição para família na RPC de administração de equipe', () => {
    const schema = assinaturasRpc.atualizarAcessoUsuario.entrada;
    expect(
      schema.safeParse({ ...entrada('atualizarAcessoUsuario'), perfil: 'familia' }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...entrada('atualizarAcessoUsuario'), perfil: 'administrador' }).success,
    ).toBe(true);
  });
  it('cobre as rotas com RPC definida e identifica a reconciliação ainda sem RPC', () => {
    const rotasSemRpc = Object.keys(contratosRotas).filter((rota) => !(rota in assinaturasRpc));
    expect(rotasSemRpc).toEqual([
      'desafioTecnico',
      'consultarOperacoesCadastro',
      'consultarAnamnese',
      'salvarAnamnese',
    ]);
    expect(Object.keys(assinaturasRpc).every((rota) => rota in contratosRotas)).toBe(true);
    expect(contratosRpc.admitirSessao.contexto).toBe('somente-servidor');
  });

  for (const rota of Object.keys(assinaturasRpc) as Rota[]) {
    const contrato = assinaturasRpc[rota];
    it(`${rota}: aceita entrada interna completa e resultado esperado`, () => {
      expect(contrato.argumentoSql).toBe('p_entrada');
      expect(contrato.entrada.safeParse(entrada(rota)).success).toBe(true);
      expect(
        contrato.saida.safeParse({ ok: true, dados: saidas[rota], request_id: uuid }).success,
      ).toBe(true);
      expect(
        contrato.saida.safeParse({ ok: false, erro: { codigo: 'sem_permissao' }, request_id: uuid })
          .success,
      ).toBe(true);
      expect(
        contrato.saida.safeParse({
          ok: false,
          erro: { codigo: 'sem_permissao', mensagem: 'PII indevida' },
          request_id: uuid,
        }).success,
      ).toBe(false);
      expect(contrato.saida.safeParse({ ok: true, dados: {}, request_id: uuid }).success).toBe(
        false,
      );
      expect(
        contrato.entrada.safeParse({ ...entrada(rota), ator_autodeclarado_id: uuid }).success,
      ).toBe(false);
      if (rota !== 'consultarAuditoria') {
        expect(contrato.entrada.safeParse({ ...entrada(rota), ator_id: uuid }).success).toBe(false);
      }
      const semRequest = { ...entrada(rota), request_id: undefined };
      expect(contrato.entrada.safeParse(semRequest).success).toBe(false);
    });

    it(`${rota}: exige cada ID interno e rejeita texto claro`, () => {
      const completo = entrada(rota);
      for (const [campo, valor] of Object.entries(completo)) {
        if (
          campo.endsWith('_id') ||
          campo === 'chave_idempotencia' ||
          campo === 'digest_idempotencia' ||
          campo === 'versao_esperada'
        ) {
          const incompleto = { ...completo, [campo]: undefined };
          expect(contrato.entrada.safeParse(incompleto).success, campo).toBe(false);
        }
        if (valor === cifra) {
          expect(
            contrato.entrada.safeParse({ ...completo, [campo]: 'Texto pessoal fictício' }).success,
            campo,
          ).toBe(false);
        }
      }
      if (contrato.executor === 'jwt-do-solicitante') {
        const { atestado, ...semAtestado } = completo;
        expect(contrato.entrada.safeParse(semAtestado).success).toBe(false);
        const prova = atestado as Record<string, unknown>;
        for (const campo of Object.keys(prova)) {
          const parcial = { ...prova, [campo]: undefined };
          expect(
            contrato.entrada.safeParse({ ...completo, atestado: parcial }).success,
            campo,
          ).toBe(false);
        }
        expect(
          contrato.entrada.safeParse({
            ...completo,
            atestado: { ...prova, operacao: 'api.outra_operacao' },
          }).success,
        ).toBe(false);
        expect(
          contrato.entrada.safeParse({ ...completo, atestado: { ...prova, request_id: outroUuid } })
            .success,
        ).toBe(false);
      }
    });
  }

  it('aceita estruturalmente retries com HMAC lógico estável e payload cifrado diferente', () => {
    const primeira = entrada('criarPaciente');
    const segunda = {
      ...primeira,
      digest_idempotencia: primeira.digest_idempotencia,
      request_id: outroUuid,
      paciente_id: outroUuid,
      aad: {
        nome: { tabela: 'cadastro.paciente', registro_id: outroUuid, campo: 'nome', formato: 1 },
        nome_preferencia: {
          tabela: 'cadastro.paciente',
          registro_id: outroUuid,
          campo: 'nome_preferencia',
          formato: 1,
        },
        data_nascimento: {
          tabela: 'cadastro.paciente',
          registro_id: outroUuid,
          campo: 'data_nascimento',
          formato: 1,
        },
      },
      auditoria_id: outroUuid,
      nome: { ...cifra, nonce: 'bm92by1ub25jZQ', ciphertext: 'bm92by1jaXBoZXI' },
      atestado: {
        ...(primeira.atestado as Record<string, unknown>),
        request_id: outroUuid,
        digest_entrada: 'ZGlnZXN0LWRpZmVyZW50ZQ',
        mac: 'b3V0cm8tbWFj',
      },
    };
    expect(segunda.digest_idempotencia).toBe(primeira.digest_idempotencia);
    expect(assinaturasRpc.criarPaciente.entrada.safeParse(primeira).success).toBe(true);
    expect(assinaturasRpc.criarPaciente.entrada.safeParse(segunda).success).toBe(true);
    // São fixtures de estrutura: não calculam HMAC nem executam o ledger no banco.
  });

  it('exige provas Google e mantém entrada técnica sem senha ou perfil', () => {
    for (const campo of ['subject_google', 'email_hmac', 'desafio_id', 'nonce_hash']) {
      const incompleta: Record<string, unknown> = { ...google, [campo]: undefined };
      expect(
        assinaturasRpc.entrarGoogle.entrada.safeParse({
          ...entrada('entrarGoogle'),
          identidade: incompleta,
        }).success,
      ).toBe(false);
    }
    for (const rota of ['entrarTecnico', 'renovarSessao', 'sairSessao'] as const) {
      expect(
        assinaturasRpc[rota].entrada.safeParse({
          ...entrada(rota),
          identidade: { session_id: uuid },
        }).success,
      ).toBe(false);
      for (const campo of ['perfil', 'senha', 'credencial']) {
        expect(
          assinaturasRpc[rota].entrada.safeParse({
            ...entrada(rota),
            identidade: {
              ...(rota === 'entrarTecnico' ? tecnica : identidadeSessao),
              [campo]: 'indevido',
            },
          }).success,
        ).toBe(false);
      }
    }
    for (const rota of ['renovarSessao', 'sairSessao'] as const) {
      expect(
        assinaturasRpc[rota].entrada.safeParse({ request_id: uuid, identidade: google }).success,
      ).toBe(false);
      expect(
        assinaturasRpc[rota].entrada.safeParse({ request_id: uuid, identidade: tecnica }).success,
      ).toBe(false);
    }
  });

  it('exige envelope cifrado estrito na admissão Google e técnica', () => {
    for (const rota of ['entrarGoogle', 'entrarTecnico'] as const) {
      const completo = entrada(rota);
      const schema = assinaturasRpc[rota].entrada;
      expect(schema.safeParse(completo).success).toBe(true);
      expect(schema.safeParse({ ...completo, credencial_refresh: undefined }).success).toBe(false);
      expect(
        schema.safeParse({ ...completo, credencial_refresh: 'refresh-ficticio' }).success,
      ).toBe(false);
      expect(
        schema.safeParse({ ...completo, credencial_refresh: { ...cifra, extra: 'indevido' } })
          .success,
      ).toBe(false);
    }
  });

  it('rejeita contato composto sem ID pré-gerado ou com valor claro', () => {
    for (const contato of [
      { tipo: 'email', valor: cifra },
      { contato_id: uuid, tipo: 'email', valor: 'ficticio@exemplo.test' },
    ]) {
      expect(
        assinaturasRpc.criarRelacao.entrada.safeParse({
          ...entrada('criarRelacao'),
          contatos: [contato],
        }).success,
      ).toBe(false);
    }
  });

  it('mantém projeções cifradas distintas e rejeita dados administrativos no básico', () => {
    expect(pacienteBasicoRpcSaidaSchema.safeParse(administrativo).success).toBe(false);
    expect(
      assinaturasRpc.consultarPaciente.saida.safeParse({
        ok: true,
        request_id: uuid,
        dados: administrativo,
      }).success,
    ).toBe(true);
    expect(
      pacienteBasicoRpcSaidaSchema.safeParse({ ...paciente, nome: 'Nome fictício' }).success,
    ).toBe(false);
    expect(
      assinaturasRpc.listarPacientes.saida.safeParse({
        ok: true,
        request_id: uuid,
        dados: pagina(administrativo),
      }).success,
    ).toBe(false);
    expect(
      assinaturasRpc.listarConcessoes.saida.safeParse({
        ok: true,
        request_id: uuid,
        dados: pagina({ ...concessao, email: 'ficticio@exemplo.test' }),
      }).success,
    ).toBe(false);
  });

  it('fixa tabela, registro, campo e versão no AAD', () => {
    const aad = { tabela: 'cadastro.paciente', registro_id: uuid, campo: 'nome', formato: 1 };
    expect(metadadosAadSchema.safeParse(aad).success).toBe(true);
    expect(metadadosAadSchema.safeParse({ ...aad, formato: 2 }).success).toBe(false);
    expect(metadadosAadSchema.safeParse({ ...aad, registro_id: undefined }).success).toBe(false);
  });
});
