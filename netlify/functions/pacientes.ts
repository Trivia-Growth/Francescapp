import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
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

export default async function pacientes(request: Request): Promise<Response> {
  // A ativação depende de S-02 e das provas integradas de autorização e sessão.
  const caminho = new URL(request.url).pathname;
  const familiar = caminho === '/api/familiar/pacientes';
  const pacienteFamiliar = /^\/api\/familiar\/pacientes\/[^/]+$/.test(caminho);
  if (
    pacienteFamiliar
      ? process.env.FFCM_CONSULTA_PACIENTE_FAMILIAR !== 'true'
      : familiar
        ? process.env.FFCM_FAMILIAR_PACIENTES_ATIVO !== 'true'
        : process.env.FFCM_PACIENTES_ATIVADO !== 'true'
  ) {
    return Response.json(criarErroPublicoSemCampos('servico_indisponivel', crypto.randomUUID()), {
      status: 503,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }
  return entrada.atender(request);
}
