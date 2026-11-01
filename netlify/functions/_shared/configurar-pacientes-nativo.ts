import {
  ErroConfiguracaoIndisponivel,
  type FonteDeConfiguracao,
} from '../../../supabase/functions/_shared/configuracao.ts';
import { criarPoolCofre } from '../../../supabase/functions/_shared/pool-cofre.ts';
import { carregarConfiguracaoAuthNativo } from './auth-nativo/cliente.ts';
import { comporPacientesNativo } from './compor-pacientes-nativo.ts';

/** Preparação server-only; criar pool não abre conexão nem comprova privilégios. */
export function configurarPacientesNativo(fonte: FonteDeConfiguracao) {
  try {
    carregarConfiguracaoAuthNativo(fonte);
    const obter = (nome: string) => {
      const valor = fonte[nome];
      if (!valor || !valor.trim() || valor !== valor.trim()) throw new Error();
      return valor;
    };
    const keyIdAtiva = obter('FFCM_VAULT_CIFRA_KEY_ID');
    const keyIdAtestado = obter('FFCM_VAULT_ATESTADO_KEY_ID');
    // Pares id=referência separados por vírgula; referências identificam segredos, não os contêm.
    const mapaCifra = obter('FFCM_VAULT_CIFRA_REFERENCIAS');
    const hmac = obter('FFCM_VAULT_HMAC_REFERENCIA');
    const entradas = mapaCifra.split(',');
    if (mapaCifra.length > 4096 || entradas.length > 16) throw new Error();
    const referenciasCifra: Record<string, string> = Object.create(null);
    const referenciasVistas = new Set<string>();
    for (const entrada of entradas) {
      const partes = entrada.split('=');
      const [id, referencia] = partes;
      if (
        partes.length !== 2 ||
        !id ||
        !referencia ||
        !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) ||
        !/^ffcmapp\.cifra\.[a-z0-9][a-z0-9_-]{0,63}$/.test(referencia) ||
        Object.hasOwn(referenciasCifra, id) ||
        referenciasVistas.has(referencia) ||
        referencia === hmac
      )
        throw new Error();
      referenciasCifra[id] = referencia;
      referenciasVistas.add(referencia);
    }
    if (
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(keyIdAtiva) ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(keyIdAtestado) ||
      !/^ffcmapp\.cifra\.[a-z0-9][a-z0-9_-]{0,63}$/.test(hmac) ||
      !Object.hasOwn(referenciasCifra, keyIdAtiva)
    )
      throw new Error();
    const porta = obter('FFCM_VAULT_DB_PORT');
    if (!/^[1-9][0-9]{0,4}$/.test(porta)) throw new Error();
    const pool = criarPoolCofre({
      host: obter('FFCM_VAULT_DB_HOST'),
      porta: Number(porta),
      banco: obter('FFCM_VAULT_DB_NAME'),
      usuario: obter('FFCM_VAULT_DB_USER'),
      senha: obter('FFCM_VAULT_DB_PASSWORD'),
      certificadoCa: obter('FFCM_VAULT_DB_CA'),
    });
    const dependencias = {
      fonte: Object.freeze({
        FFCM_SUPABASE_URL: fonte.FFCM_SUPABASE_URL,
        FFCM_SUPABASE_ANON_KEY: fonte.FFCM_SUPABASE_ANON_KEY,
        FFCM_APP_ORIGIN: fonte.FFCM_APP_ORIGIN,
      }),
      pool,
      referencias: {
        keyIdAtiva,
        referenciasCifra: Object.freeze(referenciasCifra),
        referenciaHmac: hmac,
      },
      keyIdAtestado,
    };
    return {
      executar: (request: Request, rota: Parameters<typeof comporPacientesNativo>[1]) =>
        comporPacientesNativo(request, rota, dependencias),
      encerrar: () => pool.end(),
    };
  } catch {
    throw new ErroConfiguracaoIndisponivel();
  }
}
