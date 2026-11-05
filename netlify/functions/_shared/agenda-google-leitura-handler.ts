import { consultarAgendaGoogleIndividual } from '../../../supabase/functions/_shared/agenda-google-leitura.ts';
import {
  renovarAcessoAgenda,
  type ConfiguracaoOAuthAgenda,
} from '../../../supabase/functions/_shared/agenda-google-oauth.ts';

type Identidade = Readonly<{ usuarioId: string; sessaoId: string; subjectGoogle: string }>;

/** Nenhum título é revelado; a credencial e os tokens permanecem no servidor. */
export async function processarLeituraAgenda(
  request: Request,
  portas: {
    origem: string;
    oauth: ConfiguracaoOAuthAgenda;
    autorizar(request: Request): Promise<Identidade | null>;
    lerCredencial(): Promise<Readonly<{ refresh: string; geracao: string }> | null>;
  },
): Promise<Response> {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (status: number) =>
    Response.json(
      {
        erro:
          status === 401
            ? 'nao_autenticado'
            : status === 422
              ? 'entrada_invalida'
              : 'servico_indisponivel',
      },
      { status, headers },
    );
  try {
    const url = new URL(request.url);
    if (
      request.method !== 'GET' ||
      url.origin !== portas.origem ||
      url.pathname !== '/api/agenda/google/compromissos' ||
      url.hash ||
      [...url.searchParams.keys()].some((chave) => chave !== 'inicio' && chave !== 'fim') ||
      url.searchParams.getAll('inicio').length !== 1 ||
      url.searchParams.getAll('fim').length !== 1
    )
      return erro(422);
    const inicio = url.searchParams.get('inicio');
    const fim = url.searchParams.get('fim');
    const instante = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
    if (
      !inicio ||
      !fim ||
      !instante.test(inicio) ||
      !instante.test(fim) ||
      !Number.isFinite(Date.parse(inicio)) ||
      !Number.isFinite(Date.parse(fim)) ||
      Date.parse(inicio) >= Date.parse(fim)
    )
      return erro(422);
    const identidade = await portas.autorizar(request);
    if (!identidade) return erro(401);
    const credencial = await portas.lerCredencial();
    if (!credencial) return erro(503);
    const token = await renovarAcessoAgenda(portas.oauth, credencial.refresh);
    const resultado = await consultarAgendaGoogleIndividual({
      habilitada: true,
      token,
      inicio,
      fim,
    });
    if (resultado.estado !== 'disponivel') return erro(503);
    const atual = await portas.autorizar(request);
    if (
      !atual ||
      atual.usuarioId !== identidade.usuarioId ||
      atual.sessaoId !== identidade.sessaoId ||
      atual.subjectGoogle !== identidade.subjectGoogle
    )
      return erro(401);
    // A segunda leitura transacional detecta credencial removida ou substituída durante a consulta.
    const atualCredencial = await portas.lerCredencial();
    if (
      !atualCredencial ||
      atualCredencial.geracao !== credencial.geracao ||
      atualCredencial.refresh !== credencial.refresh
    )
      return erro(503);
    return Response.json({ dados: resultado.compromissos }, { headers });
  } catch {
    return erro(503);
  }
}
