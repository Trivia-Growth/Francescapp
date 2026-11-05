import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificarAlvoBootstrap } from './verificar-alvo-bootstrap.mjs';
import { criarPoolCofre } from '../supabase/functions/_shared/pool-cofre.ts';
import { criarExecutorCofrePostgres } from '../supabase/functions/_shared/cofre-vault-postgres.ts';
import { carregarChaveHmacBootstrap } from '../supabase/functions/_shared/cofre-hmac-bootstrap.ts';
import { criarCifraAutenticada } from '../supabase/functions/_shared/cifra-autenticada.ts';

const refValida = /^[a-z0-9]{20}$/;
const uuidValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const repositorio = await realpath(fileURLToPath(new URL('..', import.meta.url)));

function validarConexao(config, ref) {
  if (
    !config ||
    !refValida.test(ref) ||
    typeof config.host !== 'string' ||
    typeof config.usuario !== 'string'
  )
    throw new Error();
  const direto = config.host === `db.${ref}.supabase.co`;
  const pooler =
    /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(config.host) && config.usuario.endsWith(`.${ref}`);
  if (!direto && !pooler) throw new Error();
}

export async function arquivoPrivado(caminho, dados) {
  if (!isAbsolute(caminho)) throw new Error();
  const pasta = await realpath(dirname(caminho));
  const dentro = relative(repositorio, pasta);
  if (dentro === '' || (!dentro.startsWith('..') && !isAbsolute(dentro))) throw new Error();
  let arquivo;
  let salvo;
  try {
    arquivo = await open(
      caminho,
      constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    await arquivo.writeFile(JSON.stringify(dados));
    await arquivo.sync();
    salvo = dados;
  } catch (erro) {
    if (erro.code !== 'EEXIST') throw erro;
    arquivo = await open(caminho, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await arquivo.stat();
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.size > 16384
    )
      throw new Error();
    salvo = JSON.parse(await arquivo.readFile('utf8'));
    await arquivo.sync();
  } finally {
    await arquivo?.close();
  }
  // Mesmo na repetição, uma tentativa anterior pode ter falhado antes deste sync.
  const diretorio = await open(pasta, constants.O_RDONLY);
  try {
    await diretorio.sync();
  } finally {
    await diretorio.close();
  }
  return salvo;
}

export async function prepararBootstrap(entrada) {
  const {
    projetoRef,
    projetoRefConfirmado,
    uuidAuth,
    email,
    token,
    conexao,
    concessaoId,
    requestId,
    motivo,
    keyId,
    referenciaCifra,
    arquivo,
    confirmacao,
    operadorServicoTeste,
  } = entrada;
  validarConexao(conexao, projetoRef);
  if (
    !uuidValido.test(concessaoId ?? '') ||
    !uuidValido.test(requestId ?? '') ||
    typeof motivo !== 'string' ||
    !motivo.trim() ||
    motivo.length > 4096 ||
    typeof keyId !== 'string' ||
    !keyId.trim() ||
    keyId.length > 128 ||
    !/^ffcmapp\.cifra\.[a-z0-9][a-z0-9_-]{0,63}$/.test(referenciaCifra ?? '')
  )
    throw new Error();
  await verificarAlvoBootstrap({ projetoRef, projetoRefConfirmado, uuidAuth, email, token });
  if (confirmacao === undefined)
    return 'prévia: projeto e vínculo Auth verificados; nenhuma conexão SQL realizada';
  if (confirmacao !== `EXECUTAR BOOTSTRAP ${projetoRef}`) throw new Error();
  const pool = criarPoolCofre(conexao);
  try {
    const lerServico = async (tipo, referencia) => {
      const cliente = await pool.connect();
      let destruir = true;
      try {
        await cliente.query('BEGIN');
        await cliente.query("SET LOCAL statement_timeout = '10s'");
        const resposta = await cliente.query(
          'select identidade.ler_cofre_servico_teste($1::text,$2::text,$3::uuid,$4::text) as chave',
          [projetoRef, tipo, requestId, referencia],
        );
        if (resposta.rows.length !== 1 || typeof resposta.rows[0].chave !== 'string')
          throw new Error();
        await cliente.query('COMMIT');
        destruir = false;
        return resposta.rows[0].chave;
      } finally {
        cliente.release(destruir);
      }
    };
    const valor =
      operadorServicoTeste === true
        ? await lerServico('cifra', referenciaCifra)
        : await criarExecutorCofrePostgres(pool).executar('identidade.ler_chave_cifra_vault', {
            p_referencia: referenciaCifra,
          });
    if (typeof valor !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(valor)) throw new Error();
    const chaveCifra = Uint8Array.from(Buffer.from(valor, 'base64'));
    if (chaveCifra.length !== 32 || Buffer.from(chaveCifra).toString('base64') !== valor)
      throw new Error();
    const hmac = operadorServicoTeste === true ? await lerServico('hmac', null) : null;
    if (
      hmac !== null &&
      (!/^[A-Za-z0-9+/]{43}=$/.test(hmac) ||
        Buffer.from(hmac, 'base64').length !== 32 ||
        Buffer.from(hmac, 'base64').toString('base64') !== hmac)
    )
      throw new Error();
    const chaveHmac =
      hmac === null
        ? await carregarChaveHmacBootstrap(pool)
        : Uint8Array.from(Buffer.from(hmac, 'base64'));
    const cifra = criarCifraAutenticada({
      keyIdAtiva: keyId,
      chavesDeCifra: { [keyId]: chaveCifra },
      chaveHmac,
    });
    const emailNormalizado = email.trim().toLowerCase();
    const aad = { tabela: 'identidade.concessao_equipe', registro_id: concessaoId, formato: 1 };
    const novo = {
      versao: 1,
      projetoRef,
      uuidAuth,
      concessaoId,
      emailCifrado: await cifra.cifrar(emailNormalizado, { ...aad, campo: 'email' }),
      motivoCifrado: await cifra.cifrar(motivo, { ...aad, campo: 'motivo' }),
      emailHmac: await cifra.calcularHmac(`email-concessao:${emailNormalizado}`),
    };
    const salvo = await arquivoPrivado(arquivo, novo);
    if (
      salvo.versao !== 1 ||
      salvo.projetoRef !== projetoRef ||
      salvo.uuidAuth !== uuidAuth ||
      salvo.concessaoId !== concessaoId ||
      salvo.emailHmac !== novo.emailHmac ||
      (await cifra.decifrar(salvo.emailCifrado, { ...aad, campo: 'email' })) !== emailNormalizado ||
      (await cifra.decifrar(salvo.motivoCifrado, { ...aad, campo: 'motivo' })) !== motivo
    )
      throw new Error();
    const cliente = await pool.connect();
    let destruir = true;
    try {
      await cliente.query('BEGIN');
      await cliente.query("SET LOCAL statement_timeout = '10s'");
      const resposta = await cliente.query(
        'select identidade.bootstrap_tecnico($1::text,$2::uuid,$3::uuid,$4::jsonb,$5::text,$6::jsonb,$7::uuid) as resultado',
        [
          projetoRef,
          uuidAuth,
          concessaoId,
          JSON.stringify(salvo.emailCifrado),
          salvo.emailHmac,
          JSON.stringify(salvo.motivoCifrado),
          requestId,
        ],
      );
      if (
        resposta.rows.length !== 1 ||
        !['inicializado', 'ja_inicializado'].includes(resposta.rows[0].resultado)
      )
        throw new Error();
      await cliente.query('COMMIT');
      destruir = false;
      return resposta.rows[0].resultado;
    } finally {
      cliente.release(destruir);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.argv.length !== 2) throw new Error();
    let texto = '';
    for await (const parte of process.stdin) {
      texto += parte;
      if (texto.length > 32768) throw new Error();
    }
    process.stdout.write(`${await prepararBootstrap(JSON.parse(texto))}\n`);
  } catch {
    process.stderr.write('Preparação recusada ou indisponível.\n');
    process.exitCode = 1;
  }
}
