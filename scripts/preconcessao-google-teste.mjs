// Ferramenta excepcional, ainda sujeita a revisão e prova antes de uso remoto.
import { fileURLToPath } from 'node:url';
import { validarConexao } from './preparar-bootstrap-tecnico.mjs';
import { criarPoolCofre } from '../supabase/functions/_shared/pool-cofre.ts';
import { criarCifraAutenticada } from '../supabase/functions/_shared/cifra-autenticada.ts';

const projeto = 'drdpuxcllpymtoskmuqv';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function preconcessaoGoogleTeste(entrada) {
  const {
    projetoRef,
    projetoRefConfirmado,
    conexao,
    concessaoId,
    requestId,
    perfil,
    motivo,
    keyId,
    referenciaCifra,
    confirmacao,
  } = entrada;
  const email = typeof entrada.email === 'string' ? entrada.email.trim().toLowerCase() : '';
  validarConexao(conexao, projetoRef);
  if (
    projetoRef !== projeto ||
    projetoRefConfirmado !== projeto ||
    !uuid.test(concessaoId ?? '') ||
    !uuid.test(requestId ?? '') ||
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@francescato\.com\.br$/.test(email) ||
    perfil !== 'administrador' ||
    typeof motivo !== 'string' ||
    !motivo.trim() ||
    motivo.length > 4096 ||
    typeof keyId !== 'string' ||
    !keyId.trim() ||
    keyId.length > 128 ||
    !/^ffcmapp\.cifra\.[a-z0-9][a-z0-9_-]{0,63}$/.test(referenciaCifra ?? '')
  )
    throw new Error();
  if (confirmacao === undefined) return 'Prévia local válida; nenhuma conexão realizada.';
  if (confirmacao !== `CRIAR PRECONCESSAO GOOGLE ${projeto}`) throw new Error();

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
          [projeto, tipo, requestId, referencia],
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
    const valor = await lerServico('cifra', referenciaCifra);
    if (typeof valor !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(valor)) throw new Error();
    const chaveCifra = Uint8Array.from(Buffer.from(valor, 'base64'));
    if (chaveCifra.length !== 32 || Buffer.from(chaveCifra).toString('base64') !== valor)
      throw new Error();
    const hmac = await lerServico('hmac', null);
    if (!/^[A-Za-z0-9+/]{43}=$/.test(hmac)) throw new Error();
    const chaveHmac = Uint8Array.from(Buffer.from(hmac, 'base64'));
    if (chaveHmac.length !== 32 || Buffer.from(chaveHmac).toString('base64') !== hmac)
      throw new Error();
    const cifra = criarCifraAutenticada({
      keyIdAtiva: keyId,
      chavesDeCifra: { [keyId]: chaveCifra },
      chaveHmac,
    });
    const aad = { tabela: 'identidade.concessao_equipe', registro_id: concessaoId, formato: 1 };
    const emailCifrado = await cifra.cifrar(email, { ...aad, campo: 'email' });
    const motivoCifrado = await cifra.cifrar(motivo, { ...aad, campo: 'motivo' });
    const emailHmac = await cifra.calcularHmac(`email-concessao:${email}`);
    chaveCifra.fill(0);
    chaveHmac.fill(0);

    const cliente = await pool.connect();
    let destruir = true;
    try {
      await cliente.query('BEGIN');
      await cliente.query("SET LOCAL statement_timeout = '10s'");
      // A função resolve o operador e grava concessão e auditoria atomicamente.
      const resultado = await cliente.query(
        'select identidade.preconcessao_google_teste($1::text,$2::uuid,$3::jsonb,$4::text,$5::text,$6::jsonb,$7::uuid) as resultado',
        [
          projeto,
          concessaoId,
          JSON.stringify(emailCifrado),
          emailHmac,
          perfil,
          JSON.stringify(motivoCifrado),
          requestId,
        ],
      );
      if (resultado.rowCount !== 1 || resultado.rows[0]?.resultado !== 'criada') throw new Error();
      await cliente.query('COMMIT');
      destruir = false;
      return 'Pré-concessão criada e auditoria confirmada.';
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
    process.stdout.write(`${await preconcessaoGoogleTeste(JSON.parse(texto))}\n`);
  } catch {
    process.stderr.write(
      'Operação recusada ou resultado indeterminado; conferir banco e auditoria antes de repetir.\n',
    );
    process.exitCode = 1;
  }
}
