/** Sessão, carteira, avisos e equipe: o alicerce que toda tela precisa antes de mostrar
 * conteúdo próprio. Pessoas e e-mails são inventados e o domínio `exemplo.test` é
 * reservado para testes, nunca entregável. */
import { id, instante, SESSAO_ID, USUARIO_ID } from './comum.ts';

export const CAPACIDADES_ADMINISTRADOR = [
  'administrar_cadastro',
  'administrar_concessoes',
  'consultar_carteira_integral',
  'consultar_auditoria',
];

export const sessaoAdministrador = {
  session_id: SESSAO_ID,
  usuario: { id: USUARIO_ID, perfil: 'administrador', ativo: true, versao: 1 },
  capacidades: CAPACIDADES_ADMINISTRADOR,
};

export const PACIENTE_IDS = [id(11, 1), id(11, 2), id(11, 3), id(11, 4), id(11, 5)];

export const pacientes = {
  itens: [
    {
      id: PACIENTE_IDS[0],
      nome: 'Ângela Souza Ficcional',
      nome_preferencia: 'Gela',
      versao: 3,
      situacao: 'ativo',
      responsavel_usuario_id: id(12, 1),
      sinal: {
        estado: 'atencao_operacional',
        motivos: ['Sem registro há 14 dias.', 'Tarefa de cuidado vencida.'],
      },
    },
    {
      id: PACIENTE_IDS[1],
      nome: 'Bruno Costa Ficcional',
      nome_preferencia: null,
      versao: 1,
      situacao: 'entrada',
      responsavel_usuario_id: null,
      sinal: { estado: 'em_dia', motivos: ['Registros em dia.'] },
    },
    {
      id: PACIENTE_IDS[2],
      nome: 'Carla Menezes Ficcional',
      nome_preferencia: 'Cacá',
      versao: 7,
      situacao: 'pausado',
      responsavel_usuario_id: id(12, 2),
      sinal: { estado: 'informacao_insuficiente', motivos: ['Sem dados suficientes.'] },
    },
    {
      id: PACIENTE_IDS[3],
      nome: 'Dagoberto Vilalva Ficcional de Albuquerque Sobrinho',
      nome_preferencia: null,
      versao: 2,
      situacao: 'encerrado',
      responsavel_usuario_id: id(12, 1),
      sinal: { estado: 'em_dia', motivos: ['Acompanhamento encerrado em comum acordo.'] },
    },
    {
      id: PACIENTE_IDS[4],
      nome: 'Eunice Prado Ficcional',
      nome_preferencia: null,
      versao: 4,
      situacao: 'transferido',
      responsavel_usuario_id: null,
      sinal: {
        estado: 'atencao_operacional',
        motivos: ['Passagem de turno sem ciência há 3 dias.'],
      },
    },
  ],
  // Paginação de verdade: a carteira precisa oferecer "carregar mais".
  proximo_cursor: 'cursor-carteira-pagina-2',
};

export const avisos = {
  itens: [
    {
      tipo: 'sinal_atencao_operacional',
      paciente_id: PACIENTE_IDS[0],
      chave_origem: 'sinal:2026-11-20',
      instante: instante(20, 9, 15),
      destinatario_usuario_id: USUARIO_ID,
      por_substituicao: false,
      lido: false,
      motivo: null,
    },
    {
      tipo: 'pendencia_operacional',
      paciente_id: PACIENTE_IDS[4],
      chave_origem: 'pendencia:2026-11-21',
      instante: instante(21, 8, 0),
      destinatario_usuario_id: USUARIO_ID,
      por_substituicao: true,
      lido: false,
      motivo: 'Revisão do plano vencida há 6 dias.',
    },
    {
      tipo: 'passagem_sem_ciencia',
      paciente_id: PACIENTE_IDS[2],
      chave_origem: 'passagem:2026-11-22',
      instante: instante(22, 19, 30),
      destinatario_usuario_id: USUARIO_ID,
      por_substituicao: false,
      lido: true,
      motivo: null,
    },
  ],
  nao_lidos: 2,
};

/** Concessões da equipe, com os três estados que a tela distingue. O identificador de
 * usuário é o mesmo usado nas telas de habilitação e de audiência financeira, para que
 * "quem é esta pessoa" case entre as telas. */
export const CONCESSOES = [
  {
    id: id(13, 1),
    perfil: 'profissional',
    estado: 'vinculada',
    usuario_id: id(12, 1),
    versao: 2,
    email: 'ana.ficticia@exemplo.test',
    ativo: true,
  },
  {
    id: id(13, 2),
    perfil: 'administrador',
    estado: 'vinculada',
    usuario_id: USUARIO_ID,
    versao: 1,
    email: 'coordenacao.ficticia@exemplo.test',
    ativo: true,
  },
  {
    id: id(13, 3),
    perfil: 'profissional',
    estado: 'pendente',
    usuario_id: null,
    versao: 1,
    email: 'bruno.ficticio@exemplo.test',
    ativo: null,
  },
  {
    id: id(13, 4),
    perfil: 'profissional',
    estado: 'revogada',
    usuario_id: id(12, 2),
    versao: 5,
    email: 'carla.ficticia@exemplo.test',
    ativo: false,
  },
  {
    id: id(13, 5),
    perfil: 'profissional',
    estado: 'vinculada',
    usuario_id: id(12, 3),
    versao: 1,
    email: 'daniel.ficticio@exemplo.test',
    ativo: false,
  },
  {
    id: id(13, 6),
    perfil: 'administrador',
    estado: 'pendente',
    usuario_id: null,
    versao: 1,
    email: 'elisa.ficticia@exemplo.test',
    ativo: null,
  },
];

export const concessoesEquipe = { itens: CONCESSOES, proximo_cursor: null };

/** Vínculos profissionais de um caso. Sem pelo menos um item aqui a área de revogação de
 * vínculo não chega a ser desenhada. */
export const vinculosProfissionais = {
  itens: [
    { id: id(14, 1), usuario_id: id(12, 1), revogado: false, versao: 1 },
    { id: id(14, 2), usuario_id: id(12, 3), revogado: false, versao: 2 },
    { id: id(14, 3), usuario_id: id(12, 2), revogado: true, versao: 4 },
  ],
  proximo_cursor: null,
};
