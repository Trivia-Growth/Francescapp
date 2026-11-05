import { criarConviteFamiliarSchema } from '../../../packages/contracts/src/identidade.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/rpc.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { criarContextoAuthNativo } from './auth-nativo/cliente.ts';
import type { carregarCofreNativo } from './cofre-nativo.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import { reenviarFamiliarNativo } from './reenvio-familiar-nativo.ts';

type Cliente = ReturnType<typeof criarContextoAuthNativo>['cliente'];
type Cofre = Awaited<ReturnType<typeof carregarCofreNativo>>;

/** Preparação privada: o banco autoriza e audita; não chamar antes da revisão integrada. */
export async function registrarConviteFamiliarNativo(
  cliente: Cliente,
  cofre: Cofre,
  fonte: FonteDeConfiguracao,
  contexto: { usuarioId: string; sessaoId: string; keyId: string },
  corpo: unknown,
  signal: AbortSignal,
) {
  const integracaoComprovada = false;
  if (!integracaoComprovada || fonte.FFCM_CONVITE_FAMILIAR_ATIVO !== 'true' || signal.aborted)
    throw new Error('Convite indisponível.');
  const dados = criarConviteFamiliarSchema.parse(corpo);
  const conviteId = dados.convite_id.toLowerCase();
  const requestId = crypto.randomUUID();
  const email = dados.email.toLowerCase();
  const aad = {
    tabela: 'identidade.convite_familiar' as const,
    registro_id: conviteId,
    formato: 1 as const,
  };
  const entrada = {
    convite_id: conviteId,
    request_id: requestId,
    paciente_id: dados.paciente_id.toLowerCase(),
    email_hmac: await cofre.cifra.calcularHmac(`email-concessao:${email}`),
    digest_entrada: await cofre.cifra.calcularHmac(
      `convite-familiar:${JSON.stringify([dados.paciente_id.toLowerCase(), email, dados.motivo])}`,
    ),
    email_cifrado: await cofre.cifra.cifrar(email, { ...aad, campo: 'email' }),
    motivo_cifrado: await cofre.cifra.cifrar(dados.motivo, { ...aad, campo: 'motivo' }),
  };
  const metadados = {
    ...metadadosAtestadoNativo(contexto.keyId, requestId, Date.now()),
    usuario_id: contexto.usuarioId.toLowerCase(),
    session_id: contexto.sessaoId.toLowerCase(),
    operacao: 'api.registrar_convite_familiar',
  };
  const prova = resultadoAtestacaoSchema.parse(
    await cofre.atestador.atestarEntrada(metadados, entrada),
  );
  const atestado = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
  const assinada = JSON.parse(prova.entradaCanonica) as Record<string, unknown>;
  if (
    Object.keys(assinada).length !== Object.keys(entrada).length ||
    ['convite_id', 'request_id', 'paciente_id', 'email_hmac', 'digest_entrada'].some(
      (campo) =>
        assinada[campo] !==
        entrada[
          campo as 'convite_id' | 'request_id' | 'paciente_id' | 'email_hmac' | 'digest_entrada'
        ],
    ) ||
    (['email_cifrado', 'motivo_cifrado'] as const).some((campo) => {
      const assinado = assinada[campo];
      return (
        typeof assinado !== 'object' ||
        assinado === null ||
        Object.keys(assinado).length !== Object.keys(entrada[campo]).length ||
        Object.entries(entrada[campo]).some(
          ([chave, valor]) => (assinado as Record<string, unknown>)[chave] !== valor,
        )
      );
    }) ||
    Object.entries(metadados).some(
      ([campo, valor]) => atestado[campo as keyof typeof metadados] !== valor,
    )
  )
    throw new Error('Convite indisponível.');
  const resultado = await cliente.schema('api').rpc('registrar_convite_familiar_privado', {
    p_transporte: {
      entrada: { ...assinada, atestado: { ...atestado, mac: prova.atestado.mac } },
      entrada_canonica: prova.entradaCanonica,
      dados_canonicos: prova.dadosCanonicos,
    },
  });
  if (
    resultado.error ||
    resultado.data?.ok !== true ||
    resultado.data?.convite_id !== conviteId ||
    typeof resultado.data?.repeticao !== 'boolean'
  )
    throw new Error('Convite indisponível.');
  // A autorização de acesso é uma decisão explícita, distinta do convite.
  const acessoId = dados.acesso_id.toLowerCase();
  const requestAutorizacao = crypto.randomUUID();
  const autorizacao = {
    convite_id: conviteId,
    acesso_id: acessoId,
    request_id: requestAutorizacao,
    digest_autorizacao: await cofre.cifra.calcularHmac(
      `autorizacao-familiar:${JSON.stringify([conviteId, acessoId, dados.motivo])}`,
    ),
    motivo_cifrado: await cofre.cifra.cifrar(dados.motivo, {
      tabela: 'cadastro.acesso_paciente',
      registro_id: acessoId,
      campo: 'motivo_concessao',
      formato: 1,
    }),
  };
  const metaAutorizacao = {
    ...metadadosAtestadoNativo(contexto.keyId, requestAutorizacao, Date.now()),
    usuario_id: contexto.usuarioId.toLowerCase(),
    session_id: contexto.sessaoId.toLowerCase(),
    operacao: 'api.preautorizar_acesso_familiar',
  };
  const provaAutorizacao = resultadoAtestacaoSchema.parse(
    await cofre.atestador.atestarEntrada(metaAutorizacao, autorizacao),
  );
  const dadosAutorizacao = dadosAtestadoSchema.parse(JSON.parse(provaAutorizacao.dadosCanonicos));
  const assinadaAutorizacao = JSON.parse(provaAutorizacao.entradaCanonica) as Record<
    string,
    unknown
  >;
  const motivoAssinado = assinadaAutorizacao.motivo_cifrado;
  if (
    Object.keys(assinadaAutorizacao).length !== Object.keys(autorizacao).length ||
    (['convite_id', 'acesso_id', 'request_id', 'digest_autorizacao'] as const).some(
      (campo) => assinadaAutorizacao[campo] !== autorizacao[campo],
    ) ||
    typeof motivoAssinado !== 'object' ||
    motivoAssinado === null ||
    Object.keys(motivoAssinado).length !== Object.keys(autorizacao.motivo_cifrado).length ||
    Object.entries(autorizacao.motivo_cifrado).some(
      ([campo, valor]) => (motivoAssinado as Record<string, unknown>)[campo] !== valor,
    ) ||
    Object.entries(metaAutorizacao).some(
      ([campo, valor]) => dadosAutorizacao[campo as keyof typeof metaAutorizacao] !== valor,
    )
  )
    throw new Error('Convite indisponível.');
  const aprovada = await cliente.schema('api').rpc('preautorizar_acesso_familiar_privado', {
    p_transporte: {
      entrada: {
        ...assinadaAutorizacao,
        atestado: { ...dadosAutorizacao, mac: provaAutorizacao.atestado.mac },
      },
      entrada_canonica: provaAutorizacao.entradaCanonica,
      dados_canonicos: provaAutorizacao.dadosCanonicos,
    },
  });
  if (aprovada.error || aprovada.data?.ok !== true || aprovada.data?.convite_id !== conviteId)
    throw new Error('Convite indisponível.');
  // Registro repetido pode ter enviado antes da resposta perdida; jamais reenviar automaticamente.
  if (resultado.data.repeticao)
    return { convite_id: conviteId, envio: 'resultado_incerto' as const };
  const envio = await reenviarFamiliarNativo(
    cliente,
    cofre,
    fonte,
    { ...contexto, conviteId, tentativaId: dados.tentativa_id },
    signal,
  );
  return { convite_id: conviteId, envio };
}
