import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaPacientesNativa } from './_shared/entrada-pacientes-nativa.ts';

export const config = {
  path: [
    '/api/pacientes',
    '/api/familiar/pacientes',
    '/api/familiar/pacientes/*',
    '/api/cadastro/barreira',
    '/api/cadastro/barreira/reservar',
    '/api/cadastro/barreira/encerrar',
    '/api/cadastro/barreira/reconhecer',
  ],
};

const entrada = criarEntradaPacientesNativa(process.env);
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function pacientes(request: Request): Promise<Response> {
  const caminho = new URL(request.url).pathname;
  const familiar = caminho === '/api/familiar/pacientes';
  const pacienteFamiliar = /^\/api\/familiar\/pacientes\/[^/]+$/.test(caminho);
  // Os dois caminhos da família continuam governados pela variável de ambiente, e não pela
  // tela: fazem parte de uma jornada cuja entrada (`auth.ts`) também ficou de fora, pelo mesmo
  // motivo. Dar à administração um interruptor que não liga nada seria pior que não ter.
  if (
    pacienteFamiliar
      ? process.env.FFCM_CONSULTA_PACIENTE_FAMILIAR !== 'true'
      : familiar && process.env.FFCM_FAMILIAR_PACIENTES_ATIVO !== 'true'
  )
    return indisponivel();
  if (!familiar && !pacienteFamiliar) {
    try {
      dependencias ??= configurarDependenciasNativas(process.env);
    } catch {
      return indisponivel();
    }
    // Interruptor administrado pela tela (`ffcm.pacientes.ativo`), com a variável de ambiente
    // como padrão quando o banco não responde. Não é autorização: quem vê quem continua sendo
    // decidido por concessão e RLS.
    if (
      !(await servicoAtivo(
        dependencias.pool,
        'ffcm.pacientes.ativo',
        process.env.FFCM_PACIENTES_ATIVADO === 'true',
      ))
    )
      return indisponivel();
  }
  return entrada.atender(request);
}

function indisponivel(): Response {
  return Response.json(criarErroPublicoSemCampos('servico_indisponivel', crypto.randomUUID()), {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
