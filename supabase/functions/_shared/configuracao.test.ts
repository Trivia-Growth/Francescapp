import { describe, expect, it } from 'vitest';

import {
  carregarConfiguracao,
  ErroConfiguracaoIndisponivel,
  fluxosDeConfiguracao,
  type FluxoDeConfiguracao,
  type FonteDeConfiguracao,
} from './configuracao.ts';
import { criarRespostaDeFalhaPublica } from './falha-publica.ts';
import { criarRegistradorDeLogSeguro, eventosOperacionaisSeguros } from './log-seguro.ts';

const configuracaoValida: FonteDeConfiguracao = {
  FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co',
  FFCM_SUPABASE_ANON_KEY: 'chave-publica-ficticia-sem-espacos',
  FFCM_COOKIE_SEALING_KEY: 'A'.repeat(43),
  FFCM_ALLOWED_ORIGINS: 'https://app.exemplo.test,http://localhost:5173',
  FFCM_GOOGLE_OAUTH_CLIENT_ID: 'cliente-ficticio.apps.googleusercontent.com',
  FFCM_GOOGLE_WORKSPACE_DOMAIN: 'francescato.exemplo',
  OPENROUTER_API_KEY: 'chave-ficticia-openrouter-sem-espacos',
};

const requisitos: Readonly<Record<FluxoDeConfiguracao, readonly string[]>> = {
  cadastro: ['FFCM_SUPABASE_URL', 'FFCM_SUPABASE_ANON_KEY'],
  sessao: [
    'FFCM_SUPABASE_URL',
    'FFCM_SUPABASE_ANON_KEY',
    'FFCM_COOKIE_SEALING_KEY',
    'FFCM_ALLOWED_ORIGINS',
  ],
  entrada_google: [
    'FFCM_SUPABASE_URL',
    'FFCM_SUPABASE_ANON_KEY',
    'FFCM_COOKIE_SEALING_KEY',
    'FFCM_ALLOWED_ORIGINS',
    'FFCM_GOOGLE_OAUTH_CLIENT_ID',
    'FFCM_GOOGLE_WORKSPACE_DOMAIN',
  ],
  openrouter: ['OPENROUTER_API_KEY'],
};

describe('configuração obrigatória por fluxo', () => {
  for (const fluxo of fluxosDeConfiguracao) {
    it(`carrega ${fluxo} somente com seus requisitos válidos`, () => {
      expect(() => carregarConfiguracao(fluxo, configuracaoValida)).not.toThrow();
    });

    for (const variavel of requisitos[fluxo]) {
      it(`falha fechada quando ${variavel} falta no fluxo ${fluxo}`, () => {
        const semVariavel = { ...configuracaoValida, [variavel]: undefined };

        expect(() => carregarConfiguracao(fluxo, semVariavel)).toThrow(
          ErroConfiguracaoIndisponivel,
        );
      });
    }
  }

  it('não exige OpenRouter para carregar o fluxo de cadastro', () => {
    const semOpenRouter = { ...configuracaoValida, OPENROUTER_API_KEY: undefined };

    expect(carregarConfiguracao('cadastro', semOpenRouter)).toMatchObject({
      supabaseUrl: expect.any(URL),
    });
  });

  it('recusa valor de origem que não seja uma origem exata permitida', () => {
    expect(() =>
      carregarConfiguracao('sessao', {
        ...configuracaoValida,
        FFCM_ALLOWED_ORIGINS: 'https://app.exemplo.test/caminho',
      }),
    ).toThrow(ErroConfiguracaoIndisponivel);
  });

  it('recusa URL Supabase com caminho adicional', () => {
    expect(() =>
      carregarConfiguracao('cadastro', {
        ...configuracaoValida,
        FFCM_SUPABASE_URL: 'https://projeto-ficticio.supabase.co/rest/v1',
      }),
    ).toThrow(ErroConfiguracaoIndisponivel);
  });

  it('recusa chave de selagem que não é base64url canônica de 32 bytes', () => {
    expect(() =>
      carregarConfiguracao('sessao', {
        ...configuracaoValida,
        FFCM_COOKIE_SEALING_KEY: 'A'.repeat(45),
      }),
    ).toThrow(ErroConfiguracaoIndisponivel);

    expect(() =>
      carregarConfiguracao('sessao', {
        ...configuracaoValida,
        FFCM_COOKIE_SEALING_KEY: 'A'.repeat(42),
      }),
    ).toThrow(ErroConfiguracaoIndisponivel);
  });
});

describe('falha pública sanitizada', () => {
  it('não revela variável, segredo ou PII quando a configuração falha', () => {
    const segredo = 'segredo-que-nao-pode-sair';
    const email = 'pessoa@exemplo.test';
    const resposta = criarRespostaDeFalhaPublica(new ErroConfiguracaoIndisponivel());

    expect(resposta.erro).toEqual({
      codigo: 'configuracao_indisponivel',
      mensagem: 'Configuração necessária indisponível.',
    });
    expect(resposta.request_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.stringify(resposta)).not.toContain('FFCM_');
    expect(JSON.stringify(resposta)).not.toContain(segredo);
    expect(JSON.stringify(resposta)).not.toContain(email);
  });

  it('não ecoa causa inesperada de infraestrutura', () => {
    const resposta = criarRespostaDeFalhaPublica(
      new Error('falha upstream com token segredo-que-nao-pode-sair'),
    );

    expect(resposta.erro).toEqual({
      codigo: 'servico_indisponivel',
      mensagem: 'Serviço temporariamente indisponível.',
    });
  });

  it('gera o request_id no servidor, sem aceitar UUID fornecido pelo chamador', () => {
    const requestIdControladoPeloChamador = 'e55c97d7-56f0-4f8f-a72f-71304d49af53';
    const resposta = (
      criarRespostaDeFalhaPublica as (
        erro: unknown,
        requestIdIgnorado?: string,
      ) => ReturnType<typeof criarRespostaDeFalhaPublica>
    )(new ErroConfiguracaoIndisponivel(), requestIdControladoPeloChamador);

    expect(resposta.request_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(resposta.request_id).not.toBe(requestIdControladoPeloChamador);
  });
});

describe('registro operacional por allowlist', () => {
  it('serializa somente o evento fechado', () => {
    const linhas: string[] = [];
    const registrar = criarRegistradorDeLogSeguro((linha) => linhas.push(linha));

    expect(registrar(eventosOperacionaisSeguros.configuracaoIndisponivel)).toBe(true);
    expect(linhas).toEqual([
      '{"acao":"configuracao","resultado":"indisponivel","status":503,"codigo":"configuracao_indisponivel"}',
    ]);
  });

  it('recusa evento com segredo ou PII mesmo que imite um evento válido', () => {
    const linhas: string[] = [];
    const registrar = criarRegistradorDeLogSeguro((linha) => linhas.push(linha));
    const entradaComDadosSensiveis = {
      ...eventosOperacionaisSeguros.configuracaoIndisponivel,
      email: 'pessoa@exemplo.test',
      token: 'segredo-que-nao-pode-sair',
    };

    expect(registrar(entradaComDadosSensiveis as never)).toBe(false);
    expect(linhas).toEqual([]);
  });
});
