import { createHmac } from 'node:crypto';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

const socket = process.env.FFCM_COFRE_SOCKET;
describe.skipIf(!socket)('cofre nativo com PostgreSQL descartável', () => {
  it('integra chaves, cifra, HMAC e verificador real, com privilégios restritos', async () => {
    const pool = new Pool({
      host: socket,
      port: 5432,
      database: 'ffcm_cadeia_local',
      user: 'ffcm_cofre_runtime',
      connectionTimeoutMillis: 3000,
      query_timeout: 3000,
    });
    try {
      const { cifra, atestador } = await carregarCofreNativo(
        pool,
        {
          keyIdAtiva: 'v1',
          referenciasCifra: { v1: 'ffcmapp.cifra.ativa' },
          referenciaHmac: 'ffcmapp.cifra.hmac',
        },
        'teste',
      );
      const aad = {
        tabela: 'cadastro.paciente' as const,
        registro_id: '10000000-0000-4000-8000-000000000001',
        campo: 'nome',
        formato: 1 as const,
      };
      const envelope = await cifra.cifrar('Pessoa fictícia', aad);
      expect(await cifra.decifrar(envelope, aad)).toBe('Pessoa fictícia');
      await expect(cifra.decifrar(envelope, { ...aad, campo: 'outro' })).rejects.toThrow();
      const comando = atestador.canonicalizar({ b: 2, a: 1 });
      const digest = await criarIdempotenciaNativa(cifra).calcularDigestIdempotencia(comando);
      expect(digest).toBe(
        createHmac('sha256', Buffer.alloc(32, 0x22))
          .update(`ffcmapp:hmac:v1:ffcmapp:idempotencia:v1:${comando}`)
          .digest('base64url'),
      );
      const dados = {
        key_id: 'teste',
        usuario_id: '10000000-0000-4000-8000-000000000001',
        session_id: '10000000-0000-4000-8000-000000000002',
        emitido_em: '2026-10-29T12:00:00Z',
        expira_em: '2026-10-29T12:01:00Z',
        request_id: '10000000-0000-4000-8000-000000000003',
        operacao: 'cadastro.criar_paciente',
      };
      const prova = await atestador.atestarEntrada(dados, { a: 1 });
      const { mac, ...metadados } = prova.atestado;
      const verificar = async (entrada: unknown) =>
        pool.query(
          'select identidade.verificar_assinatura_atestado($1,$2,$3::jsonb,$4::jsonb,$5) as valido',
          [
            prova.entradaCanonica,
            prova.dadosCanonicos,
            JSON.stringify(entrada),
            JSON.stringify(metadados),
            mac,
          ],
        );
      expect((await verificar({ a: 1 })).rows[0].valido).toBe(true);
      expect((await verificar({ a: 2 })).rows[0].valido).toBe(false);
      await expect(pool.query('select * from vault.decrypted_secrets')).rejects.toThrow();
      await expect(
        pool.query("select identidade.ler_chave_cifra_vault('ffcmapp.cifra.ativa')"),
      ).rejects.toThrow();
      const admin = new Pool({
        host: socket,
        port: 5432,
        database: 'ffcm_cadeia_local',
        user: 'cofre_admin',
        connectionTimeoutMillis: 3000,
        query_timeout: 3000,
      });
      try {
        await admin.query(
          "update identidade.referencias_atestado_vault set ativa=false where referencia='ffcmapp.atestado.teste'",
        );
        await expect(
          carregarCofreNativo(
            pool,
            {
              keyIdAtiva: 'v1',
              referenciasCifra: { v1: 'ffcmapp.cifra.ativa' },
              referenciaHmac: 'ffcmapp.cifra.hmac',
            },
            'teste',
          ),
        ).rejects.toThrow('Chave criptográfica indisponível.');
      } finally {
        await admin.end();
      }
    } finally {
      await pool.end();
    }
  });
});
