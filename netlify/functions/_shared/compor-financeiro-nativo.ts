import type { Pool } from 'pg';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import { TAMANHO_MAXIMO_COMPROVANTE_BYTES } from '../../../packages/contracts/src/financeiro.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { ReferenciasCifraCofre } from '../../../supabase/functions/_shared/cofre-vault.ts';
import {
  metadadosAadConcessaoSchema,
  metadadosAadFinanceiroSchema,
} from '../../../packages/contracts/src/rpc.ts';
import {
  operarFinanceiroNativo,
  type ComandoFinanceiro,
  type PortasFinanceiras,
} from './financeiro-nativo.ts';
import { credencialAuthRejeitada, criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import { executarFinanceiroNativo } from './executor-financeiro-nativo.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';

type Resultado = Awaited<ReturnType<typeof operarFinanceiroNativo>>;
type CifraDoCofre = Awaited<ReturnType<typeof carregarCofreNativo>>['cifra'];

/** Cifra do financeiro: a cifra autenticada do cofre, sem dublê e sem conversão de tipo. O
 * canonicalizador de produção tem o ramo das duas tabelas financeiras, então o AAD montado
 * aqui é o mesmo que o AES-GCM liga ao envelope.
 *
 * O `parse` não é redundante com a tipagem: é a fronteira de confiança. Um AAD que não casar
 * com o contrato — tabela de cuidado, campo inexistente, id que não é UUID — levanta antes de
 * qualquer chamada criptográfica, a composição devolve `servico_indisponivel` (ou
 * `pendencia_externa` se a escrita já tinha começado) e nenhum texto claro chega a campo
 * `_cifrado`. Em nenhuma hipótese o financeiro grava motivo, descrição ou autorização sem
 * cifra: a falha é fechada. */
function cifraFinanceira(cifra: CifraDoCofre): PortasFinanceiras['cifra'] {
  return {
    cifrar: (valor, aad) => cifra.cifrar(valor, metadadosAadFinanceiroSchema.parse(aad)),
    decifrar: (valor, aad) => cifra.decifrar(valor, metadadosAadFinanceiroSchema.parse(aad)),
  };
}

const LEITURAS = new Set<ComandoFinanceiro['operacao']>([
  'consultarAudiencia',
  'listarConcessoes',
  'consultarValores',
  'consultarDespesas',
  'consultarApuracao',
  'lerComprovante',
]);

/** Composição server-only do financeiro do cuidado (FR-068, FR-069, FR-070); sem rota própria
 * e sem privilégio de banco. A audiência financeira é decidida no banco, por
 * `operacao.financeiro_audiencia_privada`, e nunca aqui. */
export async function comporFinanceiroNativo(
  request: Request,
  comando: ComandoFinanceiro,
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
    const pedido = new Request(request, { signal: controle.signal });
    const contexto = criarContextoAuthNativo(pedido, dependencias.fonte);
    const leitura = LEITURAS.has(comando.operacao);
    const autorizar = async () => {
      const alvo = request.headers.get('x-sessao');
      // Origem conferida em toda operação que escreve algo — inclusive o envio dos bytes do
      // comprovante, que não é mutação de tabela mas grava no repositório.
      if (!alvo || (!leitura && request.headers.get('origin') !== contexto.origem))
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
    return await noPrazo(() =>
      operarFinanceiroNativo(pedido, comando, {
        autorizar: async () => inicial,
        revalidar: autorizar,
        metadados: (requestId) =>
          metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
        cifra: cifraFinanceira(cofre.cifra),
        idempotencia: criarIdempotenciaNativa(cofre.cifra),
        // Porta estreita para o e-mail da concessão de equipe: a tela de concessão precisa
        // identificar a pessoa, e o AAD de `identidade.concessao_equipe` não pertence ao
        // recorte financeiro (design D1). O AAD é montado AQUI, com `campo: 'email'` fixo, e
        // validado pelo schema do contrato: a composição não aceita AAD vindo de fora.
        identidade: {
          decifrarEmailConcessao: (valor, concessaoId) =>
            cofre.cifra.decifrar(
              valor,
              metadadosAadConcessaoSchema.parse({
                tabela: 'identidade.concessao_equipe',
                registro_id: concessaoId,
                campo: 'email',
                formato: 1,
              }),
            ),
        },
        atestador: cofre.atestador,
        executar: (wrapper, transporte) => {
          verificarCancelamento();
          mutacaoIniciada = !leitura;
          return executarFinanceiroNativo(contexto.cliente, wrapper, transporte);
        },
        storage: {
          enviar: async (caminho, bytes, tipo) => {
            verificarCancelamento();
            mutacaoIniciada = true;
            const r = await contexto.cliente.storage
              .from('financeiro-comprovantes')
              .upload(caminho, new Uint8Array(bytes), {
                upsert: false,
                contentType: tipo,
                cacheControl: '0',
              });
            verificarCancelamento();
            if (contexto.cookiesAlterados) throw new Error('Sessão alterada.');
            if (r.error) {
              if ('statusCode' in r.error && String(r.error.statusCode) === '409')
                return 'existente';
              throw new Error('Comprovante indisponível.');
            }
            return 'criado';
          },
          obter: async (caminho) => {
            verificarCancelamento();
            const r = await contexto.cliente.storage
              .from('financeiro-comprovantes')
              .download(caminho);
            verificarCancelamento();
            if (
              r.error ||
              !r.data ||
              r.data.size > TAMANHO_MAXIMO_COMPROVANTE_BYTES ||
              contexto.cookiesAlterados
            )
              throw new Error('Comprovante indisponível.');
            const bytes = new Uint8Array(await r.data.arrayBuffer());
            verificarCancelamento();
            return bytes;
          },
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
