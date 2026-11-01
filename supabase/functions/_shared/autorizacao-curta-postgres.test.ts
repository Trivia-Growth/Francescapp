import { userInfo } from 'node:os';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { criarAtestadorOperacao } from './atestado-operacao.ts';
import { criarAutorizacaoCurta } from './autorizacao-curta.ts';

// Somente o runner descartável habilita esta prova; nunca conectar a ambiente remoto.
const socket = process.env.PGHOST ?? '';
const habilitado =
  process.env.FFCM_TESTE_CURTA === '1' &&
  /^\/tmp\/ffcm-curta\.[A-Za-z0-9]+$/.test(socket) &&
  process.env.PGDATABASE === 'ffcm_curta_teste_local';

describe.skipIf(!habilitado)('autorização TypeScript e PostgreSQL experimental', () => {
  it('aceita entrada assinada e rejeita adulteração e replay', async () => {
    const db = new Client({
      host: socket,
      port: 55332,
      database: 'ffcm_curta_teste_local',
      user: userInfo().username,
    });
    await db.connect();
    try {
      const guarda = await db.query(
        "select current_setting('listen_addresses') as rede, current_setting('data_directory') as dados",
      );
      expect(guarda.rows[0]).toEqual({ rede: '', dados: `${socket}/data` });
      const contexto = {
        usuario_id: '11111111-1111-4111-8111-111111111111',
        session_id: '22222222-2222-4222-8222-222222222222',
        geracao: 1,
        operacao: 'fixture.criar',
        audiencia: 'fixture',
      };
      const config = { keyId: 'fixture', chave: new Uint8Array(32).fill(0x42) };
      const entrada = { z: 'fictício', a: { texto: 'ação', quantidade: 2 } };
      const { autorizacao, entradaCanonica } = await criarAutorizacaoCurta(config).emitir(
        contexto,
        entrada,
        Date.now(),
      );
      const { mac, ...dados } = autorizacao;
      const canonico = criarAtestadorOperacao(config).canonicalizar(dados);
      const executar = async (
        documento: string,
        assinatura: string,
        snapshot: string,
        usado: unknown,
      ) => {
        const resultado = await db.query(
          'select autorizacao_curta_fixture.executar($1,$2,$3,$4::jsonb) as aceito',
          [documento, assinatura, snapshot, JSON.stringify(usado)],
        );
        return resultado.rows[0].aceito;
      };
      expect(await executar(canonico, 'A'.repeat(43), entradaCanonica, entrada)).toBe(false);
      expect(await executar(canonico, mac, entradaCanonica, { ...entrada, z: 'outro' })).toBe(
        false,
      );
      expect(
        await executar(canonico, mac, entradaCanonica.replace('fictício', 'alterado'), {
          ...entrada,
          z: 'alterado',
        }),
      ).toBe(false);
      expect(await executar(canonico, mac, entradaCanonica, entrada)).toBe(true);
      expect(await executar(canonico, mac, entradaCanonica, entrada)).toBe(false);
      const contagem = await db.query(
        'select (select count(*)::int from autorizacao_curta_fixture.efeito where id=$1) as efeitos, (select count(*)::int from autorizacao_curta_fixture.auditoria where id=$1) as auditorias',
        [dados.id],
      );
      expect(contagem.rows[0]).toEqual({ efeitos: 1, auditorias: 1 });
    } finally {
      await db.end();
    }
  });
});
