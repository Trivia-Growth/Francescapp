import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaContatoNativo } from './_shared/entrada-contato-nativo.ts';

export const config = {
  path: '/api/pacientes/:paciente_id/contatos',
};
let entrada: ReturnType<typeof criarEntradaContatoNativo> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;
export default async function contato(request: Request): Promise<Response> {
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaContatoNativo(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.contato.ativo`), com a variável de ambiente como
  // padrão: se o banco não responde ou não tem a chave, vale o que o ambiente já dizia. Não é
  // autorização — a rota segue validando sessão, concessão e atestado no banco.
  if (
    !(await servicoAtivo(
      dependencias.pool,
      'ffcm.contato.ativo',
      process.env.FFCM_CONTATO_ATIVADO === 'true',
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
