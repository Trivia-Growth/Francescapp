// Operação local revisável. Nenhum segredo é escrito em argumentos ou saída.
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarPoolCofre } from '../supabase/functions/_shared/pool-cofre.ts';
import {
  arquivoPrivado,
  prepararBootstrap,
  validarConexao,
} from './preparar-bootstrap-tecnico.mjs';
import { verificarAlvoBootstrap } from './verificar-alvo-bootstrap.mjs';

export async function executarServicoTeste(entrada, dependencias = {}) {
  const {
    administradorConexao,
    administradorToken,
    preparador,
    codigo,
    modo,
    confirmacaoRecuperacao,
    arquivoPosse,
  } = entrada;
  const { projetoRef, projetoRefConfirmado, uuidAuth, email, token, requestId } = preparador ?? {};
  const recuperar = modo === 'recuperar';
  if (
    !/^op_[0-9a-f]{32}$/.test(codigo ?? '') ||
    projetoRef !== projetoRefConfirmado ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId ?? '',
    ) ||
    (recuperar
      ? confirmacaoRecuperacao !== `RECUPERAR SERVICO ${projetoRef}`
      : preparador?.operadorServicoTeste !== true ||
        preparador.confirmacao !== `EXECUTAR BOOTSTRAP ${projetoRef}`)
  )
    throw new Error();
  const gestao = typeof administradorToken === 'string' && administradorToken.length > 0;
  if (gestao && !/^[a-z0-9]{20}$/.test(projetoRef ?? '')) throw new Error();
  if (!gestao) validarConexao(administradorConexao, projetoRef);
  if (!recuperar) {
    validarConexao(preparador.conexao, projetoRef);
    await (dependencias.verificarAlvoBootstrap ?? verificarAlvoBootstrap)({
      projetoRef,
      projetoRefConfirmado,
      uuidAuth,
      email,
      token,
    });
  }
  if (!isAbsolute(arquivoPosse ?? '')) throw new Error();
  const pasta = await realpath(dirname(arquivoPosse));
  const repositorio = await realpath(fileURLToPath(new URL('..', import.meta.url)));
  const dentro = relative(repositorio, pasta);
  if (dentro === '' || (!dentro.startsWith('..') && !isAbsolute(dentro))) throw new Error();
  let credencial;
  if (recuperar) {
    const arquivo = await open(arquivoPosse, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await arquivo.stat();
      if (
        !stat.isFile() ||
        stat.uid !== process.getuid() ||
        (stat.mode & 0o777) !== 0o600 ||
        stat.size > 2048
      )
        throw new Error();
      credencial = JSON.parse(await arquivo.readFile('utf8'));
    } finally {
      await arquivo.close();
    }
  } else {
    const nova = { projetoRef, codigo, requestId, posse: randomBytes(32).toString('hex') };
    credencial = await arquivoPrivado(arquivoPosse, nova);
    if (credencial.posse !== nova.posse) throw new Error();
  }
  if (
    credencial.projetoRef !== projetoRef ||
    credencial.codigo !== codigo ||
    credencial.requestId !== requestId ||
    !/^[0-9a-f]{64}$/.test(credencial.posse ?? '')
  )
    throw new Error();
  const texto = await readFile(
    new URL('../supabase/drafts/operar_servico_teste.sql', import.meta.url),
    'utf8',
  );
  const blocos = [...texto.matchAll(/do \$\$[\s\S]*?end \$\$;/gi)].map((item) => item[0]);
  if (blocos.length !== 2) throw new Error();
  const pool = gestao
    ? null
    : (dependencias.criarPoolCofre ?? criarPoolCofre)(administradorConexao);
  const consultar = async (query, parameters, somenteLeitura = false) => {
    const resposta = await (dependencias.fetch ?? fetch)(
      `https://api.supabase.com/v1/projects/${projetoRef}/database/query${somenteLeitura ? '/read-only' : ''}`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${administradorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, parameters }),
      },
    );
    if (!resposta.ok) throw new Error();
    const rows = await resposta.json();
    if (!Array.isArray(rows)) throw new Error();
    return { rows };
  };
  const consultaAdmin = (query, parameters) =>
    gestao ? consultar(query, parameters, true) : pool.query(query, parameters);
  const fase = async (acao, resultado) => {
    if (gestao) {
      const executar = (etapa) =>
        consultar('select operacao.fase_servico_teste($1,$2,$3,$4,$5,$6,$7)', [
          etapa,
          projetoRef,
          codigo,
          acao,
          requestId,
          resultado,
          credencial.posse,
        ]);
      if (acao === 'encerrar') await executar('pre_encerrar');
      await executar('principal');
      if (acao !== 'encerrar') return undefined;
      const consulta = await consultaAdmin(
        `select acao from auditoria.evento
        where operador_restrito=$1 and request_id=$2::uuid
        and acao in ('servico_teste.encerrado','servico_teste.encerrado_indeterminado')
        order by instante desc, id desc limit 1`,
        [codigo, requestId],
      );
      if (consulta.rows.length !== 1) throw new Error();
      return consulta.rows[0].acao;
    }
    const cliente = await pool.connect();
    let destruir = true;
    try {
      const transacao = async (bloco) => {
        await cliente.query('BEGIN');
        await cliente.query("SET LOCAL lock_timeout = '5s'");
        await cliente.query("SET LOCAL statement_timeout = '15s'");
        await cliente.query(
          `select set_config('ffcmapp.op_projeto',$1,true),
          set_config('ffcmapp.op_codigo',$2,true),set_config('ffcmapp.op_acao',$3,true),
          set_config('ffcmapp.op_request',$4,true),set_config('ffcmapp.op_resultado',$5,true),
          set_config('ffcmapp.op_posse',$6,true)`,
          [projetoRef, codigo, acao, requestId, resultado, credencial.posse],
        );
        await cliente.query(bloco);
        await cliente.query('COMMIT');
      };
      if (acao === 'encerrar') await transacao(blocos[0]);
      await transacao(blocos[1]);
      let encerramento;
      if (acao === 'encerrar') {
        const consulta = await cliente.query(
          `select acao from auditoria.evento
          where operador_restrito=$1 and request_id=$2::uuid
          and acao in ('servico_teste.encerrado','servico_teste.encerrado_indeterminado')
          order by instante desc, id desc limit 1`,
          [codigo, requestId],
        );
        if (consulta.rows.length !== 1) throw new Error();
        encerramento = consulta.rows[0].acao;
      }
      destruir = false;
      return encerramento;
    } finally {
      cliente.release(destruir);
    }
  };
  let inicioTentado = false;
  let resultado;
  let falhou = false;
  let erroOriginal;
  let erroEncerramento;
  try {
    if (recuperar) {
      await fase('encerrar', 'indeterminado');
      resultado = 'encerrado_indeterminado';
    } else {
      inicioTentado = true;
      await fase('autorizar', 'permitido');
      resultado = await (dependencias.prepararBootstrap ?? prepararBootstrap)(preparador);
    }
  } catch (erro) {
    falhou = true;
    erroOriginal = erro;
    if (inicioTentado) {
      try {
        const consulta = await consultaAdmin(
          `select exists(select 1 from auditoria.operador_tecnico
          where codigo=$1 and ativo and posse_ativa=$2) as autorizado`,
          [codigo, credencial.posse],
        );
        if (consulta.rows.length === 1 && consulta.rows[0].autorizado === false)
          inicioTentado = false;
      } catch {
        // Commit incerto: tentativa de encerramento exige request autorizado no banco.
      }
    }
  } finally {
    if (inicioTentado) {
      try {
        const encerramento = await fase('encerrar', falhou ? 'indeterminado' : 'permitido');
        if (encerramento !== 'servico_teste.encerrado') falhou = true;
      } catch (erro) {
        erroEncerramento = erro;
      }
    }
    try {
      await pool?.end();
    } catch (erro) {
      erroEncerramento ??= erro;
    }
  }
  if (erroEncerramento)
    throw new Error('ENCERRAMENTO_PENDENTE', { cause: erroOriginal ?? erroEncerramento });
  if (falhou) throw new Error('RESULTADO_INDETERMINADO', { cause: erroOriginal });
  return resultado;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.argv.length !== 2 || process.stdin.isTTY) throw new Error();
    let texto = '';
    for await (const parte of process.stdin) {
      texto += parte;
      if (texto.length > 65536) throw new Error();
    }
    process.stdout.write(`${await executarServicoTeste(JSON.parse(texto))}\n`);
  } catch (erro) {
    const codigo =
      erro instanceof Error &&
      ['ENCERRAMENTO_PENDENTE', 'RESULTADO_INDETERMINADO'].includes(erro.message)
        ? erro.message
        : 'OPERACAO_RECUSADA';
    process.stderr.write(`${codigo}\n`);
    process.exitCode = 1;
  }
}
