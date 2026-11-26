import { expect, it, vi } from 'vitest';
import { idLinhaFichaPlantao, operarFichaPlantaoNativa } from './ficha-plantao-nativa.ts';

/** FR-073 a FR-077. Dados fictícios. Prova a composição: uma ficha por plantão, conteúdo
 * canônico fora do texto livre, AAD por campo e por linha, e a leitura de volta. Nenhuma
 * decisão de autorização acontece aqui — ela é do banco, e estes testes não a substituem. */

const usuario = '60000000-0000-4000-8000-000000000001';
const sessao = '60000000-0000-4000-8000-000000000002';
const paciente = '60000000-0000-4000-8000-000000000003';
const turno = '60000000-0000-4000-8000-000000000004';

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
        // Dublê: o envelope carrega o AAD para que o teste prove a ligação campo a campo.
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

it('o identificador da linha é determinístico e muda a cada versão', async () => {
  const um = await idLinhaFichaPlantao('cadastro.turno_plantao_versao', turno, 1);
  const outro = await idLinhaFichaPlantao('cadastro.turno_plantao_versao', turno, 1);
  const dois = await idLinhaFichaPlantao('cadastro.turno_plantao_versao', turno, 2);
  expect(um).toBe(outro);
  expect(um).not.toBe(dois);
  expect(um).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

it('recusa ficha cujo registro não é o próprio plantão: uma ficha por plantão', async () => {
  const { portas: p, executar } = portas(() => ({}));
  const resultado = await operarFichaPlantaoNativa(
    pedido(),
    {
      operacao: 'submeter',
      paciente_id: paciente,
      corpo: {
        turno_id: turno,
        registro_id: '60000000-0000-4000-8000-00000000000f',
        versao_esperada: 0,
        conteudo: {},
      },
    },
    p,
  );
  expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
  expect(executar).not.toHaveBeenCalled();
});

it('separa pendência escrita do conteúdo e não deixa texto livre entrar no lugar do canônico', async () => {
  const linha = await idLinhaFichaPlantao('cadastro.turno_plantao_versao', turno, 1);
  const { portas: p, executar } = portas((request_id) => ({
    ok: true,
    repeticao: false,
    request_id,
    dados: {
      ficha: {
        registro_id: turno,
        paciente_id: paciente,
        turno_id: turno,
        versao: 1,
        periodo: 'noturno',
        papel_declarado: 'Enfermeira',
        atividades: {
          formato: 1,
          key_id: 'chave-ficticia',
          nonce: b64(
            JSON.stringify({
              tabela: 'cadastro.turno_plantao_versao',
              registro_id: linha,
              campo: 'atividades',
              formato: 1,
            }),
          ),
          ciphertext: b64('Leitura fictícia em voz alta.'),
          tag: b64('tag'),
        },
        atividades_fonte: 'observacao_direta',
        atividades_visibilidade: 'compartilhavel',
        observacoes: null,
        observacoes_fonte: null,
        observacoes_visibilidade: null,
        autor_usuario_id: usuario,
        registrado_em: '2026-11-20T22:00:00.000Z',
        retroativo: false,
      },
      pendencias: [],
      rascunho: null,
    },
  }));
  const resultado = await operarFichaPlantaoNativa(
    pedido(),
    {
      operacao: 'submeter',
      paciente_id: paciente,
      corpo: {
        turno_id: turno,
        registro_id: turno,
        versao_esperada: 0,
        conteudo: {
          periodo: 'noturno',
          papel_declarado: 'Enfermeira',
          atividades: {
            texto: 'Leitura fictícia em voz alta.',
            fonte: 'observacao_direta',
            visibilidade: 'compartilhavel',
          },
          estado_emocional: {
            estado: 'tranquilo',
            instante_ocorrencia: '2026-11-20T21:00:00.000Z',
          },
          pendencias: [
            {
              pendencia_id: '60000000-0000-4000-8000-000000000005',
              conteudo: {
                texto: 'Confirmar receita fictícia.',
                fonte: 'observacao_direta',
                visibilidade: 'interna',
              },
            },
          ],
        },
      },
    },
    p,
  );
  expect(resultado.ok).toBe(true);
  const entrada = executar.mock.calls[0]?.[0]?.p_transporte?.entrada as Record<string, unknown>;
  const conteudo = entrada.conteudo as Record<string, unknown>;
  // A pendência é irmã do conteúdo, como a RPC exige, e o conteúdo não ganha chave nova.
  expect(Object.keys(conteudo).sort()).toEqual([
    'atividades',
    'estado_emocional',
    'papel_declarado',
    'periodo',
  ]);
  expect(Array.isArray(entrada.pendencias)).toBe(true);
  expect(entrada.registro_id).toBe(turno);
  expect(entrada.id).toBe(linha);
  // Nenhum conteúdo canônico — refeição, hidratação, prescrição, administração — trafega
  // como texto da ficha, e a ficha não compõe transporte canônico nenhum nesta fatia.
  expect(entrada).not.toHaveProperty('canonicos');
  const bruto = JSON.stringify(conteudo);
  for (const proibido of ['refeicao', 'hidratacao', 'prescricao', 'administracao'])
    expect(bruto).not.toContain(proibido);
  // Estado emocional sem valor, nota ou escala: só rótulo, instante e identificador.
  expect(Object.keys(conteudo.estado_emocional as object).sort()).toEqual([
    'estado',
    'id',
    'instante_ocorrencia',
  ]);
  expect(resultado.ok && resultado.dados.ficha?.atividades?.texto).toBe(
    'Leitura fictícia em voz alta.',
  );
});

it('o rascunho volta decifrado pelo identificador da própria linha', async () => {
  const rascunhoId = '60000000-0000-4000-8000-000000000009';
  const { portas: p } = portas((request_id) => ({
    ok: true,
    repeticao: false,
    request_id,
    dados: {
      ficha: null,
      pendencias: [],
      rascunho: {
        rascunho_id: rascunhoId,
        turno_id: turno,
        paciente_id: paciente,
        conteudo: {
          formato: 1,
          key_id: 'chave-ficticia',
          nonce: b64(
            JSON.stringify({
              tabela: 'cadastro.ficha_plantao_rascunho',
              registro_id: rascunhoId,
              campo: 'conteudo',
              formato: 1,
            }),
          ),
          ciphertext: b64(JSON.stringify({ papel_declarado: 'Acompanhante terapêutico' })),
          tag: b64('tag'),
        },
        atualizado_em: '2026-11-20T20:00:00.000Z',
      },
    },
  }));
  const resultado = await operarFichaPlantaoNativa(
    pedido('GET'),
    { operacao: 'rascunho_ler', paciente_id: paciente, turno_id: turno },
    p,
  );
  expect(resultado.ok && resultado.dados.rascunho).toMatchObject({
    turno_id: turno,
    publicado: false,
    conteudo: { papel_declarado: 'Acompanhante terapêutico' },
  });
});
