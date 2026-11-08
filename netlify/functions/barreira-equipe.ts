import { contratosBarreiraEquipeHttp } from '../../packages/contracts/src/barreira-equipe-servidor.ts';
import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { comporBarreiraEquipeNativa } from './_shared/compor-equipe-barreira-nativa.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';

export const config = {
  path: [
    '/api/equipe/barreira',
    '/api/equipe/barreira/reservar',
    '/api/equipe/barreira/encerrar',
    '/api/equipe/barreira/reconhecer',
  ],
};
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function barreiraEquipe(request: Request): Promise<Response> {
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
  if (process.env.FFCM_BARREIRA_EQUIPE_ATIVADA !== 'true')
    return falha('servico_indisponivel', 503);
  const rota = Object.entries(contratosBarreiraEquipeHttp).find(
    ([, contrato]) =>
      contrato.metodo === request.method && contrato.caminho === new URL(request.url).pathname,
  )?.[0] as keyof typeof contratosBarreiraEquipeHttp | undefined;
  if (!rota) return falha('nao_encontrado', 404);
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
  } catch {
    return falha('configuracao_indisponivel', 503);
  }
  return comporBarreiraEquipeNativa(request, rota, dependencias);
}
