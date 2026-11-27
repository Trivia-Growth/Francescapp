/** Auditoria, solicitações do titular, audiência financeira e habilitação do plano de
 * crise. Nada de conteúdo clínico: auditoria carrega identificador e resultado, e a
 * descrição da solicitação nem sequer trafega — o contrato só traz o resumo. */
import { CONCESSOES } from './sessao.ts';
import { PACIENTE_IDS } from './sessao.ts';
import { id, instante, USUARIO_ID } from './comum.ts';

const ACOES: Array<[string, string, 'permitido' | 'negado' | 'falhou']> = [
  ['consultar_paciente', 'paciente', 'permitido'],
  ['gravar_configuracao_sistema', 'configuracao_sistema', 'permitido'],
  ['revogar_concessao', 'concessao_equipe', 'permitido'],
  ['consultar_despesas', 'financeiro', 'negado'],
  ['publicar_ficha_plantao', 'turno_plantao', 'falhou'],
  ['entrar_sessao', 'sessao', 'permitido'],
  ['consultar_auditoria', 'auditoria', 'permitido'],
  ['gravar_campo_extra', 'campo_extra_catalogo', 'negado'],
  ['exportar_caso', 'exportacao', 'permitido'],
  ['responder_solicitacao_titular', 'solicitacao_titular', 'permitido'],
  ['revogar_acesso_paciente', 'acesso_paciente', 'permitido'],
  ['consultar_plano_crise', 'plano_crise', 'negado'],
];

/** Cada evento identifica exatamente um autor: usuário, identidade Auth ou operador
 * restrito. O `refine` do contrato recusa dois, e recusa nenhum. */
export const auditoria = {
  itens: ACOES.map(([acao, tipo, resultado], indice) => {
    const institucional = indice % 3 === 1;
    const porOperador = indice === 5;
    return {
      id: id(31, indice + 1),
      instante: instante(24 - (indice % 12), 23 - indice, (indice * 7) % 60),
      ator_usuario_id: porOperador ? null : indice % 2 === 0 ? USUARIO_ID : id(12, 1),
      ator_auth_id: null,
      operador_restrito: porOperador ? 'rotina-de-expurgo' : null,
      acao,
      tipo_objeto: tipo,
      objeto_id: id(32, indice + 1),
      paciente_id: institucional ? null : PACIENTE_IDS[indice % PACIENTE_IDS.length],
      resultado,
    };
  }),
  // Paginação de verdade: a auditoria é a tela em que "carregar mais" mais importa.
  proximo_cursor: 'cursor-auditoria-pagina-2',
};

const SOLICITACOES: Array<
  [
    'acesso' | 'correcao' | 'portabilidade' | 'exclusao',
    boolean,
    'atendida' | 'atendida_parcialmente' | 'recusada',
  ]
> = [
  ['acesso', true, 'atendida'],
  ['correcao', true, 'atendida_parcialmente'],
  ['exclusao', true, 'recusada'],
  ['portabilidade', false, 'atendida'],
  ['acesso', false, 'atendida'],
  ['correcao', true, 'atendida'],
  ['exclusao', false, 'recusada'],
];

export const solicitacoesTitular = {
  itens: SOLICITACOES.map(([tipo, respondida, medida], indice) => ({
    solicitacao_id: id(33, indice + 1),
    paciente_id: PACIENTE_IDS[indice % PACIENTE_IDS.length],
    tipo,
    recebida_em: instante(20 - indice, 10 + (indice % 8), (indice * 11) % 60),
    estado: respondida ? 'respondida' : 'recebida',
    medida: respondida ? medida : null,
    versao: respondida ? 2 : 1,
    registrada_por_usuario_id: USUARIO_ID,
    respondida_por_usuario_id: respondida ? id(12, 1) : null,
    respondida_em: respondida ? instante(22 - indice, 15, 0) : null,
  })),
  proximo_cursor: 'cursor-solicitacoes-pagina-2',
};

/** Quem vê o financeiro (FR-068). Mesma equipe da tela de acessos, com a marca separada. */
export const concessoesFinanceiras = CONCESSOES.map((item, indice) => ({
  concessao_id: item.id,
  usuario_id: item.usuario_id,
  email: item.email,
  perfil: item.perfil as 'profissional' | 'administrador',
  estado: item.estado as 'pendente' | 'vinculada' | 'revogada',
  habilitado: indice % 3 === 0,
  versao: indice,
}));

/** Quem aprova plano de crise (FR-020/DF-021). */
export const habilitacaoPlanoCrise = CONCESSOES.map((item, indice) => ({
  concessao_id: item.id,
  usuario_id: item.usuario_id,
  email: item.email,
  perfil: item.perfil as 'profissional' | 'administrador',
  estado: item.estado as 'pendente' | 'vinculada' | 'revogada',
  habilitado: indice % 2 === 1,
  versao: indice,
}));

export const audienciaFinanceira = { permitida: true };
