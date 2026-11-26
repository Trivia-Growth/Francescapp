import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaLinhaTempoNativa } from './_shared/entrada-linha-tempo-nativa.ts';

export const config = { path: ['/api/pacientes/:paciente_id/linha-tempo'] };

let entrada: ReturnType<typeof criarEntradaLinhaTempoNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

/** Interruptor fixo, agora LIGADO (FR-007), em 13/11/2026. A linha do tempo agrega metadado de
 * todas as fatias e a audiência é decidida no banco. O que foi exercitado antes de ligar está
 * em `openspec/changes/.../tasks.md`: a cadeia SQL em PostgreSQL descartável, com positivos e
 * negativos de audiência — rascunho alheio invisível, família vendo só o que é dela, revogação
 * fechando na hora. O que NÃO foi exercitado: a tela autenticada em produção, porque a entrada
 * depende do Google e não é executada por agente. A partir daqui o interruptor real é
 * `ffcm.linha_tempo.ativa`, na tela de administração. */
const LINHA_TEMPO_ATIVA = true;

export default async function linhaTempo(request: Request): Promise<Response> {
  if (!LINHA_TEMPO_ATIVA) return falha('servico_indisponivel');
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaLinhaTempoNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.linha_tempo.ativa',
      process.env.FFCM_LINHA_TEMPO_ATIVA === 'true',
    ))
  )
    return falha('servico_indisponivel');
  return entrada.atender(request);
}

function falha(codigo: 'servico_indisponivel' | 'configuracao_indisponivel'): Response {
  return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
