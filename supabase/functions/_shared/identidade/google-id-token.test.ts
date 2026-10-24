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
  audience?: string;
  email?: string;
  emailVerified?: boolean | string;
  expiraEm?: number;
  issuer?: string;
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
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(alteracoes.subject ?? 'google-subject-ficticio-001')
    .setIssuer(alteracoes.issuer ?? 'https://accounts.google.com')
    .setAudience(alteracoes.audience ?? audience)
    .setIssuedAt()
    .setExpirationTime(alteracoes.expiraEm ?? '5m')
    .sign(parDeChaves.privateKey);
}

describe('validação local do ID token Google', () => {
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
