import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fabrica from '../../../supabase/functions/_shared/pool-cofre.ts';
import * as composicao from './compor-pacientes-nativo.ts';
import { configurarPacientesNativo } from './configurar-pacientes-nativo.ts';

const fonte = {
  FFCM_SUPABASE_URL: 'https://projeto.example.test',
  FFCM_SUPABASE_ANON_KEY: 'publica',
  FFCM_APP_ORIGIN: 'https://app.example.test',
  FFCM_VAULT_DB_HOST: 'cofre.example.test',
  FFCM_VAULT_DB_PORT: '5432',
  FFCM_VAULT_DB_NAME: 'app',
  FFCM_VAULT_DB_USER: 'cofre_restrito',
  FFCM_VAULT_DB_PASSWORD: 'ficticia',
  FFCM_VAULT_DB_CA: '-----BEGIN CERTIFICATE-----\nYWJj\n-----END CERTIFICATE-----',
  FFCM_VAULT_CIFRA_KEY_ID: 'v1',
  FFCM_VAULT_ATESTADO_KEY_ID: 'v1',
  FFCM_VAULT_CIFRA_REFERENCIAS: 'v1=ffcmapp.cifra.ativa',
  FFCM_VAULT_HMAC_REFERENCIA: 'ffcmapp.cifra.hmac',
};

afterEach(() => vi.restoreAllMocks());

describe('configuração da composição nativa', () => {
  it('rejeita ausência de cada variável sem expor valores', () => {
    for (const nome of Object.keys(fonte)) {
      const invalida = { ...fonte, [nome]: undefined };
      expect(() => configurarPacientesNativo(invalida)).toThrow(
        'Configuração necessária indisponível.',
      );
    }
  });

  it.each([
    { FFCM_VAULT_DB_USER: 'postgres' },
    { FFCM_VAULT_DB_CA: 'sem certificado' },
    { FFCM_VAULT_DB_PORT: '5432x' },
    { FFCM_VAULT_DB_HOST: 'localhost' },
    { FFCM_VAULT_CIFRA_REFERENCIAS: 'v1=ffcmapp.cifra.hmac' },
    { FFCM_VAULT_CIFRA_REFERENCIAS: 'v2=ffcmapp.cifra.antiga' },
    { FFCM_VAULT_CIFRA_REFERENCIAS: 'v1=ffcmapp.cifra.ativa,v1=ffcmapp.cifra.antiga' },
    { FFCM_VAULT_CIFRA_REFERENCIAS: 'v1=ffcmapp.cifra.ativa,v2=ffcmapp.cifra.ativa' },
    { FFCM_VAULT_CIFRA_REFERENCIAS: 'v1=ffcmapp.cifra.ativa,' },
    {
      FFCM_VAULT_CIFRA_REFERENCIAS: Array.from(
        { length: 17 },
        (_, i) => `v${i}=ffcmapp.cifra.k${i}`,
      ).join(','),
    },
    { FFCM_VAULT_ATESTADO_KEY_ID: '../chave' },
    { FFCM_APP_ORIGIN: 'http://app.example.test' },
  ])('rejeita configuração insegura: %o', (alteracao) => {
    expect(() => configurarPacientesNativo({ ...fonte, ...alteracao })).toThrow(
      'Configuração necessária indisponível.',
    );
  });

  it('prepara pool restrito com TLS e prazos, sem abrir conexão', async () => {
    const criar = vi.spyOn(fabrica, 'criarPoolCofre');
    const configurada = configurarPacientesNativo(fonte);
    const pool = criar.mock.results[0]?.value;
    expect(pool.options).toMatchObject({
      ssl: { ca: fonte.FFCM_VAULT_DB_CA, rejectUnauthorized: true },
      connectionTimeoutMillis: 5000,
      query_timeout: 15000,
      max: 1,
    });
    expect(pool.totalCount).toBe(0);
    await configurada.encerrar();
  });

  it('entrega referência anterior e ativa à composição, sem ler o cofre', async () => {
    const compor = vi.spyOn(composicao, 'comporPacientesNativo').mockResolvedValue(new Response());
    const configurada = configurarPacientesNativo({
      ...fonte,
      FFCM_VAULT_CIFRA_KEY_ID: 'v2',
      FFCM_VAULT_CIFRA_REFERENCIAS: 'v1=ffcmapp.cifra.antiga,v2=ffcmapp.cifra.ativa',
    });
    await configurada.executar(new Request('https://app.example.test/api/pacientes'), 'carteira');
    expect(compor.mock.calls[0]?.[2].referencias).toEqual({
      keyIdAtiva: 'v2',
      referenciasCifra: { v1: 'ffcmapp.cifra.antiga', v2: 'ffcmapp.cifra.ativa' },
      referenciaHmac: 'ffcmapp.cifra.hmac',
    });
    await configurada.encerrar();
  });
});
