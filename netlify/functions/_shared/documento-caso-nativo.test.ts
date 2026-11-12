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
  const enviar = vi.fn(async () => ({ file_id: 'arquivo-ficticio-no-drive' }));
  const remover = vi.fn(async () => {
    if (opcoes.removerFalha) throw new Error('Drive fora do ar');
  });
  return {
    enviar,
    remover,
    portas: {
      idempotencia: criarIdempotenciaNativa(cifra),
      autorizar: async () => ({ estado: 'autorizado' as const, identidade }),
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
  it('envia ao Drive antes de registrar e guarda o identificador devolvido, nunca o do cliente', async () => {
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

  it('desfaz o envio quando o banco recusa, para não deixar arquivo de paciente sem vínculo', async () => {
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
    expect(remover).toHaveBeenCalledWith('arquivo-ficticio-no-drive');
  });

  it('não falha a resposta quando a limpeza do Drive também falha: a recusa continua sendo a recusa', async () => {
    const { remover, portas: p } = portas({ falharNoBanco: true, removerFalha: true });
    const resultado = await operarDocumentoCasoNativo(
      request(),
      gravar({
        arquivo: { nome: 'laudo.pdf', tipo: 'application/pdf', bytes: new Uint8Array([1]) },
      }),
      p,
    );
    expect(remover).toHaveBeenCalledTimes(1);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error('esperada recusa');
    expect(resultado.erro.codigo).toBe('conflito_versao');
  });

  it('não envia nada ao Drive quando a gravação é só de metadado', async () => {
    const { enviar, portas: p } = portas();
    const resultado = await operarDocumentoCasoNativo(request(), gravar(), p);
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
