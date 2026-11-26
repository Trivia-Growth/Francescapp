import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaCampoExtraPlanoNativa } from './_shared/entrada-campo-extra-plano-nativa.ts';

export const config = { path: '/api/admin/campo-extra-plano' };

let entrada: ReturnType<typeof criarEntradaCampoExtraPlanoNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function campoExtraPlano(request: Request): Promise<Response> {
  // Administrador-only; autorização real fica no banco.
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaCampoExtraPlanoNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.campo_extra_plano.ativo`), com a variável de
  // ambiente como padrão quando o banco não responde ou não tem a chave.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.campo_extra_plano.ativo',
      process.env.FFCM_CAMPO_EXTRA_PLANO_ATIVO === 'true',
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
