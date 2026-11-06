import {
  uuidSchema,
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/index.ts';
import { projetarPacienteAdministrativoExperimental } from '../../../packages/cadastro/src/projetar-paciente-experimental.ts';
import type { Pool } from 'pg';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { ReferenciasCifraCofre } from '../../../supabase/functions/_shared/cofre-vault.ts';
import { operarBarreiraEdicaoPaciente, operarEdicaoPaciente } from './edicao-paciente-operacao.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import {
  executarBarreiraEdicaoPacienteNativa,
  executarEdicaoPacienteNativa,
} from './executor-edicao-paciente-nativo.ts';

type Comando =
  | { tipo: 'consultar'; pacienteId: string }
  | { tipo: 'barreira'; entrada: Parameters<typeof operarBarreiraEdicaoPaciente>[1] }
  | { tipo: 'editar'; entrada: Parameters<typeof operarEdicaoPaciente>[1] };
type Resultado =
  | {
      ok: true;
      dados: Awaited<ReturnType<typeof projetarPacienteAdministrativoExperimental>>;
      request_id: string;
    }
  | Awaited<ReturnType<typeof operarEdicaoPaciente>>
  | Awaited<ReturnType<typeof operarBarreiraEdicaoPaciente>>;

/** Composição interna não publicada; wrappers SQL e privilégios seguem pendentes. */
export async function comporEdicaoPacienteNativa(
  request: Request,
  comando: Comando,
  dependencias: {
    fonte: FonteDeConfiguracao;
    pool: Pool;
    referencias: ReferenciasCifraCofre;
    keyIdAtestado: string;
  },
): Promise<Resultado> {
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  if (request.signal.aborted) cancelar();
  else request.signal.addEventListener('abort', cancelar, { once: true });
  const temporizador = setTimeout(cancelar, 15_000);
  let mutacaoIniciada = false;
  const verificarCancelamento = () => {
    if (controle.signal.aborted) throw new Error('Pedido cancelado.');
  };
  const noPrazo = async <T>(operacao: () => Promise<T>): Promise<T> => {
    verificarCancelamento();
    let abortar!: () => void;
    const cancelamento = new Promise<never>((_, rejeitar) => {
      abortar = () => rejeitar(new Error('Pedido cancelado.'));
      controle.signal.addEventListener('abort', abortar, { once: true });
    });
    try {
      const resultado = await Promise.race([operacao(), cancelamento]);
      verificarCancelamento();
      return resultado;
    } finally {
      controle.signal.removeEventListener('abort', abortar);
    }
  };
  try {
    verificarCancelamento();
    const pedido = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      signal: controle.signal,
    });
    const contexto = criarContextoAuthNativo(pedido, dependencias.fonte);
    const autorizar = async () => {
      const alvo = request.headers.get('x-sessao');
      if (!alvo || (request.method !== 'GET' && request.headers.get('origin') !== contexto.origem))
        return { estado: 'nao_autenticado' as const };
      const usuario = await contexto.cliente.auth.getUser();
      verificarCancelamento();
      if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' as const };
      if (usuario.error)
        return {
          estado: credencialAuthRejeitada(usuario.error)
            ? ('nao_autenticado' as const)
            : ('servico_indisponivel' as const),
        };
      if (!usuario.data.user) return { estado: 'nao_autenticado' as const };
      const resultado = await contexto.cliente.schema('api').rpc('consultar_sessao_nativa', {
        p_request_id: crypto.randomUUID(),
      });
      verificarCancelamento();
      if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' as const };
      if (resultado.error) return { estado: 'servico_indisponivel' as const };
      const sessao = sessaoNativaSchema.safeParse(resultado.data);
      if (
        !sessao.success ||
        !sessao.data.usuario.ativo ||
        sessao.data.usuario.id !== usuario.data.user.id ||
        sessao.data.session_id.toLowerCase() !== alvo.toLowerCase()
      )
        return { estado: 'nao_autenticado' as const };
      if (
        sessao.data.usuario.perfil !== 'administrador' ||
        !sessao.data.capacidades.includes('administrar_cadastro')
      )
        return { estado: 'sem_permissao' as const };
      return {
        estado: 'autorizado' as const,
        identidade: { usuario_id: sessao.data.usuario.id, session_id: sessao.data.session_id },
      };
    };
    const inicial = await noPrazo(autorizar);
    if (inicial.estado !== 'autorizado')
      return { ok: false, erro: { codigo: inicial.estado }, request_id: crypto.randomUUID() };
    const cofre = await noPrazo(() =>
      carregarCofreNativo(
        dependencias.pool,
        dependencias.referencias,
        dependencias.keyIdAtestado,
        controle.signal,
      ),
    );
    const comum = {
      autorizar: async () => inicial,
      revalidar: autorizar,
      metadados: (requestId: string) =>
        metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
      atestador: cofre.atestador,
    };
    if (comando.tipo === 'consultar') {
      return await noPrazo(async () => {
        const requestId = crypto.randomUUID();
        const pacienteId = uuidSchema.parse(comando.pacienteId).toLowerCase();
        const entrada = { request_id: requestId, paciente_id: pacienteId };
        const metadados = {
          ...comum.metadados(requestId),
          ...inicial.identidade,
          operacao: 'api.consultar_paciente_edicao',
        };
        const prova = resultadoAtestacaoSchema.parse(
          await cofre.atestador.atestarEntrada(metadados, entrada),
        );
        const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
        if (
          cofre.atestador.canonicalizar(entrada) !== prova.entradaCanonica ||
          cofre.atestador.canonicalizar(dados) !== prova.dadosCanonicos ||
          Object.entries(metadados).some(
            ([chave, valor]) => dados[chave as keyof typeof dados] !== valor,
          )
        )
          throw new Error();
        const resultado = await contexto.cliente
          .schema('api')
          .rpc('consultar_paciente_edicao_privado', {
            p_transporte: {
              entrada: { ...entrada, atestado: { ...dados, mac: prova.atestado.mac } },
              entrada_canonica: prova.entradaCanonica,
              dados_canonicos: prova.dadosCanonicos,
            },
          });
        if (resultado.error) throw new Error();
        const envelope: unknown = resultado.data;
        if (
          !envelope ||
          typeof envelope !== 'object' ||
          !('ok' in envelope) ||
          !('request_id' in envelope) ||
          envelope.request_id !== requestId
        )
          throw new Error();
        if (envelope.ok === false) {
          if (
            !('erro' in envelope) ||
            !envelope.erro ||
            typeof envelope.erro !== 'object' ||
            !('codigo' in envelope.erro) ||
            envelope.erro.codigo !== 'sem_permissao'
          )
            throw new Error();
          return {
            ok: false as const,
            erro: { codigo: 'sem_permissao' as const },
            request_id: requestId,
          };
        }
        if (envelope.ok !== true || !('dados' in envelope)) throw new Error();
        const projetado = await projetarPacienteAdministrativoExperimental(
          envelope.dados,
          cofre.cifra,
        );
        if (projetado.id.toLowerCase() !== pacienteId) throw new Error();
        const atual = await autorizar();
        if (
          atual.estado !== 'autorizado' ||
          atual.identidade.usuario_id.toLowerCase() !==
            inicial.identidade.usuario_id.toLowerCase() ||
          atual.identidade.session_id.toLowerCase() !== inicial.identidade.session_id.toLowerCase()
        )
          throw new Error();
        return { ok: true as const, dados: projetado, request_id: requestId };
      });
    }
    if (comando.tipo === 'barreira') {
      return await noPrazo(() =>
        operarBarreiraEdicaoPaciente(pedido, comando.entrada, {
          ...comum,
          executar: (transporte) => {
            verificarCancelamento();
            mutacaoIniciada =
              transporte.entrada.operacao !== 'api.consultar_barreira_edicao_paciente';
            return executarBarreiraEdicaoPacienteNativa(contexto.cliente, transporte);
          },
        }),
      );
    }
    return await noPrazo(() =>
      operarEdicaoPaciente(pedido, comando.entrada, {
        ...comum,
        cifra: cofre.cifra,
        idempotencia: criarIdempotenciaNativa(cofre.cifra),
        executar: (entrada) => {
          verificarCancelamento();
          mutacaoIniciada = true;
          return executarEdicaoPacienteNativa(contexto.cliente, entrada);
        },
      }),
    );
  } catch {
    return {
      ok: false,
      erro: { codigo: mutacaoIniciada ? 'pendencia_externa' : 'servico_indisponivel' },
      request_id: crypto.randomUUID(),
    };
  } finally {
    clearTimeout(temporizador);
    request.signal.removeEventListener('abort', cancelar);
  }
}
