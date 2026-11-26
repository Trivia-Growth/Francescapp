import pg from 'pg';
import { ErroConfiguracaoIndisponivel } from '../configuracao.ts';

/** Conexão do isolate ao PostgreSQL pelo Supavisor em **transaction mode** (D8).
 *
 * Consequências que a implementação não pode presumir resolvidas:
 *
 * - **Sem pool próprio no isolate.** O pooler é quem multiplexa. O isolate abre a conexão,
 *   usa dentro de uma transação e devolve. Um pool no isolate efêmero só somaria conexões
 *   ociosas que o Supavisor já conta contra o limite do projeto.
 * - **Nenhum estado de sessão sobrevive.** Em transaction mode a conexão física volta ao
 *   pooler a cada COMMIT, então `SET` de sessão, `SET ROLE` sem `LOCAL`, cursores e
 *   `LISTEN` não são utilizáveis. Tudo aqui é `SET LOCAL` dentro da transação, que é o mesmo
 *   padrão já usado por `netlify/functions/_shared/configuracao-servidor.ts`.
 * - **Nada aqui é autorização.** `SET LOCAL ROLE` troca o papel do executor; sessão,
 *   concessão e atestado continuam sendo verificados no banco pela RPC. */

export type ConfiguracaoSupavisor = Readonly<{
  host: string;
  porta: number;
  banco: string;
  usuario: string;
  senha: string;
  /** Obrigatório fora de `localhost`/`127.0.0.1`: sem CA não se abre conexão em claro. */
  certificadoCa?: string;
}>;

const dns =
  /^(?=.{1,253}$)(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?\.?|[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?\.)$/i;
const papelValido = /^[a-z_][a-z0-9_]{0,62}$/;
const tempoLimiteValido = /^[1-9][0-9]{0,4}(ms|s)$/;

function hostLocal(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1';
}

function conferir(configuracao: ConfiguracaoSupavisor): void {
  const { host, porta, banco, usuario, senha, certificadoCa } = configuracao;
  const usuarioAceito =
    /^[a-zA-Z0-9_.-]{1,128}$/.test(usuario) &&
    // O usuário do tenant no Supavisor é `postgres.<ref>`; `postgres` puro, `service_role` e
    // `supabase_admin` continuam recusados, como em `pool-cofre.ts`.
    !/^(postgres|service_role|supabase_admin)$/i.test(usuario) &&
    !/^(service_role|supabase_admin)\./i.test(usuario);
  if (
    typeof host !== 'string' ||
    !(dns.test(host) || hostLocal(host)) ||
    !Number.isInteger(porta) ||
    porta < 1 ||
    porta > 65535 ||
    typeof banco !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,63}$/.test(banco) ||
    typeof usuario !== 'string' ||
    !usuarioAceito ||
    typeof senha !== 'string' ||
    senha.length === 0
  )
    throw new ErroConfiguracaoIndisponivel();
  if (certificadoCa === undefined) {
    // Conexão em claro só é tolerada contra o PostgreSQL descartável do ambiente local.
    if (!hostLocal(host)) throw new ErroConfiguracaoIndisponivel();
    return;
  }
  if (
    typeof certificadoCa !== 'string' ||
    !/^-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----\s*$/.test(
      certificadoCa,
    )
  )
    throw new ErroConfiguracaoIndisponivel();
}

export type ConsultaAutorizada = Readonly<{
  /** Papel do executor aplicado com `SET LOCAL ROLE`, válido só dentro da transação. */
  papel: string;
  consulta: string;
  parametros?: readonly unknown[];
  tempoLimite?: string;
}>;

export type ConexaoSupavisor = Readonly<{
  executarAutorizado<Linha extends pg.QueryResultRow>(
    entrada: ConsultaAutorizada,
  ): Promise<Linha[]>;
}>;

/** Apenas construção local: não abre conexão nem comprova privilégios da identidade. */
export function criarConexaoSupavisor(configuracao: ConfiguracaoSupavisor): ConexaoSupavisor {
  conferir(configuracao);
  const { host, porta, banco, usuario, senha, certificadoCa } = configuracao;

  return Object.freeze({
    async executarAutorizado<Linha extends pg.QueryResultRow>(
      entrada: ConsultaAutorizada,
    ): Promise<Linha[]> {
      const tempoLimite = entrada.tempoLimite ?? '3s';
      if (!papelValido.test(entrada.papel) || !tempoLimiteValido.test(tempoLimite))
        throw new ErroConfiguracaoIndisponivel();
      const cliente = new pg.Client({
        host,
        port: porta,
        database: banco,
        user: usuario,
        password: senha,
        ssl: certificadoCa ? { ca: certificadoCa, rejectUnauthorized: true } : false,
        connectionTimeoutMillis: 5_000,
        query_timeout: 15_000,
      });
      await cliente.connect();
      try {
        await cliente.query('BEGIN');
        await cliente.query(`SET LOCAL statement_timeout = '${tempoLimite}'`);
        await cliente.query(`SET LOCAL ROLE "${entrada.papel}"`);
        const resultado = await cliente.query<Linha>(
          entrada.consulta,
          entrada.parametros ? [...entrada.parametros] : undefined,
        );
        await cliente.query('COMMIT');
        return resultado.rows;
      } finally {
        // Sem pool: a conexão física volta ao Supavisor a cada invocação.
        await cliente.end().catch(() => undefined);
      }
    },
  });
}
