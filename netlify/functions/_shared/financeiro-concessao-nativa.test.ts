import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { metadadosAadConcessaoSchema } from '../../../packages/contracts/src/rpc.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import {
  operarFinanceiroNativo,
  type ComandoFinanceiro,
  type PortasFinanceiras,
} from './financeiro-nativo.ts';

/** Dados fictícios. Nenhum e-mail, nome ou valor real.
 *
 * O que estes testes provam é a METADE DE SERVIDOR da concessão da audiência financeira
 * (FR-068): que a borda repassa inteira a negativa do banco, não inventa sucesso e não
 * devolve conteúdo financeiro nenhum. A decisão é do banco — `operacao.
 * financeiro_concessao_privada` exige Administrador e recusa marcar concessão que não seja
 * de profissional vinculado —, e está provada em `supabase/tests/financeiro_*_local.sql`. */
const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
/** Concessão do próprio solicitante, perfil `administrador`: o alvo da autoconcessão. */
const concessao_propria = 'c0000000-0000-4000-8000-000000000003';
/** Concessão de uma colega profissional, com acesso ativo. */
const concessao_colega = 'd0000000-0000-4000-8000-000000000004';
const colega_usuario_id = 'e0000000-0000-4000-8000-000000000005';
const chave = '11111111-1111-4111-8111-111111111111';

function cifraDeTeste() {
  return criarCifraAutenticada({
    keyIdAtiva: 'fin-v1',
    chavesDeCifra: { 'fin-v1': new Uint8Array(32).fill(7) },
    chaveHmac: new Uint8Array(32).fill(23),
  });
}

type LinhaFalsa = {
  concessao_id: string;
  usuario_id: string | null;
  email: string;
  perfil: 'administrador' | 'profissional';
  estado: 'pendente' | 'vinculada' | 'revogada';
  habilitado: boolean;
  versao: number;
};

type RespostaFalsa = (acao: string, entrada: Record<string, unknown>) => unknown | Promise<unknown>;

function preparar(opcoes: { responder: RespostaFalsa }) {
  const cifra = cifraDeTeste();
  const executar = vi.fn(
    async (
      _wrapper: string,
      transporte: {
        p_transporte: { entrada: Record<string, unknown> & { atestado: { operacao: string } } };
      },
    ) => {
      const { atestado, ...entrada } = transporte.p_transporte.entrada;
      return opcoes.responder(atestado.operacao, entrada);
    },
  );
  const autorizacao = async () =>
    ({ estado: 'autorizado', identidade: { usuario_id, session_id } }) as const;
  const portas: PortasFinanceiras = {
    cifra,
    idempotencia: criarIdempotenciaNativa(cifra),
    executar: executar as unknown as PortasFinanceiras['executar'],
    autorizar: autorizacao,
    revalidar: autorizacao,
    // Mesma porta estreita da produção: AAD de `identidade.concessao_equipe`, campo fixo.
    identidade: {
      decifrarEmailConcessao: (valor, concessaoId) =>
        cifra.decifrar(
          valor,
          metadadosAadConcessaoSchema.parse({
            tabela: 'identidade.concessao_equipe',
            registro_id: concessaoId,
            campo: 'email',
            formato: 1,
          }),
        ),
    },
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-11-20T12:00:00Z',
      expira_em: '2026-11-20T12:00:30Z',
    }),
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    storage: {
      obter: async () => {
        throw new Error('A concessão não toca comprovante.');
      },
      enviar: async () => {
        throw new Error('A concessão não toca comprovante.');
      },
    },
  };
  const request = new Request('https://exemplo.test/', {
    headers: { 'x-sessao': session_id, 'x-chave-idempotencia': chave },
  });
  return { portas, request, executar, cifra };
}

const cifrarEmail = async (
  cifra: ReturnType<typeof cifraDeTeste>,
  concessaoId: string,
  email: string,
) =>
  cifra.cifrar(email, {
    tabela: 'identidade.concessao_equipe',
    registro_id: concessaoId,
    campo: 'email',
    formato: 1,
  });

/** Banco fictício com estado: guarda a marca e devolve a linha relida, como a RPC faz. */
function bancoFalso(linhas: LinhaFalsa[], cifra: ReturnType<typeof cifraDeTeste>) {
  const emLinha = async (linha: LinhaFalsa) => ({
    concessao_id: linha.concessao_id,
    usuario_id: linha.usuario_id,
    email: await cifrarEmail(cifra, linha.concessao_id, linha.email),
    perfil: linha.perfil,
    estado: linha.estado,
    habilitado: linha.habilitado,
    versao: linha.versao,
  });
  return {
    linhas,
    responder: (async (acao, entrada) => {
      const request_id = entrada.request_id as string;
      if (acao === 'api.listar_concessao_financeira')
        return { ok: true, dados: await Promise.all(linhas.map(emLinha)), request_id };
      const alvo = linhas.find((linha) => linha.concessao_id === entrada.concessao_id);
      const habilitado = entrada.habilitado === true;
      // Regra do banco, reproduzida aqui só para o dublê não mentir sobre a sequência:
      // marcar exige profissional vinculado; desmarcar é sempre possível.
      if (
        !alvo ||
        alvo.versao !== entrada.versao_esperada ||
        (habilitado && (alvo.perfil !== 'profissional' || alvo.estado !== 'vinculada'))
      )
        return { ok: false, erro: { codigo: 'conflito' }, request_id };
      alvo.habilitado = habilitado;
      alvo.versao += 1;
      return { ok: true, dados: await emLinha(alvo), request_id };
    }) satisfies RespostaFalsa,
  };
}

const equipeFicticia = (): LinhaFalsa[] => [
  {
    concessao_id: concessao_propria,
    usuario_id,
    email: 'admin.ficticia@exemplo.test',
    perfil: 'administrador',
    estado: 'vinculada',
    habilitado: false,
    versao: 0,
  },
  {
    concessao_id: concessao_colega,
    usuario_id: colega_usuario_id,
    email: 'colega.ficticia@exemplo.test',
    perfil: 'profissional',
    estado: 'vinculada',
    habilitado: false,
    versao: 0,
  },
];

const listar: ComandoFinanceiro = { operacao: 'listarConcessoes' };
const gravar = (concessao_id: string, habilitado: boolean, versao_esperada: number) =>
  ({ operacao: 'gravarConcessao', concessao_id, habilitado, versao_esperada }) as const;

/** Nenhum destes nomes pode aparecer na resposta da superfície de concessão. */
const CAMPOS_FINANCEIROS = [
  'valor',
  'centavos',
  'despesa',
  'apuracao',
  'apuração',
  'total',
  'vigencia',
  'comprovante',
];
const semConteudoFinanceiro = (resultado: unknown) => {
  const texto = JSON.stringify(resultado).toLowerCase();
  for (const campo of CAMPOS_FINANCEIROS) expect(texto).not.toContain(campo);
};

describe('concessão da audiência financeira — metade de servidor (FR-068)', () => {
  it('lista a equipe com a marca, sem revelar conteúdo financeiro', async () => {
    const { portas, request, executar, cifra } = preparar({
      responder: (acao, entrada) => bancoFalso(equipeFicticia(), cifra).responder(acao, entrada),
    });
    const resultado = await operarFinanceiroNativo(request, listar, portas);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.dados).toEqual([
      {
        concessao_id: concessao_propria,
        usuario_id,
        email: 'admin.ficticia@exemplo.test',
        perfil: 'administrador',
        estado: 'vinculada',
        habilitado: false,
        versao: 0,
      },
      {
        concessao_id: concessao_colega,
        usuario_id: colega_usuario_id,
        email: 'colega.ficticia@exemplo.test',
        perfil: 'profissional',
        estado: 'vinculada',
        habilitado: false,
        versao: 0,
      },
    ]);
    semConteudoFinanceiro(resultado.dados);
    // Nenhuma leitura de vínculo de caso: uma única chamada, e sem paciente nenhum nela.
    expect(executar).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(executar.mock.calls[0])).not.toContain('paciente');
  });

  it('a negativa de quem não é Administrador vem do banco e atravessa intacta', async () => {
    // Nem a borda nem a tela decidem: o dublê devolve o que `operacao.
    // financeiro_concessao_privada` devolve a quem não passa no bloco admin-only.
    for (const comando of [listar, gravar(concessao_colega, true, 0)]) {
      const { portas, request } = preparar({
        responder: (_acao, entrada) => ({
          ok: false,
          erro: { codigo: 'sem_permissao' },
          request_id: entrada.request_id,
        }),
      });
      const resultado = await operarFinanceiroNativo(request, comando, portas);
      expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
      semConteudoFinanceiro(resultado);
    }
  });

  it('autoconcessão é recusada: o alvo é a própria concessão de Administrador', async () => {
    const banco = bancoFalso(equipeFicticia(), cifraDeTeste());
    const { portas, request } = preparar({ responder: banco.responder });
    const resultado = await operarFinanceiroNativo(
      request,
      gravar(concessao_propria, true, 0),
      portas,
    );
    // `conflito` é a recusa do banco: a marca só vale para perfil `profissional`, e a
    // concessão de quem concede é `administrador`. A borda não converte isso em sucesso.
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'conflito' } });
    expect(banco.linhas[0]).toMatchObject({ habilitado: false, versao: 0 });
  });

  it('a revogação vale na leitura seguinte', async () => {
    const banco = bancoFalso(equipeFicticia(), cifraDeTeste());
    const { portas, request } = preparar({ responder: banco.responder });
    const concedido = await operarFinanceiroNativo(
      request,
      gravar(concessao_colega, true, 0),
      portas,
    );
    expect(concedido).toMatchObject({ ok: true, dados: { habilitado: true, versao: 1 } });
    expect(await operarFinanceiroNativo(request, listar, portas)).toMatchObject({
      ok: true,
      dados: [{ habilitado: false }, { concessao_id: concessao_colega, habilitado: true }],
    });

    const revogado = await operarFinanceiroNativo(
      request,
      gravar(concessao_colega, false, 1),
      portas,
    );
    expect(revogado).toMatchObject({ ok: true, dados: { habilitado: false, versao: 2 } });
    // A leitura SEGUINTE já nega, sem passo intermediário e sem cache na borda.
    expect(await operarFinanceiroNativo(request, listar, portas)).toMatchObject({
      ok: true,
      dados: [{ habilitado: false }, { concessao_id: concessao_colega, habilitado: false }],
    });
  });

  it('revogar continua possível mesmo com o acesso já encerrado', async () => {
    const linhas = equipeFicticia();
    const colega = linhas[1];
    if (!colega) throw new Error('Equipe fictícia incompleta.');
    linhas[1] = { ...colega, estado: 'revogada', habilitado: true, versao: 3 };
    const banco = bancoFalso(linhas, cifraDeTeste());
    const { portas, request } = preparar({ responder: banco.responder });
    expect(
      await operarFinanceiroNativo(request, gravar(concessao_colega, false, 3), portas),
    ).toMatchObject({ ok: true, dados: { habilitado: false, versao: 4 } });
  });

  it('a gravação carrega versão esperada, chave e digest de idempotência ao banco', async () => {
    const banco = bancoFalso(equipeFicticia(), cifraDeTeste());
    const { portas, request, executar } = preparar({ responder: banco.responder });
    await operarFinanceiroNativo(request, gravar(concessao_colega, true, 0), portas);
    const chamada = executar.mock.calls[0];
    if (!chamada) throw new Error('O banco não foi chamado.');
    const entrada = (chamada[1] as { p_transporte: { entrada: Record<string, unknown> } })
      .p_transporte.entrada;
    expect(entrada).toMatchObject({
      concessao_id: concessao_colega,
      habilitado: true,
      versao_esperada: 0,
      chave_idempotencia: chave,
    });
    expect(entrada.digest_idempotencia).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(entrada.auditoria_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sem a porta de identidade a listagem falha fechada, sem e-mail cifrado na resposta', async () => {
    const banco = bancoFalso(equipeFicticia(), cifraDeTeste());
    const { portas, request } = preparar({ responder: banco.responder });
    const { identidade: _ausente, ...semIdentidade } = portas;
    const resultado = await operarFinanceiroNativo(request, listar, semIdentidade);
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
    expect(JSON.stringify(resultado)).not.toContain('ciphertext');
  });
});
