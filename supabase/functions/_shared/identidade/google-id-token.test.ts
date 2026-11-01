import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import {
  ErroConfiguracaoValidacaoGoogleInvalida,
  ErroIdTokenGoogleInvalido,
  validarIdTokenGoogle,
  type ConfiguracaoValidacaoIdTokenGoogle,
} from './google-id-token.ts';

const parDeChaves = await generateKeyPair('RS256');
const audience = 'cliente-ficticio.apps.googleusercontent.com';
const nonce = 'N'.repeat(43);
const configuracao: ConfiguracaoValidacaoIdTokenGoogle = {
  audienciaEsperada: audience,
  dominioWorkspace: 'francescato.exemplo.test',
  nonceEsperado: nonce,
  chaveDeVerificacao: parDeChaves.publicKey,
};

type AlteracoesToken = Readonly<{
  audience?: string | string[];
  authorizedParty?: string;
  email?: string;
  emailVerified?: boolean | string;
  expiraEm?: number;
  issuer?: string;
  emitidoEm?: number;
  nonce?: string;
  subject?: string;
  workspace?: string;
}>;

async function criarIdToken(alteracoes: AlteracoesToken = {}): Promise<string> {
  return new SignJWT({
    email: alteracoes.email ?? 'profissional.ficticia@francescato.exemplo.test',
    email_verified: alteracoes.emailVerified ?? true,
    hd: alteracoes.workspace ?? configuracao.dominioWorkspace,
    nonce: alteracoes.nonce ?? nonce,
    ...(alteracoes.authorizedParty === undefined ? {} : { azp: alteracoes.authorizedParty }),
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(alteracoes.subject ?? 'google-subject-ficticio-001')
    .setIssuer(alteracoes.issuer ?? 'https://accounts.google.com')
    .setAudience(alteracoes.audience ?? audience)
    .setIssuedAt(alteracoes.emitidoEm ?? Math.floor(Date.now() / 1000))
    .setExpirationTime(alteracoes.expiraEm ?? '5m')
    .sign(parDeChaves.privateKey);
}

describe('validação local do ID token Google', () => {
  it('recusa cabeçalho crítico não suportado sem buscar chaves nem revelar token', async () => {
    const partes = (await criarIdToken()).split('.');
    const cabecalho = btoa(JSON.stringify({ alg: 'RS256', crit: ['extensao'], extensao: true }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const token = `${cabecalho}.${partes[1]}.${partes[2]}`;
    let buscas = 0;
    const erro = await validarIdTokenGoogle(token, {
      ...configuracao,
      chaveDeVerificacao: async () => {
        buscas++;
        throw new Error('erro interno');
      },
    }).catch((falha: unknown) => falha);
    expect(erro).toBeInstanceOf(ErroIdTokenGoogleInvalido);
    expect(String(erro)).not.toContain(token);
    expect(buscas).toBe(0);
  });
  it('aceita somente prova assinada, atual, do domínio e nonce esperados', async () => {
    await expect(validarIdTokenGoogle(await criarIdToken(), configuracao)).resolves.toEqual({
      subject: 'google-subject-ficticio-001',
      email: 'profissional.ficticia@francescato.exemplo.test',
      dominioWorkspace: 'francescato.exemplo.test',
    });
  });

  it('aceita JWK público injetado sem buscar rede', async () => {
    const chaveDeVerificacao = await exportJWK(parDeChaves.publicKey);

    await expect(
      validarIdTokenGoogle(await criarIdToken(), { ...configuracao, chaveDeVerificacao }),
    ).resolves.toMatchObject({ subject: 'google-subject-ficticio-001' });
  });

  it('recusa assinatura adulterada e algoritmo não permitido', async () => {
    const token = await criarIdToken();
    const partes = token.split('.');
    const assinatura = partes[2] ?? '';
    const assinaturaAdulterada = `${partes[0]}.${partes[1]}.${assinatura[0] === 'A' ? 'B' : 'A'}${assinatura.slice(1)}`;
    const chaveHs = new TextEncoder().encode('h'.repeat(32));
    const tokenHs = await new SignJWT({
      email: 'profissional.ficticia@francescato.exemplo.test',
      email_verified: true,
      hd: configuracao.dominioWorkspace,
      nonce,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('google-subject-ficticio-001')
      .setIssuer('https://accounts.google.com')
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(chaveHs);

    await expect(validarIdTokenGoogle(assinaturaAdulterada, configuracao)).rejects.toThrow(
      ErroIdTokenGoogleInvalido,
    );
    await expect(validarIdTokenGoogle(tokenHs, configuracao)).rejects.toThrow(
      ErroIdTokenGoogleInvalido,
    );
  });

  it('recusa issuer, audience e expiração inválidos', async () => {
    await expect(
      validarIdTokenGoogle(
        await criarIdToken({ issuer: 'https://emissor-malicioso.exemplo.test' }),
        configuracao,
      ),
    ).rejects.toThrow(ErroIdTokenGoogleInvalido);
    await expect(
      validarIdTokenGoogle(await criarIdToken({ audience: 'cliente-incorreto' }), configuracao),
    ).rejects.toThrow(ErroIdTokenGoogleInvalido);
    await expect(
      validarIdTokenGoogle(
        await criarIdToken({ expiraEm: Math.floor(Date.now() / 1000) - 60 }),
        configuracao,
      ),
    ).rejects.toThrow(ErroIdTokenGoogleInvalido);
  });

  it('recusa audiences adicionais não configuradas mesmo com authorized party compatível', async () => {
    const audiences = [audience, 'outro-cliente-ficticio.apps.googleusercontent.com'];

    await expect(
      validarIdTokenGoogle(await criarIdToken({ audience: audiences }), configuracao),
    ).rejects.toThrow(ErroIdTokenGoogleInvalido);
    await expect(
      validarIdTokenGoogle(
        await criarIdToken({ audience: audiences, authorizedParty: audience }),
        configuracao,
      ),
    ).rejects.toThrow(ErroIdTokenGoogleInvalido);
  });

  it('recusa authorized party divergente mesmo com audience única', async () => {
    await expect(
      validarIdTokenGoogle(
        await criarIdToken({ authorizedParty: 'cliente-incorreto' }),
        configuracao,
      ),
    ).rejects.toThrow(ErroIdTokenGoogleInvalido);
  });

  it('recusa emissão muito futura e aceita pequena diferença de relógio', async () => {
    const agora = Math.floor(Date.now() / 1000);
    await expect(
      validarIdTokenGoogle(await criarIdToken({ emitidoEm: agora + 120 }), configuracao),
    ).rejects.toThrow(ErroIdTokenGoogleInvalido);
    await expect(
      validarIdTokenGoogle(await criarIdToken({ emitidoEm: agora + 30 }), configuracao),
    ).resolves.toMatchObject({ subject: 'google-subject-ficticio-001' });
  });

  it('recusa nonce, confirmação de e-mail e domínio hospedado incorretos', async () => {
    await expect(
      validarIdTokenGoogle(await criarIdToken({ nonce: 'O'.repeat(43) }), configuracao),
    ).rejects.toThrow(ErroIdTokenGoogleInvalido);
    await expect(
      validarIdTokenGoogle(await criarIdToken({ emailVerified: 'true' }), configuracao),
    ).rejects.toThrow(ErroIdTokenGoogleInvalido);
    await expect(
      validarIdTokenGoogle(await criarIdToken({ workspace: 'pessoal.exemplo.test' }), configuracao),
    ).rejects.toThrow(ErroIdTokenGoogleInvalido);
  });

  it('recusa subject e e-mail em formato inválido mesmo quando assinados', async () => {
    await expect(
      validarIdTokenGoogle(await criarIdToken({ subject: 'subject com espaço' }), configuracao),
    ).rejects.toThrow(ErroIdTokenGoogleInvalido);
    await expect(
      validarIdTokenGoogle(await criarIdToken({ email: 'e-mail-invalido' }), configuracao),
    ).rejects.toThrow(ErroIdTokenGoogleInvalido);
  });

  it('falha sem fallback quando configuração obrigatória não está presente', async () => {
    await expect(validarIdTokenGoogle(await criarIdToken(), undefined as never)).rejects.toThrow(
      ErroConfiguracaoValidacaoGoogleInvalida,
    );
    await expect(
      validarIdTokenGoogle(await criarIdToken(), {
        ...configuracao,
        chaveDeVerificacao: undefined as never,
      }),
    ).rejects.toThrow(ErroConfiguracaoValidacaoGoogleInvalida);
    await expect(
      validarIdTokenGoogle(await criarIdToken(), {
        ...configuracao,
        nonceEsperado: 'curto',
      }),
    ).rejects.toThrow(ErroConfiguracaoValidacaoGoogleInvalida);
  });
});
