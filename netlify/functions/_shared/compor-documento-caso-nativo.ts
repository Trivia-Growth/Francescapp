import type { Pool } from 'pg';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { ReferenciasCifraCofre } from '../../../supabase/functions/_shared/cofre-vault.ts';
import { operarDocumentoCasoNativo, type ComandoDocumento } from './documento-caso-nativo.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import { executarDocumentoCasoNativo } from './executor-documento-caso-nativo.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import { carregarConfiguracaoServidor } from './configuracao-servidor.ts';
import { lerSegredoIntegracao } from './segredo-integracao.ts';
import { criarPortaDrive } from './google-drive.ts';

type Resultado = Awaited<ReturnType<typeof operarDocumentoCasoNativo>>;

/** Referência do segredo no Supabase Vault. Cadastrar a referência (migration
 * `20261120100000`) não é cadastrar o valor: o JSON da conta de serviço é colocado no Vault
 * pelo solicitante, nunca pelo repositório. */
export const REFERENCIA_DRIVE = 'ffcmapp.integracao.google_drive';

/** Composição server-only da fatia de documentos (FR-029 a FR-031); sem rota pública própria. */
export async function comporDocumentoCasoNativo(
  request: Request,
  comando: ComandoDocumento,
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
  const temporizador = setTimeout(cancelar, 25_000);
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
    // Origem conferida fora de `autorizar`, como em `concessoes-equipe.ts`: pedido de outra
    // origem é entrada inválida, não falta de autenticação.
    if (comando.operacao === 'gravar' && request.headers.get('origin') !== contexto.origem)
      return {
        ok: false,
        erro: { codigo: 'entrada_invalida' as const },
        request_id: crypto.randomUUID(),
      };
    const autorizar = async () => {
      const alvo = request.headers.get('x-sessao');
      if (!alvo) return { estado: 'nao_autenticado' as const };
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
    // A pasta raiz e a credencial só são buscadas quando há arquivo a enviar: uma consulta de
    // relação de anexos não precisa alcançar o cofre nem o Google.
    let drive: Parameters<typeof operarDocumentoCasoNativo>[2]['drive'];
    if (comando.operacao === 'gravar' && comando.arquivo) {
      const configuracao = await noPrazo(() => carregarConfiguracaoServidor(dependencias.pool));
      const raiz = configuracao.get('ffcm.documentos.drive_pasta_raiz')?.valor;
      // Sem pasta configurada, o envio é recusado. Nunca se escolhe outro local de guarda:
      // substituição silenciosa de armazenamento é proibida pelo design desta fatia.
      if (typeof raiz !== 'string' || raiz.trim().length === 0)
        return {
          ok: false,
          erro: { codigo: 'servico_indisponivel' as const },
          request_id: crypto.randomUUID(),
        };
      const segredo = await noPrazo(() =>
        lerSegredoIntegracao(dependencias.pool, REFERENCIA_DRIVE),
      );
      drive = { porta: criarPortaDrive(segredo, controle.signal), pastaRaiz: raiz.trim() };
    }
    return await noPrazo(() =>
      operarDocumentoCasoNativo(pedido, comando, {
        autorizar: async () => inicial,
        revalidar: autorizar,
        metadados: (requestId) =>
          metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
        cifra: cofre.cifra,
        idempotencia: criarIdempotenciaNativa(cofre.cifra),
        atestador: cofre.atestador,
        ...(drive ? { drive } : {}),
        executar: (_request, transporte) => {
          verificarCancelamento();
          mutacaoIniciada = comando.operacao === 'gravar';
          return executarDocumentoCasoNativo(contexto.cliente, transporte);
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
