import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { userInfo, tmpdir } from 'node:os';
import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { SignJWT } from 'jose';
import { criarCifraAutenticada } from '../supabase/functions/_shared/cifra-autenticada.ts';
import { criarExecutorCofrePostgres } from '../supabase/functions/_shared/cofre-vault-postgres.ts';
import { criarCifraRefresh } from '../supabase/functions/_shared/sessao/cifra-refresh.ts';
import { criarProvaGeracao } from '../supabase/functions/_shared/sessao/prova-geracao.ts';
import { criarRenovacaoComProva } from '../supabase/functions/_shared/sessao/renovacao-prova.ts';
import { criarPersistenciaPostgresExperimento } from '../supabase/functions/_shared/sessao/persistencia-postgres-experimento.ts';

if (
  process.env.FFCM_PG_FIXTURE !== '1' ||
  !process.env.PGHOST?.includes('/ffcm-saida.') ||
  process.env.PGDATABASE !== 'ffcm_saida_teste_local'
) {
  throw new Error('Este teste exige o PostgreSQL descartável da fixture.');
}
const socket = realpathSync(process.env.PGHOST);
const diretorio = statSync(socket);
if (
  dirname(socket) !== realpathSync(tmpdir()) ||
  !/^ffcm-saida\.[A-Za-z0-9]+$/.test(basename(socket)) ||
  diretorio.uid !== process.getuid?.() ||
  (diretorio.mode & 0o777) !== 0o700
) {
  throw new Error('Diretório da fixture inválido.');
}
async function clienteAdminFixture() {
  const cliente = new pg.Client({
    host: socket,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: userInfo().username,
    ssl: false,
    connectionTimeoutMillis: 2000,
  });
  await cliente.connect();
  try {
    const resultado = await cliente.query(
      "select current_database() as banco, inet_server_addr() as endereco, current_setting('data_directory') as dados",
    );
    if (
      resultado.rows[0].banco !== 'ffcm_saida_teste_local' ||
      resultado.rows[0].endereco !== null ||
      realpathSync(resultado.rows[0].dados) !== realpathSync(join(socket, 'data'))
    )
      throw new Error('Cluster da fixture inválido.');
    return cliente;
  } catch {
    await cliente.end();
    throw new Error('Cluster da fixture inválido.');
  }
}
const pool = new pg.Pool({
  host: socket,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: 'ffcm_renovacao_runtime',
  ssl: false,
  connectionTimeoutMillis: 2000,
});
const persistencia = criarPersistenciaPostgresExperimento(pool);
const contexto = {
  usuarioId: '10000000-0000-4000-8000-000000000001',
  sessionId: '30000000-0000-4000-8000-000000000010',
  geracao: 1,
  tentativaId: '40000000-0000-4000-8000-000000000010',
  provaAtualHash: Buffer.alloc(32, 1).toString('base64url'),
};
const envelope = { formato: 1 as const, key_id: 'teste', nonce: 'n', ciphertext: 'c', tag: 't' };
const transicao = {
  ...contexto,
  envelope: { ...envelope, ciphertext: 'novo' },
  proximaProvaHash: Buffer.alloc(32, 2).toString('base64url'),
};
afterAll(async () => pool.end());
beforeAll(async () => {
  const cliente = await clienteAdminFixture();
  await cliente.end();
});
describe('persistência experimental de renovação', () => {
  it('isola leitura de chave fictícia atrás do papel de executor', async () => {
    const poolCofre = new pg.Pool({
      host: socket,
      port: Number(process.env.PGPORT),
      database: process.env.PGDATABASE,
      user: 'ffcm_vault_runtime',
      ssl: false,
      connectionTimeoutMillis: 2000,
      max: 1,
    });
    try {
      await expect(
        poolCofre.query("select identidade.ler_chave_cifra_vault('ffcmapp.cifra.teste')"),
      ).rejects.toThrow();
      const executor = criarExecutorCofrePostgres(poolCofre);
      await expect(
        executor.executar('identidade.ler_chave_cifra_vault', {
          p_referencia: 'ffcmapp.cifra.teste',
        }),
      ).resolves.toBe(Buffer.alloc(32, 7).toString('base64'));
      await expect(
        executor.executar('identidade.ler_chave_cifra_vault', {
          p_referencia: 'ffcmapp.cifra.ausente',
        }),
      ).rejects.toThrow('Chave criptográfica indisponível.');
      await expect(
        poolCofre.query("select identidade.ler_chave_cifra_vault('ffcmapp.cifra.teste')"),
      ).rejects.toThrow();
      await expect(poolCofre.query('select * from identidade.credencial_sessao')).rejects.toThrow();
    } finally {
      await poolCofre.end();
    }
  });
  it('rejeita envelope inválido sem expor detalhes', async () => {
    await expect(
      persistencia.confirmarInicio({ ...contexto, envelope: { ...envelope, nonce: '' } }),
    ).rejects.toThrow('Persistência de sessão indisponível.');
  });
  it('usa somente a fixture local e nega acesso direto', async () => {
    const result = await pool.query(
      'select current_database() as banco, inet_server_addr() as endereco, current_user as usuario',
    );
    expect(result.rows[0]).toEqual({
      banco: 'ffcm_saida_teste_local',
      endereco: null,
      usuario: 'ffcm_renovacao_runtime',
    });
    await expect(pool.query('select * from identidade.credencial_sessao')).rejects.toThrow();
  });
  it('rejeita prova incorreta e confirma cada transação da renovação', async () => {
    expect(
      await persistencia.iniciar({
        ...contexto,
        provaAtualHash: Buffer.alloc(32, 3).toString('base64url'),
      }),
    ).toBeNull();
    expect(await persistencia.iniciar(contexto)).toEqual({ envelope });
    expect(await persistencia.confirmarInicio({ ...contexto, envelope })).toBe(true);
    expect(await persistencia.persistir(transicao)).toBe(true);
    expect(await persistencia.confirmarPersistencia(transicao)).toBe(true);
    expect(await persistencia.liberar(transicao)).toBe(true);
    expect(await persistencia.confirmar(transicao)).toBe(true);
    expect(await persistencia.iniciar(contexto)).toBeNull();
  });
  it('permite apenas uma tentativa concorrente para a mesma geração', async () => {
    const primeira = { ...contexto, sessionId: '30000000-0000-4000-8000-000000000011' };
    const segunda = { ...primeira, tentativaId: '40000000-0000-4000-8000-000000000011' };
    const resultados = await Promise.all([
      persistencia.iniciar(primeira),
      persistencia.iniciar(segunda),
    ]);
    expect(resultados.filter((resultado) => resultado !== null)).toHaveLength(1);
    const vencedora = resultados[0] ? primeira : segunda;
    const perdedora = resultados[0] ? segunda : primeira;
    expect(await persistencia.confirmarInicio({ ...vencedora, envelope })).toBe(true);
    expect(await persistencia.confirmarInicio({ ...perdedora, envelope })).toBe(false);
  });
  it('reconcilia resposta perdida após persistência confirmada no banco', async () => {
    const sessao = '30000000-0000-4000-8000-000000000012';
    const usuario = contexto.usuarioId;
    const cifra = criarCifraRefresh(
      criarCifraAutenticada({
        keyIdAtiva: 'v1',
        chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
        chaveHmac: new Uint8Array(32).fill(29),
      }),
    );
    const prova = await criarProvaGeracao();
    const envelopeInicial = await cifra.cifrar('refresh-ficticio-antigo', { usuario, sessao });
    const admin = await clienteAdminFixture();
    try {
      await admin.query(
        'update identidade.credencial_sessao set envelope = $1::jsonb where session_id = $2::uuid',
        [JSON.stringify(envelopeInicial), sessao],
      );
      await admin.query(
        'update identidade.prova_saida_fixture set verificador = $1::bytea where session_id = $2::uuid',
        [Buffer.from(prova.provaHash, 'base64url'), sessao],
      );
    } finally {
      await admin.end();
    }
    const chave = new TextEncoder().encode('chave-ficticia-com-32-bytes-ou-mais');
    const issuer = 'https://projetoficticio.supabase.co/auth/v1';
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    let chamadas = 0;
    const renovar = criarRenovacaoComProva({
      cifra,
      auth: {
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt: {
          issuer,
          audience: 'authenticated',
          algoritmosPermitidos: ['HS256'],
          chaveDeVerificacao: chave,
        },
        buscar: async () => {
          chamadas++;
          return Response.json({
            access_token: token,
            refresh_token: 'refresh-ficticio-novo',
            token_type: 'bearer',
          });
        },
      },
      persistencia: {
        ...persistencia,
        persistir: async (entrada) => {
          await persistencia.persistir(entrada);
          throw new Error('resposta perdida fictícia');
        },
      },
    });
    const resultado = await renovar({
      usuarioId: usuario,
      sessionId: sessao,
      geracao: 1,
      prova: prova.prova,
    });
    expect(resultado).toMatchObject({ accessToken: token, geracao: 2 });
    expect(chamadas).toBe(1);
    await expect(
      renovar({ usuarioId: usuario, sessionId: sessao, geracao: 1, prova: prova.prova }),
    ).rejects.toThrow('Não foi possível renovar a sessão.');
  });
  it('não libera nova geração quando a saída é confirmada durante chamada Auth', async () => {
    const sessao = '30000000-0000-4000-8000-000000000013';
    const usuario = contexto.usuarioId;
    const cifra = criarCifraRefresh(
      criarCifraAutenticada({
        keyIdAtiva: 'v1',
        chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
        chaveHmac: new Uint8Array(32).fill(29),
      }),
    );
    const prova = await criarProvaGeracao();
    const envelopeInicial = await cifra.cifrar('refresh-ficticio-antigo', { usuario, sessao });
    const admin = await clienteAdminFixture();
    try {
      await admin.query(
        'update identidade.credencial_sessao set envelope = $1::jsonb where session_id = $2::uuid',
        [JSON.stringify(envelopeInicial), sessao],
      );
      await admin.query(
        'update identidade.prova_saida_fixture set verificador = $1::bytea where session_id = $2::uuid',
        [Buffer.from(prova.provaHash, 'base64url'), sessao],
      );
    } finally {
      await admin.end();
    }
    const chave = new TextEncoder().encode('chave-ficticia-com-32-bytes-ou-mais');
    const issuer = 'https://projetoficticio.supabase.co/auth/v1';
    const token = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    let saidaConfirmada = false;
    const renovar = criarRenovacaoComProva({
      cifra,
      auth: {
        projeto: 'projetoficticio',
        chavePublica: 'publica',
        configuracaoJwt: {
          issuer,
          audience: 'authenticated',
          algoritmosPermitidos: ['HS256'],
          chaveDeVerificacao: chave,
        },
        buscar: async () => {
          const resultado = await pool.query(
            'select saida_fixture.revogar($1::uuid,$2::uuid,$3::bigint,$4::bytea,$5::jsonb,$6::uuid) as confirmada',
            [
              sessao,
              usuario,
              1,
              Buffer.from(prova.provaHash, 'base64url'),
              JSON.stringify(envelope),
              '40000000-0000-4000-8000-000000000013',
            ],
          );
          saidaConfirmada = resultado.rows[0].confirmada === true;
          return Response.json({
            access_token: token,
            refresh_token: 'refresh-ficticio-novo',
            token_type: 'bearer',
          });
        },
      },
      persistencia,
    });
    await expect(
      renovar({ usuarioId: usuario, sessionId: sessao, geracao: 1, prova: prova.prova }),
    ).rejects.toThrow('Não foi possível renovar a sessão.');
    expect(saidaConfirmada).toBe(true);
    await expect(
      renovar({ usuarioId: usuario, sessionId: sessao, geracao: 1, prova: prova.prova }),
    ).rejects.toThrow('Não foi possível renovar a sessão.');
  });
  it('persiste e rotaciona nome cifrado sem texto claro, revertendo falha de chave', async () => {
    const paciente = '50000000-0000-4000-8000-000000000015';
    const contatoId = '60000000-0000-4000-8000-000000000015';
    const contato = 'pessoa-ficticia@exemplo.test';
    const nome = 'Paciente ficticio exclusivo de teste';
    const aadContato = {
      tabela: 'cadastro.contato_paciente' as const,
      registro_id: contatoId,
      campo: 'valor',
      formato: 1 as const,
    };
    const aad = {
      tabela: 'cadastro.paciente' as const,
      registro_id: paciente,
      campo: 'nome',
      formato: 1 as const,
    };
    const antiga = criarCifraAutenticada({
      keyIdAtiva: 'v1',
      chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
      chaveHmac: new Uint8Array(32).fill(43),
    });
    const rotacionada = criarCifraAutenticada({
      keyIdAtiva: 'v2',
      chavesDeCifra: { v1: new Uint8Array(32).fill(17), v2: new Uint8Array(32).fill(29) },
      chaveHmac: new Uint8Array(32).fill(43),
    });
    const semAntiga = criarCifraAutenticada({
      keyIdAtiva: 'v2',
      chavesDeCifra: { v2: new Uint8Array(32).fill(29) },
      chaveHmac: new Uint8Array(32).fill(43),
    });
    const admin = await clienteAdminFixture();
    try {
      await admin.query('begin');
      const primeiro = await antiga.cifrar(nome, aad);
      await admin.query(
        'insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values ($1::uuid,$2::jsonb,$3::uuid)',
        [paciente, JSON.stringify(primeiro), contexto.usuarioId],
      );
      const contatoCifrado = await antiga.cifrar(contato, aadContato);
      await admin.query(
        'insert into cadastro.contato_paciente(id,paciente_id,tipo,valor_cifrado) values ($1::uuid,$2::uuid,$3,$4::jsonb)',
        [contatoId, paciente, 'email', JSON.stringify(contatoCifrado)],
      );
      const salvoContato = (
        await admin.query('select valor_cifrado from cadastro.contato_paciente where id=$1::uuid', [
          contatoId,
        ])
      ).rows[0].valor_cifrado;
      expect(JSON.stringify(salvoContato)).not.toContain(contato);
      expect(await rotacionada.decifrar(salvoContato, aadContato)).toBe(contato);
      const ler = async () =>
        (
          await admin.query('select nome_cifrado from cadastro.paciente where id=$1::uuid', [
            paciente,
          ])
        ).rows[0].nome_cifrado;
      const salvo = await ler();
      expect(JSON.stringify(salvo)).not.toContain(nome);
      expect(await rotacionada.decifrar(salvo, aad)).toBe(nome);
      await admin.query('savepoint falha_de_chave');
      const parcial = await rotacionada.cifrar(nome, aad);
      await admin.query('update cadastro.paciente set nome_cifrado=$1::jsonb where id=$2::uuid', [
        JSON.stringify(parcial),
        paciente,
      ]);
      await expect(semAntiga.decifrar(salvo, aad)).rejects.toThrow();
      await admin.query('rollback to savepoint falha_de_chave');
      expect(await antiga.decifrar(await ler(), aad)).toBe(nome);
      const novo = await rotacionada.cifrar(await rotacionada.decifrar(salvo, aad), aad);
      await admin.query('update cadastro.paciente set nome_cifrado=$1::jsonb where id=$2::uuid', [
        JSON.stringify(novo),
        paciente,
      ]);
      const atualizado = await ler();
      expect(atualizado.key_id).toBe('v2');
      expect(JSON.stringify(atualizado)).not.toContain(nome);
      expect(await semAntiga.decifrar(atualizado, aad)).toBe(nome);
      const novoContato = await rotacionada.cifrar(
        await rotacionada.decifrar(salvoContato, aadContato),
        aadContato,
      );
      await admin.query(
        'update cadastro.contato_paciente set valor_cifrado=$1::jsonb where id=$2::uuid',
        [JSON.stringify(novoContato), contatoId],
      );
      const lerContato = async () =>
        (
          await admin.query('select valor_cifrado from cadastro.contato_paciente where id=$1::uuid', [
            contatoId,
          ])
        ).rows[0].valor_cifrado;
      const contatoAtualizado = await lerContato();
      expect(contatoAtualizado.key_id).toBe('v2');
      expect(JSON.stringify(contatoAtualizado)).not.toContain(contato);
      expect(await semAntiga.decifrar(contatoAtualizado, aadContato)).toBe(contato);

      await admin.query('savepoint falha_sql');
      const candidato = await rotacionada.cifrar(nome, aad);
      await admin.query('update cadastro.paciente set nome_cifrado=$1::jsonb where id=$2::uuid', [
        JSON.stringify(candidato), paciente,
      ]);
      await expect(
        admin.query('update cadastro.contato_paciente set valor_cifrado=$1::jsonb where id=$2::uuid', [
          JSON.stringify({ formato: 1 }), contatoId,
        ]),
      ).rejects.toThrow();
      await admin.query('rollback to savepoint falha_sql');
      expect(await ler()).toEqual(atualizado);
      expect(await lerContato()).toEqual(contatoAtualizado);
    } finally {
      await admin.query('rollback');
      await admin.end();
    }
  });
});
