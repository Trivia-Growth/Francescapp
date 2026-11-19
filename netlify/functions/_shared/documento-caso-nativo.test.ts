import { describe, expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { operarDocumentoCasoNativo } from './documento-caso-nativo.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
const paciente_id = 'c0000000-0000-4000-8000-000000000003';
const documento_id = 'd0000000-0000-4000-8000-000000000004';

const metadado = {
  categoria: 'Laudo',
  origem: 'Clínica fictícia',
  data_documento: '2026-03-04',
  audiencia: 'equipe' as const,
  estado: 'disponivel' as const,
};
const conteudo = { nome_visivel: 'laudo-ficticio.pdf', drive_file_id: 'pendente' };

const request = () =>
  new Request('https://exemplo.test/', {
    headers: { 'x-sessao': session_id, 'x-chave-idempotencia': 'chave_ficticia_123456' },
  });

function portas(opcoes: { falharNoBanco?: boolean; removerFalha?: boolean } = {}) {
  const identidade = { usuario_id, session_id };
  const cifra = criarCifraAutenticada({
    keyIdAtiva: 'teste',
    chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
    chaveHmac: new Uint8Array(32).fill(4),
  });
  const enviar = vi.fn(
    async (_entrada: {
      nome: string;
      tipo: string;
      bytes: Uint8Array;
      pastaRaiz: string;
      pastaPaciente?: string;
    }) => ({ file_id: 'arquivo-ficticio-no-drive' }),
  );
  const remover = vi.fn(async () => {
    if (opcoes.removerFalha) throw new Error('Drive fora do ar');
  });
  return {
    enviar,
    remover,
    portas: {
      idempotencia: criarIdempotenciaNativa(cifra),
      reservarPasta: vi.fn(
        async (
          _request: Request,
          { p_transporte }: { p_transporte: { entrada: Record<string, unknown> } },
        ) => ({
          ok: true,
          dados: { pasta_id: 'pasta-ficticia-reservada', marcador: 'p'.repeat(43) },
          request_id: p_transporte.entrada.request_id,
        }),
      ),
      autorizar: async () => ({ estado: 'autorizado' as const, identidade }),
      preautorizar: vi.fn(
        async (
          _request: Request,
          { p_transporte }: { p_transporte: { entrada: Record<string, unknown> } },
        ): Promise<unknown> => ({
          ok: true,
          repeticao: false,
          request_id: p_transporte.entrada.request_id,
        }),
      ),
      revalidar: async () => ({ estado: 'autorizado' as const, identidade }),
      metadados: (request_id: string) => ({
        key_id: 'teste',
        request_id,
        emitido_em: '2026-11-04T12:00:00Z',
        expira_em: '2026-11-04T12:00:30Z',
      }),
      atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
      cifra,
      drive: {
        pastaRaiz: 'pasta-ficticia',
        porta: { enviar, remover, conferir: async () => ({ disponivel: true }) },
      },
      executar: vi.fn(
        async (
          _request: Request,
          { p_transporte }: { p_transporte: { entrada: Record<string, unknown> } },
        ) => {
          const entrada = p_transporte.entrada;
          if (
            (entrada.atestado as { operacao?: string } | undefined)?.operacao ===
            'api.ler_documentos'
          ) {
            const aad = {
              tabela: 'cadastro.documento_caso_versao' as const,
              paciente_id,
              registro_id: documento_id,
              versao: 1,
              campo: 'conteudo' as const,
              formato: 1 as const,
            };
            return {
              ok: true,
              repeticao: false,
              request_id: entrada.request_id,
              dados: {
                documentos: [
                  {
                    documento_id,
                    registro_id: documento_id,
                    paciente_id,
                    versao: 1,
                    ...metadado,
                    conteudo: await cifra.cifrar(JSON.stringify(conteudo), aad),
                  },
                ],
              },
            };
          }
          if (opcoes.falharNoBanco)
            return {
              ok: false,
              erro: { codigo: 'conflito' },
              request_id: entrada.request_id,
            };
          return {
            ok: true,
            repeticao: false,
            request_id: entrada.request_id,
            dados: {
              documentos: [
                {
                  documento_id: entrada.documento_id,
                  registro_id: entrada.registro_id,
                  paciente_id: entrada.paciente_id,
                  versao: Number(entrada.versao_esperada) + 1,
                  categoria: entrada.categoria,
                  origem: entrada.origem,
                  data_documento: entrada.data_documento,
                  audiencia: entrada.audiencia,
                  estado: entrada.estado,
                  conteudo: entrada.conteudo,
                },
              ],
            },
          };
        },
      ),
    },
  };
}

const gravar = (extra: Record<string, unknown> = {}) =>
  ({
    operacao: 'gravar' as const,
    paciente_id,
    documento_id,
    versao_esperada: 0,
    metadado,
    conteudo,
    ...extra,
  }) as Parameters<typeof operarDocumentoCasoNativo>[1];

describe('documentos do caso (FR-029 a FR-031)', () => {
  it('autoriza operação e paciente antes de enviar ao Drive e registrar e guarda o identificador devolvido, nunca o do cliente', async () => {
    const { enviar, portas: p } = portas();
    const resultado = await operarDocumentoCasoNativo(
      request(),
      gravar({
        arquivo: { nome: 'laudo.pdf', tipo: 'application/pdf', bytes: new Uint8Array([1]) },
      }),
      p,
    );
    expect(resultado.ok).toBe(true);
    expect(enviar).toHaveBeenCalledTimes(1);
    if (!resultado.ok) throw new Error('esperado sucesso');
    // O `drive_file_id` que o cliente mandou ('pendente') não sobrevive: quem decide é o Drive.
    expect(resultado.dados.documentos[0]?.drive_file_id).toBe('arquivo-ficticio-no-drive');
  });

  it('preserva arquivo quando banco recusa, sem exclusão automática', async () => {
    const { remover, portas: p } = portas({ falharNoBanco: true });
    const resultado = await operarDocumentoCasoNativo(
      request(),
      gravar({
        arquivo: { nome: 'laudo.pdf', tipo: 'application/pdf', bytes: new Uint8Array([1]) },
      }),
      p,
    );
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error('esperada recusa');
    expect(resultado.erro.codigo).toBe('conflito_versao');
    expect(remover).not.toHaveBeenCalled();
  });

  it('não tenta limpeza destrutiva em recusa confirmada', async () => {
    const { remover, portas: p } = portas({ falharNoBanco: true, removerFalha: true });
    const resultado = await operarDocumentoCasoNativo(
      request(),
      gravar({
        arquivo: { nome: 'laudo.pdf', tipo: 'application/pdf', bytes: new Uint8Array([1]) },
      }),
      p,
    );
    expect(remover).not.toHaveBeenCalled();
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error('esperada recusa');
    expect(resultado.erro.codigo).toBe('conflito_versao');
  });

  it('não envia nada ao Drive quando a gravação é só de metadado', async () => {
    const { enviar, portas: p } = portas();
    const resultado = await operarDocumentoCasoNativo(request(), gravar({ versao_esperada: 1 }), p);
    expect(resultado.ok).toBe(true);
    expect(enviar).not.toHaveBeenCalled();
  });

  it('recusa envio de arquivo quando a guarda não está configurada, sem escolher outro local', async () => {
    const { portas: p } = portas();
    const resultado = await operarDocumentoCasoNativo(
      request(),
      gravar({
        arquivo: { nome: 'laudo.pdf', tipo: 'application/pdf', bytes: new Uint8Array([1]) },
      }),
      { ...p, drive: undefined },
    );
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error('esperada recusa');
    expect(resultado.erro.codigo).toBe('servico_indisponivel');
  });

  it('recusa anexo novo sem classificação ou sem audiência confirmada (FR-030)', async () => {
    const { enviar, portas: p } = portas();
    for (const quebrado of [
      { ...metadado, categoria: '' },
      { ...metadado, audiencia: 'qualquer_um' },
    ]) {
      const resultado = await operarDocumentoCasoNativo(
        request(),
        gravar({
          metadado: quebrado,
          arquivo: { nome: 'l.pdf', tipo: 'application/pdf', bytes: new Uint8Array([1]) },
        }),
        p,
      );
      expect(resultado.ok).toBe(false);
      if (resultado.ok) throw new Error('esperada recusa');
      expect(resultado.erro.codigo).toBe('entrada_invalida');
    }
    // A recusa acontece antes de o arquivo subir: nada chega ao Drive institucional.
    expect(enviar).not.toHaveBeenCalled();
  });

  it('recusa criar um anexo já marcado como indisponível ou removido', async () => {
    const { portas: p } = portas();
    for (const estado of ['indisponivel', 'removido']) {
      const resultado = await operarDocumentoCasoNativo(
        request(),
        gravar({ metadado: { ...metadado, estado } }),
        p,
      );
      expect(resultado.ok).toBe(false);
      if (resultado.ok) throw new Error('esperada recusa');
      expect(resultado.erro.codigo).toBe('entrada_invalida');
    }
  });
});

// PAD-01: recusas específicas de operação/caso e falhas de auditoria têm zero efeitos Drive.
it.each([
  'outro_paciente',
  'familia',
  'vinculo_revogado',
  'sessao_revogada',
  'auditoria_indisponivel',
])('prévia %s impede primeiro efeito externo', async (motivo) => {
  const { enviar, remover, portas: p } = portas();
  p.preautorizar.mockImplementation(async (_request, { p_transporte }) => {
    if (motivo === 'auditoria_indisponivel') throw new Error('AUDITORIA_NAO_INSERIDA');
    return {
      ok: false,
      erro: { codigo: 'sem_permissao' },
      request_id: p_transporte.entrada.request_id,
    };
  });
  const r = await operarDocumentoCasoNativo(
    request(),
    gravar({
      arquivo: { nome: 'ficticio.pdf', tipo: 'application/pdf', bytes: new Uint8Array([1]) },
    }),
    p,
  );
  expect(r.ok).toBe(false);
  expect(enviar).not.toHaveBeenCalled();
  expect(remover).not.toHaveBeenCalled();
  expect(p.executar).not.toHaveBeenCalled();
});
it('prévia e auditoria terminam antes do upload; final reautoriza após efeito externo', async () => {
  const { enviar, portas: p } = portas();
  const ordem: string[] = [];
  p.preautorizar.mockImplementation(async (_request, { p_transporte }) => {
    ordem.push('previa_auditada');
    return { ok: true, repeticao: false, request_id: p_transporte.entrada.request_id };
  });
  enviar.mockImplementation(async () => {
    ordem.push('drive');
    return { file_id: 'arquivo-ficticio-no-drive' };
  });
  const original = p.executar.getMockImplementation();
  if (!original) throw new Error('Implementação fictícia ausente.');
  p.executar.mockImplementation(async (...args) => {
    ordem.push('rpc_final');
    return original(...args);
  });
  const r = await operarDocumentoCasoNativo(
    request(),
    gravar({
      arquivo: { nome: 'Clinico.pdf', tipo: 'application/pdf', bytes: new Uint8Array([1]) },
    }),
    p,
  );
  expect(r.ok).toBe(true);
  expect(ordem).toEqual(['previa_auditada', 'drive', 'rpc_final']);
  expect(enviar.mock.calls[0]?.[0]).toMatchObject({
    nome: documento_id,
    pastaPaciente: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
  });
});
it('resposta final perdida preserva arquivo potencialmente vinculado', async () => {
  const { remover, portas: p } = portas();
  p.executar.mockRejectedValue(new Error('resposta perdida'));
  const r = await operarDocumentoCasoNativo(
    request(),
    gravar({
      arquivo: { nome: 'ficticio.pdf', tipo: 'application/pdf', bytes: new Uint8Array([1]) },
    }),
    p,
  );
  expect(r).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
  expect(remover).not.toHaveBeenCalled();
});

it('replay confirmado por prévia não reenvia nem remove arquivo', async () => {
  const { enviar, remover, portas: p } = portas();
  p.preautorizar.mockImplementation(async (_request, { p_transporte }) => ({
    ok: true,
    repeticao: true,
    request_id: p_transporte.entrada.request_id,
  }));
  const r = await operarDocumentoCasoNativo(
    request(),
    gravar({
      arquivo: { nome: 'ficticio.pdf', tipo: 'application/pdf', bytes: new Uint8Array([1]) },
    }),
    p,
  );
  expect(r.ok).toBe(true);
  expect(enviar).not.toHaveBeenCalled();
  expect(remover).not.toHaveBeenCalled();
});
it('nova gravação sem arquivo e troca de capacidade Drive são recusadas', async () => {
  const { enviar, portas: p } = portas();
  expect(await operarDocumentoCasoNativo(request(), gravar(), p)).toMatchObject({
    ok: false,
    erro: { codigo: 'entrada_invalida' },
  });
  expect(
    await operarDocumentoCasoNativo(
      request(),
      gravar({
        versao_esperada: 1,
        conteudo: { ...conteudo, drive_file_id: 'arquivo-outro-caso' },
      }),
      p,
    ),
  ).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
  expect(enviar).not.toHaveBeenCalled();
  expect(
    p.executar.mock.calls.filter(
      (call) =>
        (call[1].p_transporte.entrada.atestado as { operacao: string }).operacao ===
        'api.gravar_documento',
    ),
  ).toHaveLength(0);
});

it('commit com resposta perdida e replay conserva arquivo e faz somente um upload', async () => {
  const { enviar, remover, portas: p } = portas();
  const original = p.executar.getMockImplementation();
  if (!original) throw new Error('Implementação fictícia ausente.');
  let salvo: Awaited<ReturnType<typeof original>> | undefined;
  p.preautorizar.mockImplementation(async (_request, { p_transporte }) => ({
    ok: true,
    repeticao: salvo !== undefined,
    request_id: p_transporte.entrada.request_id,
  }));
  p.executar.mockImplementation(async (...args) => {
    if (salvo)
      return { ...salvo, request_id: args[1].p_transporte.entrada.request_id, repeticao: true };
    salvo = await original(...args);
    throw new Error('COMMIT confirmado, resposta perdida');
  });
  const comando = gravar({
    arquivo: { nome: 'ficticio.pdf', tipo: 'application/pdf', bytes: new Uint8Array([1]) },
  });
  expect(await operarDocumentoCasoNativo(request(), comando, p)).toMatchObject({
    ok: false,
    erro: { codigo: 'pendencia_externa' },
  });
  expect(await operarDocumentoCasoNativo(request(), comando, p)).toMatchObject({ ok: true });
  expect(enviar).toHaveBeenCalledTimes(1);
  expect(remover).not.toHaveBeenCalled();
});
