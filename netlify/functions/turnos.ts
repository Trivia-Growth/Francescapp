import { contratosBarreiraTurnoHttp } from '../../packages/contracts/src/turno-barreira-servidor.ts';
import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { comporBarreiraTurnoNativa } from './_shared/turno-compor-barreira-nativa.ts';
import { criarEntradaTurnoNativa } from './_shared/turno-entrada-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id/turnos/abrir',
    '/api/pacientes/:paciente_id/turnos/encerrar',
    '/api/pacientes/:paciente_id/turnos/:turno_id',
    '/api/turnos/barreira',
    '/api/turnos/barreira/reservar',
    '/api/turnos/barreira/encerrar',
    '/api/turnos/barreira/reconhecer',
  ],
};
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

/** Preparado localmente. Interruptor fechado por padrão; ativação exige gates reais da fatia. */
export default async function turnos(request: Request): Promise<Response> {
  const falha = (codigo: 'servico_indisponivel' | 'configuracao_indisponivel') =>
    Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
      status: 503,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
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
  const rota = Object.entries(contratosBarreiraTurnoHttp).find(
    ([, contrato]) =>
      contrato.metodo === request.method && contrato.caminho === new URL(request.url).pathname,
  )?.[0] as keyof typeof contratosBarreiraTurnoHttp | undefined;
  if (rota) return comporBarreiraTurnoNativa(request, rota, dependencias);
  return criarEntradaTurnoNativa(dependencias).atender(request);
}
