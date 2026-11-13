import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { listaConfigurada, servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaDocumentoCasoNativa } from './_shared/entrada-documento-caso-nativa.ts';

export const config = {
  path: ['/api/pacientes/:paciente_id/documentos', '/api/documentos/disponibilidade'],
};

let entrada: ReturnType<typeof criarEntradaDocumentoCasoNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

/** Interruptor fixo e desligado (FR-029 a FR-031). A integração com o Google Drive NÃO foi
 * comprovada ponta a ponta: nenhuma chamada real ao Google foi feita, e os testes usam porta
 * fictícia. Ligar esta rota exige a credencial no Vault, a pasta raiz configurada na tela e
 * uma prova conectada com dados fictícios. Ele vem ANTES da configuração de propósito:
 * enquanto estiver `false`, ligar a chave na tela não abre a rota. */
const DOCUMENTOS_ATIVOS = false;

export default async function documentos(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const disponibilidade = url.pathname === '/api/documentos/disponibilidade';
  if (disponibilidade && (request.method !== 'GET' || url.search || url.hash))
    return falha('servico_indisponivel');
  let ligado = false;
  // As categorias (FR-029) são metadado organizacional configurado pela equipe, sem dado
  // pessoal; vão junto da disponibilidade para a tela montar o formulário sem uma segunda
  // chamada. Nome, conteúdo e identificador do arquivo jamais passam por aqui.
  let categorias: readonly string[] = [];
  if (DOCUMENTOS_ATIVOS)
    try {
      dependencias ??= configurarDependenciasNativas(process.env);
      // Interruptor administrado pela tela (`ffcm.documentos.ativo`), com a variável de
      // ambiente como padrão quando o banco não responde ou não tem a chave.
      ligado = await servicoAtivo(
        dependencias.pool,
        'ffcm.documentos.ativo',
        process.env.FFCM_DOCUMENTOS_ATIVOS === 'true',
      );
      if (ligado && disponibilidade)
        categorias = await listaConfigurada(dependencias.pool, 'ffcm.documentos.categorias', []);
    } catch {
      return falha('configuracao_indisponivel');
    }
  if (disponibilidade)
    return Response.json(
      { dados: { disponivel: ligado, categorias }, request_id: crypto.randomUUID() },
      { headers: cabecalhos },
    );
  if (!ligado || !dependencias) return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaDocumentoCasoNativa(dependencias);
  } catch {
    return falha('configuracao_indisponivel');
  }
  return entrada.atender(request);
}

const cabecalhos = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function falha(codigo: 'servico_indisponivel' | 'configuracao_indisponivel'): Response {
  return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
    status: 503,
    headers: cabecalhos,
  });
}
