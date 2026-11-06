import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { contratosBarreiraContatoHttp } from '../../packages/contracts/src/barreira-contato-servidor.ts';
import { comporBarreiraContatoNativa } from './_shared/compor-barreira-contato-nativa.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';

export const config = {
  path: [
    '/api/contatos/barreira',
    '/api/contatos/barreira/reservar',
    '/api/contatos/barreira/encerrar',
    '/api/contatos/barreira/reconhecer',
  ],
};
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;
export default async function barreiraContato(request: Request): Promise<Response> {
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
  if (process.env.FFCM_CONTATO_ATIVADO !== 'true') return falha('servico_indisponivel', 503);
  const rota = Object.entries(contratosBarreiraContatoHttp).find(
    ([, contrato]) =>
      contrato.metodo === request.method && contrato.caminho === new URL(request.url).pathname,
  )?.[0] as keyof typeof contratosBarreiraContatoHttp | undefined;
  if (!rota) return falha('nao_encontrado', 404);
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
  } catch {
    return falha('configuracao_indisponivel', 503);
  }
  return comporBarreiraContatoNativa(request, rota, dependencias);
}
