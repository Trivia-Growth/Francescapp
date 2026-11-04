import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { criarEntradaPacientesNativa } from './_shared/entrada-pacientes-nativa.ts';

export const config = {
  path: [
    '/api/pacientes',
    '/api/cadastro/barreira',
    '/api/cadastro/barreira/reservar',
    '/api/cadastro/barreira/encerrar',
    '/api/cadastro/barreira/reconhecer',
  ],
};

const entrada = criarEntradaPacientesNativa(process.env);

export default async function pacientes(request: Request): Promise<Response> {
  // A ativação depende de S-02 e das provas integradas de autorização e sessão.
  if (process.env.FFCM_PACIENTES_ATIVADO !== 'true') {
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
