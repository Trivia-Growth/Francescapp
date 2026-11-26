// Ciclo excepcional: entrada por stdin; nunca imprimir parâmetros ou segredos.
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arquivoPrivado } from './preparar-bootstrap-tecnico.mjs';
import { preconcessaoGoogleTeste } from './preconcessao-google-teste.mjs';

export async function executarPreconcessaoGoogle(entrada, dependencias = {}) {
  const { administradorToken, preparador, codigo, arquivoPosse, modo, confirmacaoRecuperacao } =
    entrada;
  const { projetoRef, projetoRefConfirmado, requestId } = preparador ?? {};
  const recuperar = modo === 'recuperar';
  if (
    projetoRef !== 'drdpuxcllpymtoskmuqv' ||
    projetoRef !== projetoRefConfirmado ||
    !/^op_[0-9a-f]{32}$/.test(codigo ?? '') ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId ?? '',
    ) ||
    typeof administradorToken !== 'string' ||
    !administradorToken.trim() ||
    !isAbsolute(arquivoPosse ?? '') ||
    (recuperar
      ? confirmacaoRecuperacao !== `RECUPERAR PRECONCESSAO ${projetoRef}`
      : (modo !== undefined && modo !== 'executar') ||
        preparador.confirmacao !== `CRIAR PRECONCESSAO GOOGLE ${projetoRef}`)
  )
    throw new Error();
  if (!recuperar)
    await (dependencias.preconcessaoGoogleTeste ?? preconcessaoGoogleTeste)({
      ...preparador,
      confirmacao: undefined,
    });
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
  const consultar = async (query, parameters, leitura = false) => {
    const resposta = await (dependencias.fetch ?? fetch)(
      `https://api.supabase.com/v1/projects/${projetoRef}/database/query${leitura ? '/read-only' : ''}`,
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
    return rows;
  };
  const fase = async (acao, resultado) => {
    const executar = (etapa) =>
      consultar('select operacao.fase_servico_preconcessao_teste($1,$2,$3,$4,$5,$6,$7)', [
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
    const rows = await consultar(
      `select acao from auditoria.evento where operador_restrito=$1 and request_id=$2::uuid
      and acao in ('preconcessao_teste.encerrado','preconcessao_teste.encerrado_indeterminado')
      order by instante desc,id desc limit 1`,
      [codigo, requestId],
      true,
    );
    if (rows.length !== 1) throw new Error();
    return rows[0].acao;
  };
  const encerramentoExistente = async () => {
    const rows = await consultar(
      `select acao from auditoria.evento where operador_restrito=$1 and request_id=$2::uuid
      and acao in ('preconcessao_teste.encerrado','preconcessao_teste.encerrado_indeterminado')
      order by instante desc,id desc limit 1`,
      [codigo, requestId],
    );
    if (rows.length > 1) throw new Error();
    return rows[0]?.acao;
  };
  let inicioTentado = false;
  let falhou = false;
  let resultado;
  let encerramentoFalhou = false;
  try {
    if (recuperar) {
      if (!(await encerramentoExistente())) await fase('encerrar', 'indeterminado');
      resultado = 'Encerrado; resultado da pré-concessão indeterminado.';
    } else {
      inicioTentado = true;
      await fase('autorizar', 'permitido');
      resultado = await (dependencias.preconcessaoGoogleTeste ?? preconcessaoGoogleTeste)(
        preparador,
      );
    }
  } catch {
    falhou = true;
    if (inicioTentado) {
      try {
        const rows = await consultar(
          'select exists(select 1 from auditoria.operador_tecnico where codigo=$1 and ativo and posse_ativa=$2) as autorizado',
          [codigo, credencial.posse],
        );
        if (rows.length === 1 && rows[0].autorizado === false) inicioTentado = false;
      } catch {
        /* Commit incerto: tentar encerramento. */
      }
    }
  } finally {
    if (inicioTentado) {
      try {
        if (
          (await fase('encerrar', falhou ? 'indeterminado' : 'permitido')) !==
          'preconcessao_teste.encerrado'
        )
          falhou = true;
      } catch {
        encerramentoFalhou = true;
      }
    }
  }
  if (encerramentoFalhou) throw new Error('ENCERRAMENTO_PENDENTE');
  if (falhou) throw new Error('RESULTADO_INDETERMINADO');
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
    process.stdout.write(`${await executarPreconcessaoGoogle(JSON.parse(texto))}\n`);
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
