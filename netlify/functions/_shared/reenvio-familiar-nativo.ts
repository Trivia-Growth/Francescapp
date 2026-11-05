import {
  dadosAtestadoSchema,
  reservaReenvioFamiliarSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/rpc.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import { enviarConviteFamiliarNativo } from './auth-nativo/enviar-convite-familiar.ts';
import type { carregarCofreNativo } from './cofre-nativo.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';

type Cliente = ReturnType<typeof criarContextoAuthNativo>['cliente'];
type Cofre = Awaited<ReturnType<typeof carregarCofreNativo>>;

/** Preparação privada: sem rota e bloqueada antes da reserva até provas integradas. */
export async function reenviarFamiliarNativo(
  cliente: Cliente,
  cofre: Cofre,
  fonte: FonteDeConfiguracao,
  contexto: {
    usuarioId: string;
    sessaoId: string;
    conviteId: string;
    tentativaId: string;
    keyId: string;
  },
  signal: AbortSignal,
): Promise<'enviado' | 'falha' | 'resultado_incerto'> {
  const integracaoComprovada = false;
  if (!integracaoComprovada || fonte.FFCM_CONVITE_FAMILIAR_ATIVO !== 'true' || signal.aborted)
    throw new Error('Convite indisponível.');
  const tentativaId = contexto.tentativaId.toLowerCase();
  async function executar(acao: 'reservar' | 'concluir', enviado?: boolean) {
    const requestId = crypto.randomUUID();
    const entrada = {
      request_id: requestId,
      convite_id: contexto.conviteId.toLowerCase(),
      tentativa_id: tentativaId,
      acao,
      ...(acao === 'concluir' ? { enviado } : {}),
    };
    const metadados = {
      ...metadadosAtestadoNativo(contexto.keyId, requestId, Date.now()),
      usuario_id: contexto.usuarioId.toLowerCase(),
      session_id: contexto.sessaoId.toLowerCase(),
      operacao: 'api.reenvio_familiar',
    };
    const prova = resultadoAtestacaoSchema.parse(
      await cofre.atestador.atestarEntrada(metadados, entrada),
    );
    const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    const assinada = JSON.parse(prova.entradaCanonica) as Record<string, unknown>;
    if (
      Object.keys(assinada).length !== Object.keys(entrada).length ||
      Object.entries(entrada).some(([campo, valor]) => assinada[campo] !== valor) ||
      Object.entries(metadados).some(
        ([campo, valor]) => dados[campo as keyof typeof metadados] !== valor,
      )
    )
      throw new Error('Convite indisponível.');
    const resultado = await cliente.schema('api').rpc('reenvio_familiar_privado', {
      p_transporte: {
        entrada: { ...assinada, atestado: { ...dados, mac: prova.atestado.mac } },
        entrada_canonica: prova.entradaCanonica,
        dados_canonicos: prova.dadosCanonicos,
      },
    });
    if (resultado.error) throw new Error('Convite indisponível.');
    return resultado.data as unknown;
  }
  const reserva = reservaReenvioFamiliarSchema.parse(await executar('reservar'));
  if (
    reserva.convite_id !== contexto.conviteId.toLowerCase() ||
    reserva.tentativa_id !== tentativaId
  )
    throw new Error('Convite indisponível.');
  if (reserva.repeticao) return 'resultado_incerto';
  let envio: 'enviado' | 'resultado_incerto';
  try {
    const email = await cofre.cifra.decifrar(reserva.email_cifrado, {
      tabela: 'identidade.convite_familiar',
      registro_id: reserva.convite_id,
      campo: 'email',
      formato: 1,
    });
    envio = await enviarConviteFamiliarNativo(fonte, email, reserva.convite_id, signal);
  } catch {
    // O adapter lança apenas antes da chamada de rede; após chamá-la retorna
    // resultado incerto, mesmo em timeout ou cancelamento.
    try {
      const concluido = await executar('concluir', false);
      return typeof concluido === 'object' &&
        concluido !== null &&
        'ok' in concluido &&
        concluido.ok === true
        ? 'falha'
        : 'resultado_incerto';
    } catch {
      return 'resultado_incerto';
    }
  }
  if (envio !== 'enviado' || signal.aborted) return 'resultado_incerto';
  try {
    const concluido = await executar('concluir', true);
    if (
      typeof concluido !== 'object' ||
      concluido === null ||
      !('ok' in concluido) ||
      concluido.ok !== true
    )
      return 'resultado_incerto';
    return 'enviado';
  } catch {
    return 'resultado_incerto';
  }
}
