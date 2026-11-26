import type { Pool, PoolClient } from 'pg';
import { criarCursorCarteira } from '../../../packages/cadastro/src/cursor-carteira.ts';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarExecutorCofrePostgres } from '../../../supabase/functions/_shared/cofre-vault-postgres.ts';
import {
  carregarMaterialCriptograficoDoCofre,
  ErroCofreIndisponivel,
  lerChaveCofre,
  type ReferenciasCifraCofre,
} from '../../../supabase/functions/_shared/cofre-vault.ts';

/** O pool pertence ao chamador e exige identidade restrita, TLS verificado e prazos configurados. */
export async function carregarCofreNativo(
  pool: Pool,
  referencias: ReferenciasCifraCofre,
  keyIdAtestado: string,
  signal?: AbortSignal,
  referenciasIdempotencia?: Readonly<Record<string, string>>,
) {
  let cliente: PoolClient | undefined;
  let destruir = true;
  try {
    const verificarCancelamento = () => {
      if (signal?.aborted) throw new Error();
    };
    if (
      !pool ||
      typeof keyIdAtestado !== 'string' ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(keyIdAtestado)
    )
      throw new Error();
    verificarCancelamento();
    const poolCancelavel = new Proxy(pool, {
      get(alvo, propriedade, receptor) {
        if (propriedade !== 'connect') return Reflect.get(alvo, propriedade, receptor);
        return async () => {
          verificarCancelamento();
          const conexao = await alvo.connect();
          if (signal?.aborted) {
            conexao.release(true);
            throw new Error();
          }
          return new Proxy(conexao, {
            get(clienteAlvo, chave, clienteReceptor) {
              if (chave === 'query')
                return (...args: unknown[]) => {
                  verificarCancelamento();
                  return Reflect.apply(clienteAlvo.query, clienteAlvo, args);
                };
              const valor = Reflect.get(clienteAlvo, chave, clienteReceptor);
              return typeof valor === 'function' ? valor.bind(clienteAlvo) : valor;
            },
          });
        };
      },
    });
    const executor = criarExecutorCofrePostgres(poolCancelavel);
    const material = await carregarMaterialCriptograficoDoCofre(executor, referencias);
    verificarCancelamento();
    const entradas = Object.entries(referenciasIdempotencia ?? {});
    if (entradas.length > 16) throw new Error();
    const chavesIdempotencia: Record<string, Uint8Array> = Object.create(null);
    const usados = [material.chaveHmac, ...Object.values(material.chavesDeCifra)];
    for (const [id, referencia] of entradas) {
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw new Error();
      const anterior = await lerChaveCofre(executor, referencia);
      if (usados.some((existente) => existente.every((byte, indice) => byte === anterior[indice])))
        throw new Error();
      usados.push(anterior);
      chavesIdempotencia[id] = anterior;
    }
    verificarCancelamento();
    cliente = await poolCancelavel.connect();
    await cliente.query('BEGIN');
    await cliente.query("SET LOCAL statement_timeout = '10s'");
    await cliente.query('SET LOCAL ROLE ffcmapp_atestado_vault_executor');
    const resultado = await cliente.query(
      'select identidade.ler_chave_atestado_vault($1::text) as chave',
      [`ffcmapp.atestado.${keyIdAtestado}`],
    );
    const chave = resultado.rows[0]?.chave;
    if (resultado.rows.length !== 1 || !(chave instanceof Uint8Array) || chave.length !== 32)
      throw new Error();
    if (
      entradas.length > 0 &&
      usados.some((existente) => existente.every((byte, indice) => byte === chave[indice]))
    )
      throw new Error();
    const cifra = criarCifraAutenticada(material);
    const atestador = criarAtestadorOperacao({ keyId: keyIdAtestado, chave });
    // HKDF separa o domínio da carteira da chave HMAC já mantida no Vault.
    // Rotacionar essa chave invalida cursores anteriormente emitidos.
    const cursor = await criarCursorCarteira(material.chaveHmac);
    await cliente.query('COMMIT');
    destruir = false;
    return Object.freeze({
      cifra,
      atestador,
      cursor,
      chavesIdempotencia: Object.freeze(chavesIdempotencia),
    });
  } catch {
    throw new ErroCofreIndisponivel();
  } finally {
    cliente?.release(destruir);
  }
}
