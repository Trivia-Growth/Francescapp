import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { concluirGoogleNativo } from './_shared/auth-nativo/callback.ts';
import { iniciarGoogleNativo } from './_shared/auth-nativo/google.ts';
import { consultarSessaoNativa } from './_shared/auth-nativo/sessao.ts';
import { encerrarSessaoNativa } from './_shared/auth-nativo/saida.ts';

// Netlify Functions v2: rotas explícitas, sem expor módulos experimentais.
export const config = {
  path: ['/api/auth/google', '/api/auth/callback', '/api/sessao', '/api/sessao/sair'],
};

export default async function auth(request: Request): Promise<Response> {
  // Bloqueio operacional até concluir as provas de autenticação e autorização.
  if (process.env.FFCM_AUTH_ATIVADO !== 'true') {
    return Response.json(criarErroPublicoSemCampos('servico_indisponivel', crypto.randomUUID()), {
      status: 503,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }
  switch (new URL(request.url).pathname) {
    case '/api/auth/google':
      return iniciarGoogleNativo(request, process.env);
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
