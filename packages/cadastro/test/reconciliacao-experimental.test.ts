import { describe, expect, it } from 'vitest';
import { consultarReconciliacaoExperimental } from '../src/reconciliacao-experimental.js';

describe('reconciliação experimental', () => {
  it('rejeita request_id inválido antes de chamar o adapter', async () => {
    let chamado = false;
    await expect(
      consultarReconciliacaoExperimental(
        { limite: 1 },
        {
          consultar: async () => {
            chamado = true;
            return {};
          },
        },
        'id-inválido',
      ),
    ).rejects.toThrow('Não foi possível consultar a reconciliação.');
    expect(chamado).toBe(false);
  });
  it('normaliza UUID de correlação antes do adapter e aceita resposta equivalente em minúsculas', async () => {
    const maiusculo = 'ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF';
    const minusculo = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
    let enviada = '';
    const resposta = await consultarReconciliacaoExperimental(
      { limite: 1 },
      {
        consultar: async ({ request_id }) => {
          enviada = request_id;
          return { ok: true, request_id: minusculo, dados: { itens: [], proximo_cursor: null } };
        },
      },
      maiusculo,
    );
    expect(enviada).toBe(minusculo);
    expect(resposta.request_id).toBe(minusculo);
    const retornoMaiusculo = await consultarReconciliacaoExperimental(
      { limite: 1 },
      {
        consultar: async () => ({
          ok: true,
          request_id: maiusculo,
          dados: { itens: [], proximo_cursor: null },
        }),
      },
      minusculo,
    );
    expect(retornoMaiusculo.request_id).toBe(minusculo);
  });
  it('rejeita página acima do limite original mesmo se adapter alterar a consulta', async () => {
    const item = {
      operacao_id: '10000000-0000-4000-8000-000000000001',
      situacao: { estado: 'pendente' },
    };
    const resposta = await consultarReconciliacaoExperimental(
      { limite: 1 },
      {
        consultar: async ({ request_id }) => ({
          ok: true,
          request_id,
          dados: { itens: [item], proximo_cursor: null },
        }),
      },
    );
    expect(resposta.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(resposta.ok && resposta.dados.itens).toHaveLength(1);
    await expect(
      consultarReconciliacaoExperimental(
        { limite: 1 },
        {
          consultar: async (entrada) => {
            entrada.consulta.limite = 25;
            return {
              ok: true,
              request_id: entrada.request_id,
              dados: { itens: [item, item], proximo_cursor: null },
            };
          },
        },
      ),
    ).rejects.toThrow('Não foi possível consultar a reconciliação.');
  });
  it('rejeita request_id alterado pelo adapter durante a chamada', async () => {
    await expect(
      consultarReconciliacaoExperimental(
        { limite: 1 },
        {
          consultar: async (entrada) => {
            entrada.request_id = '10000000-0000-4000-8000-000000000001';
            return {
              ok: true,
              request_id: entrada.request_id,
              dados: { itens: [], proximo_cursor: null },
            };
          },
        },
      ),
    ).rejects.toThrow('Não foi possível consultar a reconciliação.');
  });
  it('retorna operação confirmada e página vazia sem concluir falha', async () => {
    const operacao = {
      operacao_id: '10000000-0000-4000-8000-000000000001',
      situacao: {
        estado: 'confirmado',
        resultado_id: '10000000-0000-4000-8000-000000000002',
        resultado_versao: 1,
      },
    };
    const adaptador = {
      async consultar(entrada: { request_id: string }) {
        return {
          ok: true,
          request_id: entrada.request_id,
          dados: { itens: [operacao], proximo_cursor: null },
        };
      },
    };
    const resposta = await consultarReconciliacaoExperimental({ limite: 25 }, adaptador);
    expect(resposta.ok && resposta.dados.itens).toEqual([operacao]);
    const vazio = await consultarReconciliacaoExperimental(
      { limite: 25 },
      {
        consultar: async ({ request_id }) => ({
          ok: true,
          request_id,
          dados: { itens: [], proximo_cursor: null },
        }),
      },
    );
    expect(vazio.ok && vazio.dados.itens).toEqual([]);
  });
  it('preserva negativa, pendência e incerteza, sem aceitar identidade autodeclarada', async () => {
    let chamadas = 0;
    const negacao = {
      consultar: async ({ request_id }: { request_id: string }) => {
        chamadas++;
        return { ok: false, request_id, erro: { codigo: 'sem_permissao' } };
      },
    };
    expect(await consultarReconciliacaoExperimental({ limite: 25 }, negacao)).toMatchObject({
      ok: false,
      erro: { codigo: 'sem_permissao' },
    });
    await expect(
      consultarReconciliacaoExperimental(
        { limite: 25, usuario_id: '10000000-0000-4000-8000-000000000001' },
        negacao,
      ),
    ).rejects.toThrow('Não foi possível consultar a reconciliação.');
    expect(chamadas).toBe(1);
    const itens = ['pendente', 'indeterminado'].map((estado, i) => ({
      operacao_id: `10000000-0000-4000-8000-00000000000${i + 1}`,
      situacao: { estado },
    }));
    const resultado = await consultarReconciliacaoExperimental(
      { limite: 25 },
      {
        consultar: async ({ request_id }) => ({
          ok: true,
          request_id,
          dados: { itens, proximo_cursor: null },
        }),
      },
    );
    expect(resultado.ok && resultado.dados.itens).toEqual(itens);
  });
  it('não expõe falha do adapter nem aceita resultado incompatível', async () => {
    await expect(
      consultarReconciliacaoExperimental(
        { limite: 25 },
        {
          consultar: async () => {
            throw new Error('Pessoa fictícia');
          },
        },
      ),
    ).rejects.toThrow('Não foi possível consultar a reconciliação.');
    await expect(
      consultarReconciliacaoExperimental(
        { limite: 25 },
        {
          consultar: async () => ({
            ok: true,
            request_id: '10000000-0000-4000-8000-000000000001',
            dados: { itens: [], proximo_cursor: null },
          }),
        },
      ),
    ).rejects.toThrow('Não foi possível consultar a reconciliação.');
    await expect(
      consultarReconciliacaoExperimental(
        { limite: 25 },
        {
          consultar: async ({ request_id }) => ({
            ok: true,
            request_id,
            dados: { itens: [{ nome: 'Pessoa fictícia' }], proximo_cursor: null },
          }),
        },
      ),
    ).rejects.toThrow('Não foi possível consultar a reconciliação.');
  });
});
