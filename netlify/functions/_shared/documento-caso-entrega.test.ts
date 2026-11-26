import { expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import { entregarDocumentoCaso } from './documento-caso-entrega.ts';

const usuario_id = 'a0000000-0000-4000-8000-000000000001';
const session_id = 'b0000000-0000-4000-8000-000000000002';
const paciente_id = 'c0000000-0000-4000-8000-000000000003';
const documento_id = 'd0000000-0000-4000-8000-000000000004';
const registro_id = 'e0000000-0000-4000-8000-000000000005';

function preparar(opcao: 'permitido' | 'negado' | 'revogado' | 'versao' | 'drive' = 'permitido') {
  const cifra = criarCifraAutenticada({
    keyIdAtiva: 'teste',
    chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
    chaveHmac: new Uint8Array(32).fill(4),
  });
  let consultas = 0;
  const executar = vi.fn(
    async (
      _request: Request,
      transporte: { p_transporte: { entrada: Record<string, unknown> } },
    ) => {
      consultas += 1;
      const entrada = transporte.p_transporte.entrada;
      expect(entrada.documento_id).toBe(documento_id);
      if (opcao === 'negado' || (opcao === 'revogado' && consultas === 2))
        return { ok: false, erro: { codigo: 'sem_permissao' }, request_id: entrada.request_id };
      const versao = opcao === 'versao' && consultas === 2 ? 2 : 1;
      return {
        ok: true,
        repeticao: false,
        request_id: entrada.request_id,
        dados: {
          documentos: [
            {
              documento_id,
              registro_id,
              paciente_id,
              versao,
              categoria: 'Laudo',
              audiencia: 'equipe_e_familia',
              estado: 'disponivel',
              conteudo: await cifra.cifrar(
                JSON.stringify({
                  nome_visivel: 'laudo-ficticio.pdf',
                  drive_file_id: 'arquivo-ficticio',
                }),
                {
                  tabela: 'cadastro.documento_caso_versao',
                  paciente_id,
                  registro_id,
                  versao,
                  campo: 'conteudo',
                  formato: 1,
                },
              ),
            },
          ],
        },
      };
    },
  );
  const obter = vi.fn(async () => {
    if (opcao === 'drive') throw new Error('resposta privada do provedor');
    return new Uint8Array(new ArrayBuffer(3)).fill(7);
  });
  const portas = {
    cifra,
    idempotencia: criarIdempotenciaNativa(cifra),
    executar,
    autorizar: async () => ({
      estado: 'autorizado' as const,
      identidade: { usuario_id, session_id },
    }),
    revalidar: async () => ({
      estado: 'autorizado' as const,
      identidade: { usuario_id, session_id },
    }),
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-11-04T12:00:00Z',
      expira_em: '2026-11-04T12:00:30Z',
    }),
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    drive: {
      pastaRaiz: 'pasta-ficticia',
      porta: {
        obter,
        enviar: async () => ({ file_id: '' }),
        remover: async () => {},
        conferir: async () => ({ disponivel: true }),
      },
    },
  };
  const request = new Request('https://exemplo.test/', { headers: { 'x-sessao': session_id } });
  return { portas, request, executar, obter };
}

it('só entrega bytes após duas consultas direcionadas ao banco', async () => {
  const { portas, request, executar, obter } = preparar();
  const resultado = await entregarDocumentoCaso(request, { paciente_id, documento_id }, portas);
  expect(resultado.ok).toBe(true);
  if (!resultado.ok || !('arquivo' in resultado.dados)) throw new Error('Entrega ausente');
  expect([...resultado.dados.arquivo.bytes]).toEqual([7, 7, 7]);
  expect(executar).toHaveBeenCalledTimes(2);
  expect(obter).toHaveBeenCalledExactlyOnceWith('arquivo-ficticio');
  expect(executar.mock.invocationCallOrder[0]).toBeLessThan(obter.mock.invocationCallOrder[0] ?? 0);
  expect(obter.mock.invocationCallOrder[0]).toBeLessThan(executar.mock.invocationCallOrder[1] ?? 0);
});

it('negação inicial do banco não alcança Google nem retorna conteúdo', async () => {
  const { portas, request, obter } = preparar('negado');
  const resultado = await entregarDocumentoCaso(request, { paciente_id, documento_id }, portas);
  expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
  expect(obter).not.toHaveBeenCalled();
});

it.each(['revogado', 'versao'] as const)(
  'descarta bytes se autorização ou versão mudou durante Google: %s',
  async (opcao) => {
    const { portas, request, executar, obter } = preparar(opcao);
    const resultado = await entregarDocumentoCaso(request, { paciente_id, documento_id }, portas);
    expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    expect(executar).toHaveBeenCalledTimes(2);
    expect(obter).toHaveBeenCalledTimes(1);
    expect(resultado).not.toHaveProperty('dados');
  },
);

it('falha Google retorna erro público sem conteúdo da origem', async () => {
  const { portas, request } = preparar('drive');
  const resultado = await entregarDocumentoCaso(request, { paciente_id, documento_id }, portas);
  expect(resultado).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
  expect(JSON.stringify(resultado)).not.toContain('resposta privada');
});
