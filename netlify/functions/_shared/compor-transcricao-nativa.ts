import type { Pool } from 'pg';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import {
  AUDIO_SEGUNDOS_MAXIMO,
  duracaoMaximaEfetiva,
} from '../../../packages/contracts/src/transcricao.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { ReferenciasCifraCofre } from '../../../supabase/functions/_shared/cofre-vault.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { numeroConfigurado, textoConfigurado } from './configuracao-servidor.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import { executarTranscricaoNativa } from './executor-transcricao-nativo.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import {
  criarPortaTranscricaoOpenRouter,
  type PortaTranscricao,
} from './openrouter-transcricao.ts';
import { lerSegredoIntegracao } from './segredo-integracao.ts';
import { operarTranscricaoNativa, type ComandoTranscricao } from './transcricao-nativa.ts';

type Resultado = Awaited<ReturnType<typeof operarTranscricaoNativa>>;

/** Referência do segredo no Vault. É o NOME, não o valor: quem cadastra o valor é o
 * solicitante, direto no Supabase Vault. Ver `20261119100000_vault_segredo_integracao.sql`. */
export const REFERENCIA_CHAVE_TRANSCRICAO = 'ffcmapp.integracao.openrouter';
/** Padrão usado quando o banco não traz a chave ou traz valor fora do catálogo. Mantém o
 * mesmo valor semeado em `20261119140000_configuracao_transcricao.sql`. */
const MODELO_PADRAO = 'openai/whisper-large-v3';
const MODELOS_ACEITOS = Object.freeze([
  'openai/whisper-large-v3',
  'openai/whisper-large-v3-turbo',
  'groq/whisper-large-v3',
  'groq/whisper-large-v3-turbo',
  'groq/distil-whisper-large-v3-en',
]);

/** Composição server-only da fatia de transcrição (FR-010); sem rota pública própria. */
export async function comporTranscricaoNativa(
  request: Request,
  comando: ComandoTranscricao,
  dependencias: {
    fonte: FonteDeConfiguracao;
    pool: Pool;
    referencias: ReferenciasCifraCofre;
    keyIdAtestado: string;
  },
  porta?: PortaTranscricao,
): Promise<Resultado> {
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  if (request.signal.aborted) cancelar();
  else request.signal.addEventListener('abort', cancelar, { once: true });
  // Mais folga que nas outras fatias porque há uma chamada externa no meio; o teto do
  // provedor é menor que este, então o cancelamento aqui é a última linha, não a primeira.
  const temporizador = setTimeout(cancelar, 75_000);
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
    const pedido = new Request(request, { signal: controle.signal });
    const contexto = criarContextoAuthNativo(pedido, dependencias.fonte);
    const autorizar = async () => {
      const alvo = request.headers.get('x-sessao');
      if (
        !alvo ||
        (comando.operacao !== 'ouvir' && request.headers.get('origin') !== contexto.origem)
      )
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
    // Modelo e teto vêm do banco (diretriz de 11/11/2026). Leitura que falha cai no padrão,
    // nunca em "sem limite" nem em modelo arbitrário.
    const modelo = await noPrazo(() =>
      textoConfigurado(
        dependencias.pool,
        'ffcm.transcricao.modelo',
        MODELO_PADRAO,
        MODELOS_ACEITOS,
      ),
    );
    const duracaoMaxima = duracaoMaximaEfetiva(
      await noPrazo(() =>
        numeroConfigurado(
          dependencias.pool,
          'ffcm.transcricao.duracao_maxima_segundos',
          90,
          1,
          AUDIO_SEGUNDOS_MAXIMO,
        ),
      ),
    );
    const transcritor =
      porta ??
      criarPortaTranscricaoOpenRouter(() =>
        lerSegredoIntegracao(dependencias.pool, REFERENCIA_CHAVE_TRANSCRICAO),
      );
    return await noPrazo(() =>
      operarTranscricaoNativa(pedido, comando, {
        autorizar: async () => inicial,
        revalidar: autorizar,
        metadados: (requestId) =>
          metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
        cifra: cofre.cifra,
        idempotencia: criarIdempotenciaNativa(cofre.cifra),
        atestador: cofre.atestador,
        duracaoMaxima,
        modelo,
        transcrever: (entrada) => transcritor.transcrever(entrada),
        executar: (_request, transporte) => {
          verificarCancelamento();
          mutacaoIniciada = comando.operacao !== 'ouvir';
          return executarTranscricaoNativa(contexto.cliente, transporte);
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
