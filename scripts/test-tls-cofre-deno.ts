import { criarPoolCofre } from '../supabase/functions/_shared/pool-cofre.ts';
import { criarExecutorCofrePostgres } from '../supabase/functions/_shared/cofre-vault-postgres.ts';
import { carregarMaterialCriptograficoDoCofre } from '../supabase/functions/_shared/cofre-vault.ts';
import {
  criarCifraAutenticada,
  ErroChaveIndisponivel,
} from '../supabase/functions/_shared/cifra-autenticada.ts';
import { carregarCifraDoCofreExperimental } from '../supabase/functions/_shared/configurar-cofre-experimental.ts';

const validoPath = Deno.env.get('FFCM_TLS_CERT_VALIDO');
const outroPath = Deno.env.get('FFCM_TLS_CERT_OUTRO');
if (Deno.env.get('FFCM_TLS_FIXTURE') !== '1' || !validoPath || !outroPath) {
  throw new Error('Fixture TLS descartável obrigatória.');
}
const valido = await Deno.readTextFile(validoPath);
const outro = await Deno.readTextFile(outroPath);
const base = {
  host: 'localhost.',
  porta: 55431,
  banco: 'postgres',
  usuario: 'ffcm_tls_teste',
  senha: 'senha-ficticia',
  certificadoCa: valido,
};
const cifraIntegrada = await carregarCifraDoCofreExperimental(base, {
  keyIdAtiva: 'v1',
  referenciasCifra: { v1: 'ffcmapp.cifra.aes' },
  referenciaHmac: 'ffcmapp.cifra.hmac',
});
const aadIntegrado = {
  tabela: 'cadastro.paciente' as const,
  registro_id: '50000000-0000-4000-8000-000000000001',
  campo: 'nome',
  formato: 1 as const,
};
const envelopeIntegrado = await cifraIntegrada.cifrar('Pessoa ficticia', aadIntegrado);
if ((await cifraIntegrada.decifrar(envelopeIntegrado, aadIntegrado)) !== 'Pessoa ficticia')
  throw new Error('Configuração integrada do cofre falhou.');
const cifraRotacionada = await carregarCifraDoCofreExperimental(base, {
  keyIdAtiva: 'v2',
  referenciasCifra: { v1: 'ffcmapp.cifra.aes', v2: 'ffcmapp.cifra.aes_v2' },
  referenciaHmac: 'ffcmapp.cifra.hmac',
});
if ((await cifraRotacionada.decifrar(envelopeIntegrado, aadIntegrado)) !== 'Pessoa ficticia')
  throw new Error('Leitura da chave anterior falhou.');
const envelopeNovo = await cifraRotacionada.cifrar('Pessoa ficticia', aadIntegrado);
if (
  envelopeNovo.key_id !== 'v2' ||
  (await cifraRotacionada.decifrar(envelopeNovo, aadIntegrado)) !== 'Pessoa ficticia'
)
  throw new Error('Rotação fictícia falhou.');
let antigaSemChave = false;
const somenteNova = await carregarCifraDoCofreExperimental(base, {
  keyIdAtiva: 'v2',
  referenciasCifra: { v2: 'ffcmapp.cifra.aes_v2' },
  referenciaHmac: 'ffcmapp.cifra.hmac',
});
try {
  await somenteNova.decifrar(envelopeIntegrado, aadIntegrado);
} catch (erro) {
  antigaSemChave =
    erro instanceof ErroChaveIndisponivel && erro.message === 'Chave criptográfica indisponível.';
}
if (!antigaSemChave) throw new Error('Chave anterior ausente foi aceita.');
let duplicadaRecusada = false;
const duplicada = await carregarCifraDoCofreExperimental(base, {
  keyIdAtiva: 'v2',
  referenciasCifra: { v1: 'ffcmapp.cifra.aes', v2: 'ffcmapp.cifra.aes' },
  referenciaHmac: 'ffcmapp.cifra.hmac',
});
try {
  await duplicada.cifrar('Pessoa ficticia', aadIntegrado);
} catch (erro) {
  duplicadaRecusada =
    erro instanceof ErroChaveIndisponivel && erro.message === 'Chave criptográfica indisponível.';
}
if (!duplicadaRecusada) throw new Error('Rotação com material duplicado foi aceita.');
for (const [configuracao, referencias] of [
  [
    { ...base, certificadoCa: outro },
    {
      keyIdAtiva: 'v1',
      referenciasCifra: { v1: 'ffcmapp.cifra.aes' },
      referenciaHmac: 'ffcmapp.cifra.hmac',
    },
  ],
  [
    base,
    {
      keyIdAtiva: 'v1',
      referenciasCifra: { v1: 'ffcmapp.cifra.ausente' },
      referenciaHmac: 'ffcmapp.cifra.hmac',
    },
  ],
  [
    base,
    {
      keyIdAtiva: 'v2',
      referenciasCifra: { v1: 'ffcmapp.cifra.aes' },
      referenciaHmac: 'ffcmapp.cifra.hmac',
    },
  ],
] as const) {
  let erroSanitizado = false;
  try {
    await carregarCifraDoCofreExperimental(configuracao, referencias);
  } catch (erro) {
    erroSanitizado = erro instanceof Error && erro.message === 'Chave criptográfica indisponível.';
  }
  if (!erroSanitizado) throw new Error('Falha do cofre não foi recusada de forma sanitizada.');
}
const pool = criarPoolCofre(base);
try {
  const resposta = await pool.query(
    'select current_user as usuario, ssl from pg_stat_ssl where pid = pg_backend_pid()',
  );
  if (resposta.rows[0]?.usuario !== 'ffcm_tls_teste' || resposta.rows[0]?.ssl !== true)
    throw new Error('TLS esperado ausente.');
  const conferirAcessoDiretoNegado = async () => {
    let codigo: unknown;
    try {
      await pool.query("select identidade.ler_chave_cifra_vault('ffcmapp.cifra.aes')");
    } catch (erro) {
      codigo = (erro as { code?: unknown }).code;
    }
    if (codigo !== '42501') throw new Error('Acesso direto não foi negado.');
  };
  await conferirAcessoDiretoNegado();
  const executor = criarExecutorCofrePostgres(pool);
  const material = await carregarMaterialCriptograficoDoCofre(executor, {
    keyIdAtiva: 'v1',
    referenciasCifra: { v1: 'ffcmapp.cifra.aes' },
    referenciaHmac: 'ffcmapp.cifra.hmac',
  });
  const cifra = criarCifraAutenticada(material);
  const aad = {
    tabela: 'cadastro.paciente' as const,
    registro_id: '50000000-0000-4000-8000-000000000001',
    campo: 'nome',
    formato: 1 as const,
  };
  const envelope = await cifra.cifrar('Pessoa ficticia', aad);
  if ((await cifra.decifrar(envelope, aad)) !== 'Pessoa ficticia')
    throw new Error('Cifra fictícia falhou.');
  let ausente = false;
  try {
    await executor.executar('identidade.ler_chave_cifra_vault', {
      p_referencia: 'ffcmapp.cifra.ausente',
    });
  } catch (erro) {
    ausente = erro instanceof Error && erro.message === 'Chave criptográfica indisponível.';
  }
  if (!ausente) throw new Error('Chave ausente não foi rejeitada.');
  await conferirAcessoDiretoNegado();
} finally {
  await pool.end();
}
for (const [porta, ca, codigo] of [
  [55431, outro, 'DEPTH_ZERO_SELF_SIGNED_CERT'],
  [55432, outro, 'ERR_TLS_CERT_ALTNAME_INVALID'],
] as const) {
  const negado = criarPoolCofre({ ...base, porta, certificadoCa: ca });
  let codigoRecebido: unknown;
  try {
    const cliente = await negado.connect();
    cliente.release();
  } catch (erro) {
    codigoRecebido = (erro as { code?: unknown }).code;
  } finally {
    await negado.end();
  }
  if (codigoRecebido !== codigo)
    throw new Error(`Rejeição TLS inesperada: ${String(codigoRecebido)}`);
}
const senhaInvalida = criarPoolCofre({ ...base, senha: 'senha-ficticia-errada' });
let erroSenha: unknown;
try {
  await senhaInvalida.query('select 1');
} catch (erro) {
  erroSenha = (erro as { code?: unknown }).code;
} finally {
  await senhaInvalida.end();
}
if (erroSenha !== '28P01') throw new Error('Senha incorreta não foi rejeitada.');

// O proxy é somente TCP: o TLS continua terminando no PostgreSQL de teste.
// Após confirmar TLS, retém respostas do servidor até o prazo da consulta vencer.
const listenerProxy = Deno.listen({ hostname: '::1', port: 55433 });
let retendo = false;
let respostaRetida = false;
let clienteProxy: Deno.Conn | undefined;
let servidorProxy: Deno.Conn | undefined;
const copiar = async (origem: Deno.Conn, destino: Deno.Conn, retorno: boolean) => {
  const buffer = new Uint8Array(16_384);
  try {
    while (true) {
      const tamanho = await origem.read(buffer);
      if (tamanho === null) break;
      if (retorno && retendo) {
        respostaRetida = true;
        continue;
      }
      let escrito = 0;
      while (escrito < tamanho) escrito += await destino.write(buffer.subarray(escrito, tamanho));
    }
  } catch {
    // A destruição da conexão após timeout encerra ambas as cópias.
  }
};
const fluxoProxy = (async () => {
  clienteProxy = await listenerProxy.accept();
  servidorProxy = await Deno.connect({ hostname: 'localhost.', port: 55431 });
  await Promise.all([
    copiar(clienteProxy, servidorProxy, false),
    copiar(servidorProxy, clienteProxy, true),
  ]);
})();
const poolInterrompido = criarPoolCofre({ ...base, porta: 55433 });
try {
  const tls = await poolInterrompido.query(
    'select ssl from pg_stat_ssl where pid = pg_backend_pid()',
  );
  if (tls.rows[0]?.ssl !== true) throw new Error('Proxy não preservou TLS.');
  retendo = true;
  const executor = criarExecutorCofrePostgres(poolInterrompido);
  let falhaSanitizada = false;
  const inicio = Date.now();
  try {
    await executor.executar('identidade.ler_chave_cifra_vault', {
      p_referencia: 'ffcmapp.cifra.aes',
    });
  } catch (erro) {
    falhaSanitizada = erro instanceof Error && erro.message === 'Chave criptográfica indisponível.';
  }
  const duracao = Date.now() - inicio;
  if (!falhaSanitizada || !respostaRetida || duracao < 14_000 || duracao > 20_000) {
    throw new Error('Interrupção de resposta não produziu timeout sanitizado.');
  }
  if (poolInterrompido.totalCount !== 0)
    throw new Error('Conexão interrompida não foi descartada.');
} finally {
  await poolInterrompido.end();
  listenerProxy.close();
  clienteProxy?.close();
  servidorProxy?.close();
  await fluxoProxy.catch(() => undefined);
}
