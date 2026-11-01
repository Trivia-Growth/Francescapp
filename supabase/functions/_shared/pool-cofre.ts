import pg from 'pg';
import { ErroCofreIndisponivel } from './cofre-vault.ts';

type ConfiguracaoPoolCofre = Readonly<{
  host: string;
  porta: number;
  banco: string;
  usuario: string;
  senha: string;
  certificadoCa: string;
}>;

/** Apenas construção local. Não comprova privilégios da identidade nem a CA fornecida. */
export function criarPoolCofre(configuracao: ConfiguracaoPoolCofre): pg.Pool {
  const { host, porta, banco, usuario, senha, certificadoCa } = configuracao;
  const dns =
    /^(?=.{1,253}$)(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?\.?|[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?\.)$/i;
  if (
    typeof host !== 'string' ||
    !dns.test(host) ||
    !Number.isInteger(porta) ||
    porta < 1 ||
    porta > 65535 ||
    typeof banco !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,63}$/.test(banco) ||
    typeof usuario !== 'string' ||
    !/^[a-zA-Z0-9_.-]{1,128}$/.test(usuario) ||
    /^(postgres|service_role|supabase_admin)(\.|$)/i.test(usuario) ||
    typeof senha !== 'string' ||
    senha.length === 0 ||
    typeof certificadoCa !== 'string' ||
    !/^-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----\s*$/.test(
      certificadoCa,
    )
  )
    throw new ErroCofreIndisponivel();
  return new pg.Pool({
    host,
    port: porta,
    database: banco,
    user: usuario,
    password: senha,
    ssl: { ca: certificadoCa, rejectUnauthorized: true },
    max: 1,
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
  });
}
