import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { concluirGoogleNativo } from './_shared/auth-nativo/callback.ts';
import { iniciarGoogleNativo } from './_shared/auth-nativo/google.ts';
import { consultarSessaoNativa } from './_shared/auth-nativo/sessao.ts';
import { encerrarSessaoNativa } from './_shared/auth-nativo/saida.ts';
import { entrarTecnicaNativa } from './_shared/auth-nativo/tecnica.ts';

// Netlify Functions v2: rotas explícitas, sem expor módulos experimentais.
export const config = {
  path: [
    '/api/auth/google',
    '/api/auth/tecnica',
    '/api/auth/callback',
    '/api/sessao',
    '/api/sessao/sair',
  ],
};

export default async function auth(request: Request): Promise<Response> {
  // A saída continua disponível para sessões existentes mesmo com a entrada bloqueada.
  const caminho = new URL(request.url).pathname;
  if (
    (process.env.FFCM_AUTH_ATIVADO !== 'true' && caminho !== '/api/sessao/sair') ||
    (caminho === '/api/auth/tecnica' && process.env.FFCM_AUTH_TECNICA_ATIVADO !== 'true')
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
  switch (caminho) {
    case '/api/auth/google':
      return iniciarGoogleNativo(request, process.env);
    case '/api/auth/tecnica':
      return entrarTecnicaNativa(request, process.env);
    case '/api/auth/callback':
      return concluirGoogleNativo(request, process.env);
    case '/api/sessao':
      return consultarSessaoNativa(request, process.env);
    case '/api/sessao/sair':
      return encerrarSessaoNativa(request, process.env);
    default:
      return Response.json(criarErroPublicoSemCampos('nao_encontrado', crypto.randomUUID()), {
        status: 404,
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        },
      });
  }
}
