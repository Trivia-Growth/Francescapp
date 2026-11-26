import type { criarConcessaoEquipeReservadaSchema } from '../../../packages/contracts/src/identidade.ts';
import { prepararConcessaoEquipe } from '../../../packages/cadastro/src/preparar-concessao-equipe.ts';
import {
  assinaturasRpc,
  contratosRotas,
  criarTransporteRpcAtestadaSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/index.ts';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import { calcularCandidatosConcessao } from './idempotencia-concessao-equipe.ts';
import type { configurarIdempotenciaConcessao } from './configurar-idempotencia-concessao.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import type { configurarDependenciasNativas } from './configurar-dependencias-nativas.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import {
  executarCriacaoConcessaoEquipe,
  executarListagemConcessoesEquipe,
} from './executor-concessoes-equipe-nativo.ts';

type Dependencias = ReturnType<typeof configurarDependenciasNativas>;
type Consulta = ReturnType<typeof contratosRotas.listarConcessoes.entrada.parse>;
type CodigoListagem = 'nao_autenticado' | 'sem_permissao' | 'servico_indisponivel';
type CodigoCriacao =
  | 'entrada_invalida'
  | 'nao_autenticado'
  | 'sem_permissao'
  | 'servico_indisponivel'
  | 'pendencia_externa'
  | 'conflito_idempotencia'
  | 'conflito';
type Resultado<Codigo> = { ok: true; dados: unknown } | { ok: false; erro: { codigo: Codigo } };

/** Composição server-only da listagem de concessões de equipe; sem rota pública própria.
 *
 * A autorização acontece DUAS vezes de propósito: `autorizar()` antes de abrir o cofre e de
 * tocar no banco, e de novo depois da RPC, antes de devolver os dados decifrados. A segunda
 * passagem recusa sessão encerrada ou trocada no meio do caminho. Nenhuma das duas pode sair. */
export async function comporListagemConcessoesEquipe(
  request: Request,
  consulta: Consulta,
  requestId: string,
  signal: AbortSignal,
  dependencias: Dependencias,
): Promise<Resultado<CodigoListagem>> {
  try {
    const pedido = new Request(request.url, {
      method: 'GET',
      headers: request.headers,
      signal,
    });
    const contexto = criarContextoAuthNativo(pedido, dependencias.fonte);
    const autorizar = async () => {
      if (signal.aborted) throw new Error();
      const alvo = request.headers.get('x-sessao');
      if (!alvo) return { estado: 'nao_autenticado' as const };
      const usuario = await contexto.cliente.auth.getUser();
      if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' as const };
      if (usuario.error)
        return {
          estado: credencialAuthRejeitada(usuario.error)
            ? ('nao_autenticado' as const)
            : ('servico_indisponivel' as const),
        };
      if (!usuario.data.user) return { estado: 'nao_autenticado' as const };
      const resultado = await contexto.cliente
        .schema('api')
        .rpc('consultar_sessao_nativa', { p_request_id: requestId });
      if (resultado.error || signal.aborted) return { estado: 'servico_indisponivel' as const };
      const sessao = sessaoNativaSchema.safeParse(resultado.data);
      if (
        contexto.cookiesAlterados ||
        !sessao.success ||
        !sessao.data.usuario.ativo ||
        sessao.data.usuario.id !== usuario.data.user.id ||
        sessao.data.session_id.toLowerCase() !== alvo.toLowerCase()
      )
        return { estado: 'nao_autenticado' as const };
      if (sessao.data.usuario.perfil !== 'administrador')
        return { estado: 'sem_permissao' as const };
      return {
        estado: 'autorizado' as const,
        usuarioId: sessao.data.usuario.id.toLowerCase(),
        sessaoId: sessao.data.session_id.toLowerCase(),
      };
    };
    // Primeira verificação: antes do cofre e de qualquer acesso ao banco.
    const inicial = await autorizar();
    if (inicial.estado !== 'autorizado') return { ok: false, erro: { codigo: inicial.estado } };
    const cofre = await carregarCofreNativo(
      dependencias.pool,
      dependencias.referencias,
      dependencias.keyIdAtestado,
      signal,
    );
    const vinculo = { usuarioId: inicial.usuarioId, sessaoId: inicial.sessaoId };
    const cursor =
      consulta.cursor === undefined
        ? undefined
        : await cofre.cursor.abrir(consulta.cursor, vinculo);
    const entrada = {
      limite: consulta.limite,
      ...(consulta.estado === undefined ? {} : { estado: consulta.estado }),
      ...(cursor === undefined ? {} : { cursor }),
      request_id: requestId,
    };
    const metadados = {
      ...metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
      usuario_id: inicial.usuarioId,
      session_id: inicial.sessaoId,
      operacao: 'api.listar_concessoes_equipe',
    };
    const prova = resultadoAtestacaoSchema.parse(
      await cofre.atestador.atestarEntrada(metadados, entrada),
    );
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    const assinada = assinaturasRpc.listarConcessoes.entrada
      .omit({ atestado: true })
      .parse(JSON.parse(prova.entradaCanonica));
    if (
      Object.entries(entrada).some(
        ([campo, valor]) => assinada[campo as keyof typeof assinada] !== valor,
      ) ||
      Object.entries(metadados).some(
        ([campo, valor]) => dados[campo as keyof typeof metadados] !== valor,
      )
    )
      throw new Error();
    const transporte = criarTransporteRpcAtestadaSchema('listarConcessoes').parse({
      p_entrada: {
        entrada: { ...assinada, atestado: { ...dados, mac: prova.atestado.mac } },
        entrada_canonica: prova.entradaCanonica,
        dados_canonicos: prova.dadosCanonicos,
      },
    });
    const resposta = await executarListagemConcessoesEquipe(contexto.cliente, transporte.p_entrada);
    if (contexto.cookiesAlterados || signal.aborted) throw new Error();
    const pagina = assinaturasRpc.listarConcessoes.saida.parse(resposta);
    if (
      pagina.request_id.toLowerCase() !== requestId ||
      !pagina.ok ||
      pagina.dados.itens.length > entrada.limite
    ) {
      if (
        !pagina.ok &&
        pagina.request_id.toLowerCase() === requestId &&
        pagina.erro.codigo === 'sem_permissao'
      )
        return { ok: false, erro: { codigo: 'sem_permissao' } };
      throw new Error();
    }
    const itens = [];
    for (const item of pagina.dados.itens) {
      if (signal.aborted) throw new Error();
      const email = await cofre.cifra.decifrar(item.email, {
        tabela: 'identidade.concessao_equipe',
        registro_id: item.concessao_id,
        campo: 'email',
        formato: 1,
      });
      itens.push({
        id: item.concessao_id,
        email,
        perfil: item.perfil,
        estado: item.estado,
        usuario_id: item.usuario_id,
        ativo: item.ativo,
        versao: item.versao,
      });
    }
    const proximo_cursor =
      pagina.dados.proximo_cursor === null
        ? null
        : await cofre.cursor.emitir(pagina.dados.proximo_cursor, vinculo);
    const saida = contratosRotas.listarConcessoes.saida.parse({ itens, proximo_cursor });
    // Segunda verificação: depois da RPC e da decifra, antes de devolver os dados.
    const atual = await autorizar();
    if (atual.estado !== 'autorizado') return { ok: false, erro: { codigo: atual.estado } };
    if (
      signal.aborted ||
      atual.usuarioId !== inicial.usuarioId ||
      atual.sessaoId !== inicial.sessaoId
    )
      return { ok: false, erro: { codigo: 'nao_autenticado' } };
    return { ok: true, dados: saida };
  } catch {
    return { ok: false, erro: { codigo: 'servico_indisponivel' } };
  }
}

/** Composição server-only da criação de concessão de equipe; sem rota pública própria.
 *
 * Também autoriza DUAS vezes: `autorizar()` antes do cofre e da idempotência, e de novo depois
 * da RPC de criação, antes de montar a resposta. A segunda passagem responde `pendencia_externa`
 * quando a sessão deixou de valer, porque a gravação já aconteceu. Nenhuma das duas pode sair. */
export async function comporCriacaoConcessaoEquipe(
  request: Request,
  corpo: {
    validada: ReturnType<typeof criarConcessaoEquipeReservadaSchema.parse>;
    chaveIdempotencia: string;
  },
  requestId: string,
  signal: AbortSignal,
  dependencias: Dependencias,
  idempotenciaConfigurada: () => ReturnType<typeof configurarIdempotenciaConcessao>,
): Promise<Resultado<CodigoCriacao>> {
  let iniciada = false;
  try {
    const pedido = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      signal,
    });
    const contexto = criarContextoAuthNativo(pedido, dependencias.fonte);
    if (request.headers.get('origin') !== contexto.origem)
      return { ok: false, erro: { codigo: 'entrada_invalida' } };
    const autorizar = async () => {
      const alvo = request.headers.get('x-sessao');
      if (!alvo) return { estado: 'nao_autenticado' as const };
      if (signal.aborted) return { estado: 'servico_indisponivel' as const };
      const usuario = await contexto.cliente.auth.getUser();
      if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' as const };
      if (usuario.error)
        return {
          estado: credencialAuthRejeitada(usuario.error)
            ? ('nao_autenticado' as const)
            : ('servico_indisponivel' as const),
        };
      if (!usuario.data.user) return { estado: 'nao_autenticado' as const };
      const resultado = await contexto.cliente
        .schema('api')
        .rpc('consultar_sessao_nativa', { p_request_id: requestId });
      if (resultado.error || signal.aborted) return { estado: 'servico_indisponivel' as const };
      const sessao = sessaoNativaSchema.safeParse(resultado.data);
      if (
        contexto.cookiesAlterados ||
        !sessao.success ||
        !sessao.data.usuario.ativo ||
        sessao.data.usuario.id !== usuario.data.user.id ||
        sessao.data.session_id.toLowerCase() !== alvo.toLowerCase()
      )
        return { estado: 'nao_autenticado' as const };
      return {
        estado: 'autorizado' as const,
        usuarioId: sessao.data.usuario.id.toLowerCase(),
        sessaoId: sessao.data.session_id.toLowerCase(),
      };
    };
    // Primeira verificação: antes do cofre, da idempotência e de qualquer gravação.
    const inicial = await autorizar();
    if (inicial.estado !== 'autorizado') return { ok: false, erro: { codigo: inicial.estado } };
    const idempotencia = idempotenciaConfigurada();
    const cofre = await carregarCofreNativo(
      dependencias.pool,
      dependencias.referencias,
      dependencias.keyIdAtestado,
      signal,
      idempotencia.referencias,
    );
    const chave = corpo.chaveIdempotencia;
    const logico = cofre.atestador.canonicalizar({
      operacao: 'api.criar_concessao_equipe',
      usuario_id: inicial.usuarioId,
      corpo: corpo.validada.entrada,
    });
    const candidatos = await calcularCandidatosConcessao(
      cofre.chavesIdempotencia,
      inicial.usuarioId,
      chave,
      logico,
    );
    const ativo = candidatos[idempotencia.ativa];
    if (!ativo) throw new Error();
    const concessaoId = ativo.concessao_id;
    const digest = ativo.digest_idempotencia;
    const campos = await prepararConcessaoEquipe(
      { concessaoId, corpo: corpo.validada.entrada },
      cofre.cifra,
    );
    const entrada = {
      ...campos,
      reserva_id: corpo.validada.reserva_id,
      geracao_reserva: corpo.validada.geracao_reserva,
      request_id: requestId,
      auditoria_id: crypto.randomUUID(),
      chave_idempotencia: chave,
      digest_idempotencia: digest,
      versao_idempotencia: idempotencia.ativa,
      candidatos_idempotencia: candidatos,
    };
    const metadados = {
      ...metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
      usuario_id: inicial.usuarioId,
      session_id: inicial.sessaoId,
      operacao: 'api.criar_concessao_equipe',
    };
    const prova = resultadoAtestacaoSchema.parse(
      await cofre.atestador.atestarEntrada(metadados, entrada),
    );
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    const assinada = assinaturasRpc.criarConcessao.entrada
      .omit({ atestado: true })
      .parse(JSON.parse(prova.entradaCanonica));
    if (
      cofre.atestador.canonicalizar(assinada) !== cofre.atestador.canonicalizar(entrada) ||
      Object.entries(metadados).some(
        ([campo, valor]) => dados[campo as keyof typeof metadados] !== valor,
      )
    )
      throw new Error();
    const transporte = criarTransporteRpcAtestadaSchema('criarConcessao').parse({
      p_entrada: {
        entrada: { ...assinada, atestado: { ...dados, mac: prova.atestado.mac } },
        entrada_canonica: prova.entradaCanonica,
        dados_canonicos: prova.dadosCanonicos,
      },
    });
    if (signal.aborted) throw new Error();
    iniciada = true;
    const resposta = await executarCriacaoConcessaoEquipe(contexto.cliente, transporte.p_entrada);
    if (contexto.cookiesAlterados || signal.aborted) throw new Error();
    const resultado = assinaturasRpc.criarConcessao.saida.parse(resposta);
    if (resultado.request_id.toLowerCase() !== requestId) throw new Error();
    if (!resultado.ok) {
      if (
        resultado.erro.codigo === 'sem_permissao' ||
        resultado.erro.codigo === 'conflito' ||
        resultado.erro.codigo === 'conflito_idempotencia'
      )
        return { ok: false, erro: { codigo: resultado.erro.codigo } };
      throw new Error();
    }
    // Segunda verificação: depois da gravação, antes de montar a resposta.
    const atual = await autorizar();
    if (
      atual.estado !== 'autorizado' ||
      atual.usuarioId !== inicial.usuarioId ||
      atual.sessaoId !== inicial.sessaoId
    )
      return { ok: false, erro: { codigo: 'pendencia_externa' } };
    const saida = contratosRotas.criarConcessao.saida.parse({
      id: resultado.dados.concessao_id,
      perfil: resultado.dados.perfil,
      metodo: 'google_workspace',
      estado: resultado.dados.estado,
      usuario_id: resultado.dados.usuario_id,
      versao: resultado.dados.versao,
    });
    return { ok: true, dados: saida };
  } catch {
    return {
      ok: false,
      erro: { codigo: iniciada ? 'pendencia_externa' : 'servico_indisponivel' },
    };
  }
}
