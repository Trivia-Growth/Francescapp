import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { listaConfigurada, servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaDiarioNativa } from './_shared/entrada-diario-nativa.ts';

export const config = {
  path: ['/api/pacientes/:paciente_id/diario', '/api/diario/disponibilidade'],
};

let entrada: ReturnType<typeof criarEntradaDiarioNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function diario(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaDiarioNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  // Interruptor administrado pela tela (`ffcm.diario.ativo`), com a variável de ambiente como
  // padrão. Não é autorização: a rota segue validando sessão, audiência e atestado no banco.
  const disponivel = await servicoAtivo(
    dependencias.pool,
    'ffcm.diario.ativo',
    process.env.FFCM_DIARIO_ATIVADO === 'true',
  );
  if (url.pathname === '/api/diario/disponibilidade') {
    if (request.method !== 'GET' || url.search || url.hash) return falha('servico_indisponivel');
    // As áreas da síntese (FR-009) são metadado organizacional configurado pela equipe, sem
    // dado pessoal; vão junto da disponibilidade para a tela montar o modelo sem uma segunda
    // chamada. Conteúdo do diário jamais passa por aqui.
    const areas = disponivel
      ? await listaConfigurada(dependencias.pool, 'ffcm.diario.areas_sintese', [])
      : [];
    return Response.json(
      { dados: { disponivel, areas }, request_id: crypto.randomUUID() },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        },
      },
    );
  }
  if (!disponivel) return falha('servico_indisponivel');
  return entrada.atender(request);
}

function falha(codigo: 'servico_indisponivel' | 'configuracao_indisponivel'): Response {
  return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
