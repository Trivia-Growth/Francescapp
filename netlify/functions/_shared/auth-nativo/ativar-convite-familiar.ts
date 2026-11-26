import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import {
  ativarConviteFamiliarSchema,
  recusaAtivacaoFamiliarSchema,
  resultadoAtivacaoFamiliarSchema,
} from '../../../../packages/contracts/src/identidade.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../../packages/contracts/src/rpc.ts';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import { carregarCofreNativo } from '../cofre-nativo.ts';
import { metadadosAtestadoNativo } from '../compor-pacientes-nativo.ts';
import { configurarDependenciasNativas } from '../configurar-dependencias-nativas.ts';
import { verificarConviteFamiliarNativo } from './verificar-convite-familiar.ts';

let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

/** Rota ainda fechada: RPC de ativação, callback e autorização precisam de prova integrada. */
export async function ativarConviteFamiliarNativo(request: Request, fonte: FonteDeConfiguracao) {
  const requestId = crypto.randomUUID();
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (
    codigo: 'entrada_invalida' | 'sem_permissao' | 'servico_indisponivel',
    status: number,
  ) => Response.json(criarErroPublicoSemCampos(codigo, requestId), { status, headers });
  const url = new URL(request.url);
  if (
    request.method !== 'POST' ||
    url.pathname !== '/api/auth/familiar/ativar' ||
    url.search ||
    url.hash ||
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    return erro('entrada_invalida', 422);
  if (request.headers.get('origin') !== url.origin) return erro('sem_permissao', 403);
  const leitor = request.body?.getReader();
  if (!leitor) return erro('entrada_invalida', 422);
  let entrada: unknown;
  try {
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    while (true) {
      const parte = await leitor.read();
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > 8192) throw new Error();
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.length;
    }
    entrada = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    void leitor.cancel().catch(() => undefined);
    return erro('entrada_invalida', 422);
  } finally {
    leitor.releaseLock();
  }
  const dados = ativarConviteFamiliarSchema.safeParse(entrada);
  if (!dados.success) return erro('entrada_invalida', 422);
  try {
    const { contexto, usuarioId, sessaoId, email } = await verificarConviteFamiliarNativo(
      request,
      fonte,
      dados.data.token_hash,
      dados.data.tipo,
    );
    // O token é de uso único; falhas posteriores exigem reconciliação, não replay automático.
    dependencias ??= configurarDependenciasNativas(fonte);
    const cofre = await carregarCofreNativo(
      dependencias.pool,
      dependencias.referencias,
      dependencias.keyIdAtestado,
      request.signal,
    );
    const entradaAtestada = {
      request_id: requestId,
      convite_id: dados.data.convite_id.toLowerCase(),
      tipo: dados.data.tipo,
      email_hmac: await cofre.cifra.calcularHmac(`email-concessao:${email}`),
    };
    const metadados = {
      ...metadadosAtestadoNativo(dependencias.keyIdAtestado, requestId, Date.now()),
      usuario_id: usuarioId.toLowerCase(),
      session_id: sessaoId.toLowerCase(),
      operacao: 'api.ativar_convite_familiar',
    };
    const prova = resultadoAtestacaoSchema.parse(
      await cofre.atestador.atestarEntrada(metadados, entradaAtestada),
    );
    const dadosAtestado = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
    const entradaCanonica = JSON.parse(prova.entradaCanonica) as Record<string, unknown>;
    if (
      Object.entries(entradaAtestada).some(([campo, valor]) => entradaCanonica[campo] !== valor) ||
      Object.keys(entradaCanonica).length !== Object.keys(entradaAtestada).length ||
      Object.entries(metadados).some(
        ([campo, valor]) => dadosAtestado[campo as keyof typeof metadados] !== valor,
      )
    )
      throw new Error();
    const transporte = {
      p_transporte: {
        entrada: { ...entradaCanonica, atestado: { ...dadosAtestado, mac: prova.atestado.mac } },
        entrada_canonica: prova.entradaCanonica,
        dados_canonicos: prova.dadosCanonicos,
      },
    };
    let resultado = await contexto.cliente
      .schema('api')
      .rpc('ativar_convite_familiar_privado', transporte);
    // O commit pode ter ocorrido antes de uma falha de transporte. A mesma prova
    // só confirma o mesmo usuário e revalida o vínculo; não recria concessão.
    if (resultado.error && !request.signal.aborted && Date.now() < Date.parse(metadados.expira_em))
      resultado = await contexto.cliente
        .schema('api')
        .rpc('ativar_convite_familiar_privado', transporte);
    // Recusa é resposta normal, não indisponibilidade: link inválido, expirado, já
    // usado ou sem pré-autorização vigente da equipe. A tela orienta pedir novo link
    // (FR-054) sem revelar qual dos casos ocorreu.
    if (!resultado.error && recusaAtivacaoFamiliarSchema.safeParse(resultado.data).success)
      return erro('sem_permissao', 403);
    const ativacao = resultadoAtivacaoFamiliarSchema.safeParse(resultado.data);
    if (resultado.error || !ativacao.success || ativacao.data.usuario_id !== usuarioId)
      return erro('servico_indisponivel', 503);
    // Só a conta e o vínculo já aprovados no banco podem receber senha.
    const senha = await contexto.cliente.auth.updateUser({ password: dados.data.senha });
    if (senha.error || senha.data.user?.id !== usuarioId) return erro('servico_indisponivel', 503);
    // A sessão OTP não é admitida nem enviada ao navegador. A entrada normal
    // por senha cria sessão separada e revalida perfil e acesso vigentes.
    return Response.json({ dados: { senha_definida: true }, request_id: requestId }, { headers });
  } catch {
    return erro('servico_indisponivel', 503);
  }
}
