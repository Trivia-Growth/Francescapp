import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { listaConfigurada, servicoAtivo } from './_shared/configuracao-servidor.ts';
import { criarEntradaAnamneseNativa } from './_shared/entrada-anamnese-nativa.ts';

export const config = {
  path: [
    '/api/pacientes/:paciente_id/anamnese',
    '/api/pacientes/:paciente_id/anamnese/historico',
    '/api/anamnese/historico/disponibilidade',
  ],
};

let entrada: ReturnType<typeof criarEntradaAnamneseNativa> | undefined;
let dependencias: ReturnType<typeof configurarDependenciasNativas> | undefined;

export default async function anamnese(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const disponibilidade = url.pathname === '/api/anamnese/historico/disponibilidade';
  if (disponibilidade && (request.method !== 'GET' || url.search || url.hash))
    return falha('servico_indisponivel');
  try {
    dependencias ??= configurarDependenciasNativas(process.env);
    entrada ??= criarEntradaAnamneseNativa(dependencias);
  } catch {
    // Sem conseguir montar o acesso ao banco não há configuração a ler, e aí vale a regra de
    // sempre: o ambiente é o padrão de última instância. Responder "não disponível" aqui
    // esconderia a aba de quem tem o serviço ligado por ambiente.
    if (disponibilidade)
      return respostaDisponibilidade(
        process.env.FFCM_ANAMNESE_ATIVADA === 'true' &&
          process.env.FFCM_HISTORICO_ANAMNESE_ATIVADO === 'true',
        [],
      );
    return falha('configuracao_indisponivel');
  }
  // Dois interruptores administrados pela tela, com as variáveis de ambiente como padrão quando
  // o banco não responde. Não são autorização: a rota segue validando sessão, concessão e
  // atestado no banco. O histórico depende da anamnese estar ligada, como já dependia.
  const [ativa, historico] = await Promise.all([
    servicoAtivo(
      dependencias.pool,
      'ffcm.anamnese.ativa',
      process.env.FFCM_ANAMNESE_ATIVADA === 'true',
    ),
    servicoAtivo(
      dependencias.pool,
      'ffcm.anamnese.historico_ativo',
      process.env.FFCM_HISTORICO_ANAMNESE_ATIVADO === 'true',
    ),
  ]);
  if (disponibilidade) {
    // O roteiro sugerido (FR-003) é metadado organizacional configurado pela equipe, sem dado
    // pessoal; vai junto da disponibilidade para a tela montar as sugestões sem uma segunda
    // chamada, como as áreas do diário já fazem. Resposta da anamnese jamais passa por aqui.
    const roteiro = ativa
      ? await listaConfigurada(dependencias.pool, 'ffcm.anamnese.roteiro', [])
      : [];
    return respostaDisponibilidade(ativa && historico, roteiro);
  }
  if (!ativa) return falha('servico_indisponivel');
  if (url.pathname.endsWith('/historico') && !historico) return falha('servico_indisponivel');
  return entrada.atender(request);
}

function respostaDisponibilidade(disponivel: boolean, roteiro: readonly string[]): Response {
  return Response.json(
    { dados: { disponivel, roteiro }, request_id: crypto.randomUUID() },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
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
