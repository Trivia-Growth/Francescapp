import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import {
  criarEntradaExecucaoTurno,
  headersExecucaoTurno,
} from './_shared/turno-execucao-entrada-nativa.ts';
export const config = {
  path: [
    '/api/pacientes/:paciente_id/execucao-turno',
    '/api/pacientes/:paciente_id/execucao-turno/*',
  ],
};
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;
export default async function turnoExecucao(request: Request): Promise<Response> {
  const falha = (codigo: 'configuracao_indisponivel' | 'servico_indisponivel') =>
    Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
      status: 503,
      headers: headersExecucaoTurno,
    });
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
  } catch {
    return falha('configuracao_indisponivel');
  }
  try {
    if (!(await servicoAtivo(dependencias.pool, 'ffcm.turno.ativo', false)))
      return falha('servico_indisponivel');
  } catch {
    return falha('servico_indisponivel');
  }
  return criarEntradaExecucaoTurno(dependencias).atender(request);
}
