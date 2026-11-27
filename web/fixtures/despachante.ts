/** Despachante central das fixtures: dado o caminho de `/api/**`, devolve o corpo que
 * aquela rota responderia. Quem conferir a interface em navegador intercepta `**\/api\/**`
 * e chama `responder(url)`; o que não estiver mapeado volta `undefined`, e aí o chamador
 * decide entre página vazia e erro — em vez de a lista vazia virar o padrão silencioso que
 * escondeu dez telas inteiras. */
import { envelope } from './comum.ts';
import {
  avisos,
  concessoesEquipe,
  pacientes,
  sessaoAdministrador,
  vinculosProfissionais,
} from './sessao.ts';
import {
  aprovadoresPlano,
  camposExtrasPlano,
  configuracaoSistema,
  estadosEmocionais,
  expurgoAudio,
  modeloFichaPlantao,
  papeisDeclarados,
  regrasAtendimento,
  segredosIntegracoes,
} from './administracao.ts';
import {
  audienciaFinanceira,
  auditoria,
  concessoesFinanceiras,
  habilitacaoPlanoCrise,
  solicitacoesTitular,
} from './governanca.ts';

/** Corpo de cada rota, sem envelope. `undefined` quando a rota não é coberta. */
export function dados(caminho: string, busca: URLSearchParams): unknown {
  switch (caminho) {
    case '/api/sessao':
      return sessaoAdministrador;
    case '/api/pacientes':
      return pacientes;
    case '/api/avisos':
      return avisos;
    case '/api/admin/concessoes-equipe':
      return concessoesEquipe;
    case '/api/admin/configuracao-sistema':
      return configuracaoSistema;
    case '/api/regras-atendimento':
      return regrasAtendimento;
    case '/api/admin/segredos-integracoes':
      return busca.get('operacao') === 'expurgo' ? expurgoAudio : segredosIntegracoes;
    // Mesma rota, dois catálogos: sem `escopo` é o formato antigo do Plano de cuidado;
    // com `escopo` é o catálogo generalizado de FR-078.
    case '/api/admin/campo-extra-plano':
      return busca.get('escopo') === 'ficha_plantao' ? modeloFichaPlantao : camposExtrasPlano;
    case '/api/admin/aprovador-plano':
      return aprovadoresPlano;
    case '/api/admin/papel-declarado':
      return papeisDeclarados;
    case '/api/admin/estado-emocional':
      return estadosEmocionais;
    case '/api/admin/auditoria':
      return auditoria;
    case '/api/admin/solicitacoes-titular':
      return solicitacoesTitular;
    case '/api/financeiro/concessoes':
      return concessoesFinanceiras;
    case '/api/financeiro/audiencia':
      return audienciaFinanceira;
    case '/api/admin/habilitacao-plano-crise':
      return habilitacaoPlanoCrise;
    default:
      break;
  }
  // Barreiras de concorrência: a tela consulta antes de desenhar, e um 404 aqui vira erro
  // na primeira pintura. Sem reserva e sem resultado pendente é o estado de repouso.
  if (/\/barreira$/.test(caminho) || /\/reserva\/consultar$/.test(caminho))
    return { epoca: 1, reserva: null, resultado_pendente: null };
  if (/\/barreira\/(reservar|encerrar|reconhecer)$/.test(caminho) || /\/reserva$/.test(caminho))
    return {
      estado: caminho.endsWith('reservar')
        ? 'aberta'
        : caminho.endsWith('encerrar')
          ? 'vazia'
          : 'reconhecido',
    };
  const paciente = /^\/api\/pacientes\/([0-9a-f-]{36})(\/.*)?$/.exec(caminho);
  if (paciente) {
    const resto = paciente[2] ?? '';
    const alvo = pacientes.itens.find((item) => item.id === paciente[1]);
    if (resto === '') return alvo;
    if (resto === '/vinculos-profissionais') return vinculosProfissionais;
    if (resto.endsWith('/disponibilidade')) return { disponivel: true };
  }
  if (caminho.endsWith('/disponibilidade')) return { disponivel: true };
  // Rotas da ficha que esta rodada NÃO cobre, porque pertencem às telas de outra frente:
  // `/pacientes/:id/anamnese`, `/pacientes/:id/plano` e `/pacientes/:id/pendencias`.
  // Ficam de fora de propósito: devolver lista vazia aqui recriaria o atalho que escondeu
  // dez telas. Quem for conferir a ficha acrescenta um módulo próprio e o despacha aqui.
  return undefined;
}

/** Resposta pronta (envelope + `request_id`), ou `undefined` quando não há fixture. */
export function responder(url: string): { dados: unknown; request_id: string } | undefined {
  const alvo = new URL(url, 'http://127.0.0.1');
  const corpo = dados(alvo.pathname, alvo.searchParams);
  return corpo === undefined ? undefined : envelope(corpo);
}
