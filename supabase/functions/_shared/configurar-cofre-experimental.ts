import { criarCifraAutenticada } from './cifra-autenticada.ts';
import { criarExecutorCofrePostgres } from './cofre-vault-postgres.ts';
import {
  carregarMaterialCriptograficoDoCofre,
  ErroCofreIndisponivel,
  type ReferenciasCifraCofre,
} from './cofre-vault.ts';
import { criarPoolCofre } from './pool-cofre.ts';

/** Exclusivo do servidor; não conectar antes da revisão S-02 e prova Edge real. */
export async function carregarCifraDoCofreExperimental(
  configuracao: Parameters<typeof criarPoolCofre>[0],
  referencias: ReferenciasCifraCofre,
) {
  try {
    const pool = criarPoolCofre(configuracao);
    try {
      const executor = criarExecutorCofrePostgres(pool);
      const material = await carregarMaterialCriptograficoDoCofre(executor, referencias);
      return criarCifraAutenticada(material);
    } finally {
      await pool.end();
    }
  } catch {
    throw new ErroCofreIndisponivel();
  }
}
