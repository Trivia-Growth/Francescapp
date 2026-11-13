import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { contratosBarreiraAcessoHttp } from '../../packages/contracts/src/barreira-acesso-servidor.ts';
import { comporBarreiraAcessoNativa } from './_shared/compor-barreira-acesso-nativa.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { servicoAtivo } from './_shared/configuracao-servidor.ts';

export const config = {
  path: [
    '/api/acessos/barreira',
    '/api/acessos/barreira/reservar',
    '/api/acessos/barreira/encerrar',
    '/api/acessos/barreira/reconhecer',
  ],
};
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;
export default async function barreiraAcesso(request: Request): Promise<Response> {
  const falha = (
    codigo: 'servico_indisponivel' | 'configuracao_indisponivel' | 'nao_encontrado',
    status: number,
  ) =>
    Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
      status,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  const rota = Object.entries(contratosBarreiraAcessoHttp).find(
    ([, contrato]) =>
      contrato.metodo === request.method && contrato.caminho === new URL(request.url).pathname,
  )?.[0] as keyof typeof contratosBarreiraAcessoHttp | undefined;
  if (!rota) return falha('nao_encontrado', 404);
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
  } catch {
    return falha('configuracao_indisponivel', 503);
  }
  // Dois interruptores administrados pela tela, com as variáveis de ambiente como padrão quando
  // o banco não responde. Não são autorização.
  const [acesso, barreira] = await Promise.all([
    servicoAtivo(
      dependencias.pool,
      'ffcm.acesso_paciente.ativo',
      process.env.FFCM_ACESSO_PACIENTE_ATIVADO === 'true',
    ),
    servicoAtivo(
      dependencias.pool,
      'ffcm.acesso_paciente.barreira_ativa',
      process.env.FFCM_BARREIRA_ACESSO_ATIVADA === 'true',
    ),
  ]);
  if (!acesso || !barreira) return falha('servico_indisponivel', 503);
  return comporBarreiraAcessoNativa(request, rota, dependencias);
}
