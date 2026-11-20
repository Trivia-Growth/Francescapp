import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaPapelDeclaradoNativa } from './_shared/entrada-papel-declarado-nativa.ts';

export const config = { path: '/api/admin/papel-declarado' };

let entrada: ReturnType<typeof criarEntradaPapelDeclaradoNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function papelDeclarado(request: Request): Promise<Response> {
  // Administrador para gravar; autorização real fica no banco. O papel declarado é
  // rótulo de registro e não participa de nenhuma decisão de acesso (FR-079).
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaPapelDeclaradoNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado, com a variável de ambiente como padrão quando o banco não
  // responde ou não tem a chave. Nasce desligado.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.papel_declarado.ativo',
      process.env.FFCM_PAPEL_DECLARADO_ATIVO === 'true',
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
