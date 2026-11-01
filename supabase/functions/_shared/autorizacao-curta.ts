import {
  autorizacaoCurtaSchema,
  contextoAutorizacaoCurtaSchema as contextoSchema,
  dadosAutorizacaoCurtaSchema as dadosSchema,
  type ContextoAutorizacaoCurta,
  type DadosAutorizacaoCurta,
} from '../../../packages/contracts/src/autorizacao-curta.ts';
import { criarAtestadorOperacao } from './atestado-operacao.ts';

/** Experimental: apenas prova integridade e vínculo, não autentica sessão nem impede replay.
 * O consumidor deve executar o snapshot retornado; o banco deve recalcular o digest
 * dos bytes efetivamente usados. Nunca ligar a rotas sem autoridade isolada,
 * consumo atômico e revisão S-02. O snapshot pode conter dados sensíveis. */
export function criarAutorizacaoCurta(config: { keyId: string; chave: Uint8Array }) {
  if (
    !config.keyId ||
    config.keyId.length > 120 ||
    !(config.chave instanceof Uint8Array) ||
    config.chave.length !== 32
  ) {
    throw new Error('Configuração inválida.');
  }
  const keyId = config.keyId;
  const chave = crypto.subtle.importKey(
    'raw',
    new Uint8Array(config.chave),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const canonicalizar = criarAtestadorOperacao(config).canonicalizar;
  const encoder = new TextEncoder();
  const base64 = (bytes: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const digest = async (canonico: string) =>
    base64(await crypto.subtle.digest('SHA-256', encoder.encode(canonico)));
  const mensagem = (dados: DadosAutorizacaoCurta) =>
    encoder.encode(`ffcmapp:autorizacao-curta:v1:${canonicalizar(dados)}`);
  return Object.freeze({
    async emitir(
      contexto: ContextoAutorizacaoCurta,
      entrada: Record<string, unknown>,
      agora: number,
    ) {
      const validado = contextoSchema.parse(contexto);
      if (!Number.isSafeInteger(agora) || !Number.isSafeInteger(agora + 60_000))
        throw new Error('Instante inválido.');
      const entradaCanonica = canonicalizar(entrada);
      const dados = dadosSchema.parse({
        ...validado,
        key_id: keyId,
        id: crypto.randomUUID(),
        emitido_em: agora,
        expira_em: agora + 60_000,
        digest_entrada: await digest(entradaCanonica),
      });
      const mac = base64(await crypto.subtle.sign('HMAC', await chave, mensagem(dados)));
      return Object.freeze({ autorizacao: Object.freeze({ ...dados, mac }), entradaCanonica });
    },
    async verificar(
      autorizacao: unknown,
      contexto: ContextoAutorizacaoCurta,
      entrada: Record<string, unknown>,
      agora: number,
    ) {
      try {
        const { mac, ...dados } = autorizacaoCurtaSchema.parse(autorizacao);
        const esperado = contextoSchema.parse(contexto);
        const entradaCanonica = canonicalizar(entrada);
        const associado = {
          usuario_id: dados.usuario_id,
          session_id: dados.session_id,
          geracao: dados.geracao,
          operacao: dados.operacao,
          audiencia: dados.audiencia,
        };
        if (
          !Number.isSafeInteger(agora) ||
          dados.key_id !== keyId ||
          dados.emitido_em > agora ||
          dados.expira_em <= agora ||
          dados.expira_em - dados.emitido_em !== 60_000 ||
          canonicalizar(esperado) !== canonicalizar(associado) ||
          (await digest(entradaCanonica)) !== dados.digest_entrada
        )
          return false;
        const bytesMac = Uint8Array.from(
          atob(`${mac.replace(/-/g, '+').replace(/_/g, '/')}=`),
          (c) => c.charCodeAt(0),
        );
        if (base64(bytesMac.buffer) !== mac) return false;
        return await crypto.subtle.verify('HMAC', await chave, bytesMac, mensagem(dados));
      } catch {
        return false;
      }
    },
  });
}
