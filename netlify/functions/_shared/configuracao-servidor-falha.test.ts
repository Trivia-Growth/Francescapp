import type { Pool } from 'pg';
import { beforeEach, expect, it } from 'vitest';
import { esquecerConfiguracaoServidor, servicoAtivo } from './configuracao-servidor.ts';

/** O que acontece quando o banco não responde. A regra é a documentada em
 * `configuracao-servidor.ts`: a variável de ambiente é o padrão de última instância, e uma
 * falha de leitura não pode inventar configuração. */

type Resposta = { rows: { configuracao: unknown }[] };

function poolQueResponde(configuracao: unknown): Pool {
  const cliente = {
    query: async (texto: string): Promise<Resposta> =>
      texto.includes('ler_configuracao_sistema_publica')
        ? { rows: [{ configuracao }] }
        : { rows: [] },
    release: () => {},
  };
  return { connect: async () => cliente } as unknown as Pool;
}

function poolQueFalha(): Pool {
  return {
    connect: async () => {
      throw new Error('banco indisponível');
    },
  } as unknown as Pool;
}

const desligadoNoBanco = {
  'ffcm.diario.ativo': { valor: false, tipo: 'booleano', versao: 1 },
};

beforeEach(() => {
  esquecerConfiguracaoServidor();
});

it('processo frio com banco fora cai no padrão do ambiente, nos dois sentidos', async () => {
  const pool = poolQueFalha();
  expect(await servicoAtivo(pool, 'ffcm.diario.ativo', false)).toBe(false);
  esquecerConfiguracaoServidor();
  expect(await servicoAtivo(pool, 'ffcm.diario.ativo', true)).toBe(true);
});

it('banco fora depois de uma leitura boa mantém o que a tela mandou, e não reabre o serviço', async () => {
  // Este é o caso que mais importa: alguém desligou o serviço na tela, o ambiente ainda diz
  // "ligado", e o banco some. A leitura anterior continua valendo em vez de reabrir a rota.
  expect(await servicoAtivo(poolQueResponde(desligadoNoBanco), 'ffcm.diario.ativo', true)).toBe(
    false,
  );
  expect(await servicoAtivo(poolQueFalha(), 'ffcm.diario.ativo', true)).toBe(false);
});

it('chave ausente, tipo errado ou resposta ilegível caem no padrão do ambiente', async () => {
  expect(await servicoAtivo(poolQueResponde({}), 'ffcm.diario.ativo', true)).toBe(true);
  esquecerConfiguracaoServidor();
  expect(await servicoAtivo(poolQueResponde({}), 'ffcm.diario.ativo', false)).toBe(false);
  esquecerConfiguracaoServidor();
  const tipoErrado = { 'ffcm.diario.ativo': { valor: 'sim', tipo: 'texto', versao: 1 } };
  expect(await servicoAtivo(poolQueResponde(tipoErrado), 'ffcm.diario.ativo', false)).toBe(false);
  esquecerConfiguracaoServidor();
  expect(await servicoAtivo(poolQueResponde(null), 'ffcm.diario.ativo', false)).toBe(false);
});

it('o banco vence o ambiente quando responde', async () => {
  expect(await servicoAtivo(poolQueResponde(desligadoNoBanco), 'ffcm.diario.ativo', true)).toBe(
    false,
  );
  esquecerConfiguracaoServidor();
  const ligadoNoBanco = { 'ffcm.diario.ativo': { valor: true, tipo: 'booleano', versao: 1 } };
  expect(await servicoAtivo(poolQueResponde(ligadoNoBanco), 'ffcm.diario.ativo', false)).toBe(true);
});

/** Regressão do smoke de 13/11/2026 em produção: a PRIMEIRA requisição a um processo frio
 * devolvia "serviço indisponível" porque a conexão fria falhava e o padrão de ambiente, agora
 * `false`, virava a resposta. Uma falha passageira não pode desligar uma tela. */
function poolQueFalhaNasPrimeiras(falhas: number, configuracao: unknown): Pool {
  let tentativas = 0;
  const cliente = {
    query: async (texto: string): Promise<Resposta> =>
      texto.includes('ler_configuracao_sistema_publica')
        ? { rows: [{ configuracao }] }
        : { rows: [] },
    release: () => {},
  };
  return {
    connect: async () => {
      tentativas += 1;
      if (tentativas <= falhas) throw new Error('conexão fria');
      return cliente;
    },
  } as unknown as Pool;
}

const ligado = { 'ffcm.diario.ativo': { valor: true, tipo: 'booleano', versao: 1 } };

it('processo frio tenta de novo antes de desistir e não desliga o serviço por falha passageira', async () => {
  const pool = poolQueFalhaNasPrimeiras(1, ligado);
  expect(await servicoAtivo(pool, 'ffcm.diario.ativo', false)).toBe(true);
});

it('duas falhas seguidas no processo frio ainda caem no padrão do ambiente', async () => {
  const pool = poolQueFalhaNasPrimeiras(2, ligado);
  expect(await servicoAtivo(pool, 'ffcm.diario.ativo', false)).toBe(false);
});

it('a retentativa não reabre serviço que a tela desligou', async () => {
  // A retentativa existe para o processo frio não desligar uma tela por engano. Não pode virar
  // o contrário: se o banco já respondeu "desligado", nenhuma falha posterior reabre a rota.
  expect(await servicoAtivo(poolQueResponde(desligadoNoBanco), 'ffcm.diario.ativo', true)).toBe(
    false,
  );
  expect(await servicoAtivo(poolQueFalha(), 'ffcm.diario.ativo', true)).toBe(false);
});
