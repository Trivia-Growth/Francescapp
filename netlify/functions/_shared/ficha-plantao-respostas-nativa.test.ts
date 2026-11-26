import { expect, it, vi } from 'vitest';
import { operarFichaPlantaoNativa } from './ficha-plantao-nativa.ts';

/** FR-078/FR-081. Dados fictícios. Prova o que o teste da ficha não cobre: a resposta de
 * campo ACRESCENTADO pelo Administrador tem envelope próprio por campo e por versão, o
 * retrato id->versão do modelo viaja junto da publicação, e a leitura de volta só abre o
 * envelope com o AAD da resposta certa. Nenhuma decisão de autorização acontece aqui — ela
 * é do banco, e estes testes não a substituem.
 *
 * Por que este teste existe: reusar o envelope de um campo para outro, ou o de uma versão
 * para a seguinte, é falha silenciosa — o conteúdo continuaria legível e ninguém notaria.
 * O dublê de cifra falha fechado quando o AAD não bate, e é isso que o teste exercita. */

const usuario = '70000000-0000-4000-8000-000000000001';
const sessao = '70000000-0000-4000-8000-000000000002';
const paciente = '70000000-0000-4000-8000-000000000003';
const turno = '70000000-0000-4000-8000-000000000004';
const campoA = '70000000-0000-4000-8000-00000000000a';
const campoB = '70000000-0000-4000-8000-00000000000b';

const b64 = (valor: string) =>
  Buffer.from(valor, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const deb64 = (valor: string) =>
  Buffer.from(valor.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

const pedido = (metodo = 'POST') =>
  new Request('https://exemplo.test/api/pacientes/x/ficha-plantao', {
    method: metodo,
    headers: new Headers({ 'x-sessao': sessao, 'x-chave-idempotencia': 'c'.repeat(32) }),
  });

function portas(resposta: (requestId: string) => unknown) {
  const executar = vi.fn();
  const autorizacao = {
    estado: 'autorizado' as const,
    identidade: { usuario_id: usuario, session_id: sessao },
  };
  return {
    executar,
    portas: {
      autorizar: async () => autorizacao,
      revalidar: async () => autorizacao,
      metadados: (requestId: string) => ({
        key_id: 'chave-ficticia',
        emitido_em: new Date(Date.now() - 1000).toISOString(),
        expira_em: new Date(Date.now() + 20_000).toISOString(),
        request_id: requestId,
      }),
      idempotencia: { calcularDigestIdempotencia: async () => 'd'.repeat(43) },
      cifra: {
        cifrar: async (valor: string, aad: unknown) => ({
          formato: 1 as const,
          key_id: 'chave-ficticia',
          nonce: b64(JSON.stringify(aad)),
          ciphertext: b64(valor),
          tag: b64('tag'),
        }),
        decifrar: async (envelope: { nonce: string; ciphertext: string }, aad: unknown) => {
          if (envelope.nonce !== b64(JSON.stringify(aad)))
            throw new Error('AAD incompatível com o envelope.');
          return deb64(envelope.ciphertext);
        },
      },
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
            atestado: {
              ...(JSON.parse(dadosCanonicos) as Record<string, unknown>),
              mac: 'mac-ficticio',
            },
          };
        },
      },
      executar: async (
        _request: Request,
        transporte: { p_transporte: { entrada: Record<string, unknown> } },
      ) => {
        executar(transporte);
        return resposta(String(transporte.p_transporte.entrada.request_id));
      },
    },
  };
}

const submissao = (respostas: unknown, snapshot: Record<string, number> | undefined) => ({
  operacao: 'submeter' as const,
  paciente_id: paciente,
  corpo: {
    turno_id: turno,
    registro_id: turno,
    versao_esperada: 0,
    conteudo: { respostas },
    ...(snapshot === undefined ? {} : { campos_extras_catalogo: snapshot }),
  },
});

const respostaDeCampo = (campo: string, texto: string) => ({
  campo_id: campo,
  texto,
  fonte: 'observacao_direta' as const,
  visibilidade: 'interna' as const,
});

it('cada resposta ganha envelope próprio, com AAD da sua tabela, campo e versão', async () => {
  const { portas: p, executar } = portas((requestId) => ({
    ok: true,
    repeticao: false,
    request_id: requestId,
    dados: { ficha: null, pendencias: [], rascunho: null },
  }));
  const resultado = await operarFichaPlantaoNativa(
    pedido(),
    submissao(
      [respostaDeCampo(campoA, 'Texto fictício A.'), respostaDeCampo(campoB, 'Texto fictício B.')],
      { [campoA]: 3, [campoB]: 1 },
    ),
    p,
  );
  expect(resultado.ok).toBe(true);
  const entrada = executar.mock.calls[0]?.[0]?.p_transporte?.entrada as Record<string, unknown>;
  const conteudo = entrada.conteudo as Record<string, unknown>;
  const respostas = conteudo.respostas as {
    campo_id: string;
    id: string;
    conteudo: { nonce: string };
    aad: { tabela: string; registro_id: string; campo: string; formato: number };
  }[];
  expect(respostas).toHaveLength(2);
  // O retrato do modelo viaja com a publicação: é contra ele que o banco revalida sob lock.
  expect(entrada.campos_extras_catalogo).toEqual({ [campoA]: 3, [campoB]: 1 });
  for (const item of respostas) {
    // Forma genérica do repositório, sem convenção nova, e `registro_id` no id da LINHA.
    expect(Object.keys(item.aad).sort()).toEqual(['campo', 'formato', 'registro_id', 'tabela']);
    expect(item.aad.tabela).toBe('cadastro.turno_plantao_resposta_versao');
    expect(item.aad.campo).toBe('conteudo');
    expect(item.aad.registro_id).toBe(item.id);
    expect(item.conteudo.nonce).toBe(b64(JSON.stringify(item.aad)));
  }
  // Dois campos da MESMA ficha e da mesma versão não compartilham linha nem envelope.
  expect(respostas[0]?.id).not.toBe(respostas[1]?.id);
  expect(respostas[0]?.conteudo.nonce).not.toBe(respostas[1]?.conteudo.nonce);
});

it('o envelope de uma versão da ficha não serve para a versão seguinte', async () => {
  const linhas: string[] = [];
  for (const versaoEsperada of [0, 1]) {
    const { portas: p, executar } = portas((requestId) => ({
      ok: true,
      repeticao: false,
      request_id: requestId,
      dados: { ficha: null, pendencias: [], rascunho: null },
    }));
    const base = submissao([respostaDeCampo(campoA, 'Texto fictício A.')], { [campoA]: 1 });
    const resultado = await operarFichaPlantaoNativa(
      pedido(),
      {
        ...base,
        corpo: {
          ...base.corpo,
          versao_esperada: versaoEsperada,
          ...(versaoEsperada === 0 ? {} : { motivo: 'Correção fictícia.' }),
        },
      },
      p,
    );
    expect(resultado.ok).toBe(true);
    const entrada = executar.mock.calls[0]?.[0]?.p_transporte?.entrada as Record<string, unknown>;
    const respostas = (entrada.conteudo as Record<string, unknown>).respostas as { id: string }[];
    linhas.push(String(respostas[0]?.id));
  }
  expect(linhas[0]).not.toBe(linhas[1]);
});

it('recusa resposta sem o retrato do modelo: sem ele não há o que revalidar sob lock', async () => {
  const { portas: p, executar } = portas(() => ({}));
  const resultado = await operarFichaPlantaoNativa(
    pedido(),
    submissao([respostaDeCampo(campoA, 'Texto fictício A.')], undefined),
    p,
  );
  expect(resultado.ok).toBe(false);
  expect(resultado.ok === false && resultado.erro.codigo).toBe('entrada_invalida');
  expect(executar).not.toHaveBeenCalled();
});

it('lê de volta a resposta de campo desativado, legível e marcada como tal', async () => {
  const registrada = { texto: '', nonce: '' };
  const { portas: p } = portas((requestId) => ({
    ok: true,
    repeticao: false,
    request_id: requestId,
    dados: {
      ficha: {
        registro_id: turno,
        paciente_id: paciente,
        turno_id: turno,
        versao: 1,
        periodo: null,
        papel_declarado: null,
        atividades: null,
        atividades_fonte: null,
        atividades_visibilidade: null,
        observacoes: null,
        observacoes_fonte: null,
        observacoes_visibilidade: null,
        respostas: [
          {
            campo_id: campoA,
            campo_nome: 'Campo fictício desativado',
            campo_tipo: 'texto',
            campo_ativo: false,
            campo_versao: 1,
            conteudo: {
              formato: 1,
              key_id: 'chave-ficticia',
              nonce: registrada.nonce,
              ciphertext: registrada.texto,
              tag: b64('tag'),
            },
            fonte: 'relato_familiar',
            visibilidade: 'compartilhavel',
          },
        ],
        autor_usuario_id: usuario,
        registrado_em: '2026-11-20T22:00:00.000Z',
        retroativo: false,
      },
      pendencias: [],
      rascunho: null,
    },
  }));
  // O envelope devolvido é o que a própria composição produziria para (campo, registro,
  // versão): é assim que a leitura de volta prova a ligação, em vez de supô-la.
  const { portas: pEscrita, executar } = portas((requestId) => ({
    ok: true,
    repeticao: false,
    request_id: requestId,
    dados: { ficha: null, pendencias: [], rascunho: null },
  }));
  await operarFichaPlantaoNativa(
    pedido(),
    submissao([respostaDeCampo(campoA, 'Texto fictício preservado.')], { [campoA]: 1 }),
    pEscrita,
  );
  const entrada = executar.mock.calls[0]?.[0]?.p_transporte?.entrada as Record<string, unknown>;
  const enviada = (entrada.conteudo as Record<string, unknown>).respostas as {
    conteudo: { nonce: string; ciphertext: string };
  }[];
  registrada.nonce = String(enviada[0]?.conteudo.nonce);
  registrada.texto = String(enviada[0]?.conteudo.ciphertext);

  const leitura = await operarFichaPlantaoNativa(
    pedido('GET'),
    { operacao: 'consultar', paciente_id: paciente, turno_id: turno },
    p,
  );
  expect(leitura.ok).toBe(true);
  const ficha = leitura.ok === true ? leitura.dados.ficha : null;
  expect(ficha?.respostas).toEqual([
    {
      campo_id: campoA,
      campo_nome: 'Campo fictício desativado',
      campo_ativo: false,
      texto: 'Texto fictício preservado.',
      fonte: 'relato_familiar',
      visibilidade: 'compartilhavel',
    },
  ]);
});
