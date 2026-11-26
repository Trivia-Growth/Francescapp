import { criarErroPublicoSemCampos, statusErroHttp } from '../../packages/contracts/src/erros.ts';
import {
  cabecalhosAcessoPaciente,
  criarEntradaAcessoPacienteNativa,
} from './_shared/entrada-acesso-paciente-nativa.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id/acessos',
    '/api/pacientes/:paciente_id/acessos/:acesso_id/revogar',
  ],
};

let entrada: ReturnType<typeof criarEntradaAcessoPacienteNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function acessoPaciente(request: Request): Promise<Response> {
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaAcessoPacienteNativa(dependencias);
  } catch {
    return Response.json(
      criarErroPublicoSemCampos('configuracao_indisponivel', crypto.randomUUID()),
      {
        status: statusErroHttp.configuracao_indisponivel,
        headers: cabecalhosAcessoPaciente,
      },
    );
  }
  // O ambiente é o padrão de última instância dos dois interruptores; a decisão de
  // disponibilidade continua sendo do banco, e a autorização segue sendo do banco.
  return entrada.atender(request, {
    acessoAtivo: process.env.FFCM_ACESSO_PACIENTE_ATIVADO === 'true',
    barreiraAtiva: process.env.FFCM_BARREIRA_ACESSO_ATIVADA === 'true',
  });
}
