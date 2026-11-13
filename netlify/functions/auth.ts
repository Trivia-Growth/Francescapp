import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { ativarConviteFamiliarNativo } from './_shared/auth-nativo/ativar-convite-familiar.ts';
import { concluirGoogleNativo } from './_shared/auth-nativo/callback.ts';
import { entrarFamiliarNativa } from './_shared/auth-nativo/familiar.ts';
import { iniciarGoogleNativo } from './_shared/auth-nativo/google.ts';
import { encerrarSessaoFamiliarPrivada } from './_shared/auth-nativo/saida-familiar.ts';
import { consultarSessaoNativa } from './_shared/auth-nativo/sessao.ts';
import { consultarSessaoFamiliarPrivada } from './_shared/auth-nativo/sessao-familiar.ts';
import { encerrarSessaoNativa } from './_shared/auth-nativo/saida.ts';
import { entrarTecnicaNativa } from './_shared/auth-nativo/tecnica.ts';

// Netlify Functions v2: rotas explícitas, sem expor módulos experimentais.
export const config = {
  path: [
    '/api/auth/google',
    '/api/auth/tecnica',
    '/api/auth/familiar',
    '/api/auth/familiar/ativar',
    '/api/auth/callback',
    '/api/sessao',
    '/api/sessao/sair',
    '/api/familiar/sessao',
    '/api/familiar/sessao/sair',
  ],
};

// FORA da configuração em banco, de propósito (13/11/2026). Os interruptores desta rota
// continuam vindo só da variável de ambiente: ler a configuração do banco para decidir se a
// autenticação funciona cria um impasse sem saída — um valor errado tranca todo mundo para
// fora, e corrigi-lo na tela exige exatamente a sessão que deixou de ser possível. Não
// "corrija" isto migrando para `servicoAtivo`.
export default async function auth(request: Request): Promise<Response> {
  // A saída continua disponível para sessões existentes mesmo com a entrada bloqueada.
  const caminho = new URL(request.url).pathname;
  // Remover o bloqueio somente após implementar e provar o contrato SQL e o callback.
  const ativacaoFamiliarComprovada = false;
  if (
    (process.env.FFCM_AUTH_ATIVADO !== 'true' &&
      caminho !== '/api/sessao/sair' &&
      caminho !== '/api/familiar/sessao/sair') ||
    ((caminho === '/api/familiar/sessao' || caminho === '/api/auth/familiar') &&
      process.env.FFCM_AUTH_FAMILIAR_ATIVADO !== 'true') ||
    (caminho === '/api/auth/familiar/ativar' &&
      (!ativacaoFamiliarComprovada || process.env.FFCM_CONVITE_FAMILIAR_ATIVO !== 'true')) ||
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
    case '/api/auth/familiar':
      return entrarFamiliarNativa(request, process.env);
    case '/api/auth/familiar/ativar':
      return ativarConviteFamiliarNativo(request, process.env);
    case '/api/auth/callback':
      return concluirGoogleNativo(request, process.env);
    case '/api/sessao':
      return consultarSessaoNativa(request, process.env);
    case '/api/sessao/sair':
      return encerrarSessaoNativa(request, process.env);
    case '/api/familiar/sessao':
      return consultarSessaoFamiliarPrivada(request, process.env);
    case '/api/familiar/sessao/sair':
      return encerrarSessaoFamiliarPrivada(request, process.env);
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
