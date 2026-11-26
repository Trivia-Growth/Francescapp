/** Catálogos administrados: configuração do sistema, integrações, campos extras do plano,
 * modelo da ficha de plantão, papéis declarados e estado emocional observado.
 *
 * Integrações nunca carrega segredo: o contrato só transporta `cadastrado`, `versao` e
 * quem mexeu por último. Mesmo assim, nada aqui aponta para conta real. */
import { id, instante, USUARIO_ID } from './comum.ts';

export const configuracaoSistema = [
  {
    chave: 'ffcm.documentos.drive_pasta_raiz',
    valor: '',
    tipo: 'texto',
    rotulo: 'Pasta raiz dos documentos',
    descricao:
      'Enquanto estiver em branco o envio de anexos fica indisponível. Valor fictício de conferência.',
    exposicao: 'administracao',
    versao: 1,
    opcoes: null,
    atualizado_por_usuario_id: null,
    atualizado_em: instante(1, 8, 0),
  },
  {
    chave: 'ffcm.audio.expurgo_ativo',
    valor: true,
    tipo: 'booleano',
    rotulo: 'Expurgar áudios após a transcrição',
    descricao: 'Apaga o áudio depois que a transcrição é aceita pela equipe.',
    exposicao: 'administracao',
    versao: 4,
    opcoes: null,
    atualizado_por_usuario_id: USUARIO_ID,
    atualizado_em: instante(18, 14, 22),
  },
  {
    chave: 'ffcm.plano.dias_antecedencia_revisao',
    valor: 15,
    tipo: 'numero',
    rotulo: 'Antecedência do aviso de revisão (dias)',
    descricao: 'Quantos dias antes da data de revisão o caso começa a aparecer como próximo.',
    exposicao: 'administracao',
    versao: 2,
    opcoes: null,
    minimo: 1,
    maximo: 180,
    atualizado_por_usuario_id: USUARIO_ID,
    atualizado_em: instante(19, 10, 5),
  },
  {
    chave: 'ffcm.turno.turnos_do_dia',
    valor: ['Manhã', 'Tarde', 'Noite'],
    tipo: 'lista',
    rotulo: 'Turnos do dia',
    descricao: 'Nomes dos turnos oferecidos na escala.',
    exposicao: 'administracao',
    versao: 3,
    opcoes: ['Manhã', 'Tarde', 'Noite', 'Madrugada', 'Plantão de 12 horas'],
    atualizado_por_usuario_id: id(12, 1),
    atualizado_em: instante(17, 16, 41),
  },
  {
    chave: 'ffcm.transcricao.modelo',
    valor: 'modelo-ficticio-de-conferencia',
    tipo: 'texto',
    rotulo: 'Modelo de transcrição',
    descricao: 'Identificador do modelo usado na transcrição de áudio.',
    exposicao: 'servidor',
    versao: 9,
    opcoes: ['modelo-ficticio-de-conferencia', 'modelo-ficticio-reserva'],
    atualizado_por_usuario_id: id(12, 3),
    atualizado_em: instante(23, 11, 2),
  },
  {
    chave: 'ffcm.regras.horario_atendimento',
    valor: 'Segunda a sexta, das 8h às 18h. Fora disso o retorno é no próximo dia útil.',
    tipo: 'texto',
    rotulo: 'Horário de atendimento',
    descricao: 'Texto institucional exibido na tela de regras.',
    exposicao: 'publica',
    versao: 6,
    opcoes: null,
    atualizado_por_usuario_id: USUARIO_ID,
    atualizado_em: instante(10, 9, 0),
  },
];

/** Somente metadados. O valor do segredo não trafega e por isso não existe aqui. */
export const segredosIntegracoes = [
  {
    chave: 'ffcmapp.integracao.google_drive',
    cadastrado: true,
    versao: 3,
    atualizado_por_usuario_id: USUARIO_ID,
    atualizado_em: instante(12, 15, 30),
  },
  {
    chave: 'ffcmapp.integracao.openrouter',
    cadastrado: false,
    versao: 0,
    atualizado_por_usuario_id: null,
    atualizado_em: null,
  },
  {
    chave: 'ffcmapp.integracao.google_calendar_client_id',
    cadastrado: true,
    versao: 1,
    atualizado_por_usuario_id: id(12, 1),
    atualizado_em: instante(5, 9, 12),
  },
  {
    chave: 'ffcmapp.integracao.google_calendar_client_secret',
    cadastrado: true,
    versao: 7,
    atualizado_por_usuario_id: id(12, 9),
    atualizado_em: instante(24, 18, 45),
  },
];

export const expurgoAudio = {
  ativo: true,
  ultima_execucao: { executado_em: instante(24, 3, 0), falhas: 2, apagados: 118 },
};

/** Catálogo antigo do Plano de cuidado (`plano-cuidado.ts`), sem escopo nem ordem. */
export const camposExtrasPlano = [
  {
    campo_id: id(21, 1),
    nome: 'Responsável pelo acompanhamento externo',
    tipo: 'texto',
    opcoes: null,
    ativo: true,
    versao: 2,
  },
  {
    campo_id: id(21, 2),
    nome: 'Sessões contratadas no mês',
    tipo: 'numero',
    opcoes: null,
    ativo: true,
    versao: 1,
  },
  {
    campo_id: id(21, 3),
    nome: 'Data da última reunião com a família',
    tipo: 'data',
    opcoes: null,
    ativo: true,
    versao: 5,
  },
  {
    campo_id: id(21, 4),
    nome: 'Modalidade do acompanhamento',
    tipo: 'lista',
    opcoes: ['Domiciliar', 'Ambulatorial', 'Híbrido', 'Remoto'],
    ativo: true,
    versao: 3,
  },
  {
    campo_id: id(21, 5),
    nome: 'Campo fictício desativado',
    tipo: 'texto',
    opcoes: null,
    ativo: false,
    versao: 8,
  },
];

export const aprovadoresPlano = [
  { usuario_id: id(12, 1), ativo: true, versao: 2 },
  { usuario_id: USUARIO_ID, ativo: true, versao: 1 },
  { usuario_id: id(12, 2), ativo: false, versao: 4 },
];

/** Catálogo generalizado, escopo `ficha_plantao` (FR-078). */
export const modeloFichaPlantao = [
  {
    campo_id: id(22, 1),
    escopo: 'ficha_plantao',
    nome: 'Aceitação alimentar',
    tipo: 'lista',
    opcoes: ['Aceitou tudo', 'Aceitou parcialmente', 'Recusou'],
    ativo: true,
    ordem: 10,
    obrigatorio: true,
    de_fabrica: true,
    visibilidade: 'compartilhavel',
    versao: 2,
  },
  {
    campo_id: id(22, 2),
    escopo: 'ficha_plantao',
    nome: 'Horas de sono',
    tipo: 'numero',
    opcoes: null,
    ativo: true,
    ordem: 20,
    obrigatorio: false,
    de_fabrica: true,
    visibilidade: 'compartilhavel',
    versao: 1,
  },
  {
    campo_id: id(22, 3),
    escopo: 'ficha_plantao',
    nome: 'Observações internas da equipe',
    tipo: 'texto_longo',
    opcoes: null,
    ativo: true,
    ordem: 30,
    obrigatorio: false,
    de_fabrica: false,
    visibilidade: 'interna',
    versao: 6,
  },
  {
    campo_id: id(22, 4),
    escopo: 'ficha_plantao',
    nome: 'Houve intercorrência',
    tipo: 'booleano',
    opcoes: null,
    ativo: true,
    ordem: 40,
    obrigatorio: true,
    de_fabrica: false,
    visibilidade: 'interna',
    versao: 3,
  },
  {
    campo_id: id(22, 5),
    escopo: 'ficha_plantao',
    nome: 'Data da próxima consulta',
    tipo: 'data',
    opcoes: null,
    ativo: true,
    ordem: 50,
    obrigatorio: false,
    de_fabrica: false,
    visibilidade: 'compartilhavel',
    versao: 1,
  },
  {
    campo_id: id(22, 6),
    escopo: 'ficha_plantao',
    nome: 'Campo fictício fora de uso',
    tipo: 'texto',
    opcoes: null,
    ativo: false,
    ordem: 60,
    obrigatorio: false,
    de_fabrica: false,
    visibilidade: 'interna',
    versao: 11,
  },
];

export const papeisDeclarados = [
  {
    papel_id: id(23, 1),
    nome: 'Acompanhante terapêutico',
    ativo: true,
    de_fabrica: true,
    versao: 1,
  },
  { papel_id: id(23, 2), nome: 'Enfermeira', ativo: true, de_fabrica: true, versao: 1 },
  {
    papel_id: id(23, 3),
    nome: 'Cuidadora de referência',
    ativo: true,
    de_fabrica: false,
    versao: 3,
  },
  { papel_id: id(23, 4), nome: 'Fisioterapeuta', ativo: true, de_fabrica: false, versao: 2 },
  {
    papel_id: id(23, 5),
    nome: 'Papel fictício desativado',
    ativo: false,
    de_fabrica: false,
    versao: 7,
  },
];

export const estadosEmocionais = [
  { estado_id: id(24, 1), estado: 'agitado', ativo: true, de_fabrica: true, versao: 1 },
  { estado_id: id(24, 2), estado: 'apático', ativo: true, de_fabrica: true, versao: 1 },
  { estado_id: id(24, 3), estado: 'choroso', ativo: true, de_fabrica: true, versao: 1 },
  { estado_id: id(24, 4), estado: 'comunicativo', ativo: true, de_fabrica: true, versao: 1 },
  { estado_id: id(24, 5), estado: 'irritado', ativo: true, de_fabrica: true, versao: 1 },
  { estado_id: id(24, 6), estado: 'retraído', ativo: true, de_fabrica: true, versao: 1 },
  { estado_id: id(24, 7), estado: 'sonolento', ativo: true, de_fabrica: true, versao: 1 },
  { estado_id: id(24, 8), estado: 'tranquilo', ativo: true, de_fabrica: true, versao: 1 },
  {
    estado_id: id(24, 9),
    estado: 'participativo nas atividades propostas',
    ativo: true,
    de_fabrica: false,
    versao: 2,
  },
  {
    estado_id: id(24, 10),
    estado: 'termo fictício desativado',
    ativo: false,
    de_fabrica: false,
    versao: 5,
  },
];

/** FR-041: regras lidas por qualquer sessão autenticada, somente leitura. */
export const regrasAtendimento = [
  {
    chave: 'ffcm.regras.horario_atendimento',
    valor: 'Segunda a sexta, das 8h às 18h. Fora disso o retorno é no próximo dia útil.',
    rotulo: 'Horário de atendimento',
    versao: 6,
    atualizado_em: instante(10, 9, 0),
  },
  {
    chave: 'ffcm.regras.periodo_acompanhamento',
    valor:
      'O acompanhamento é contratado em ciclos de três meses, renovados após a reunião de revisão com a família.',
    rotulo: 'Período de acompanhamento',
    versao: 2,
    atualizado_em: instante(8, 11, 30),
  },
  {
    chave: 'ffcm.regras.canais_de_retorno',
    valor:
      'Dúvidas são respondidas pelo aplicativo. O telefone fictício (00) 0000-0000 atende apenas urgências combinadas em plano de crise.',
    rotulo: 'Canais de retorno',
    versao: 4,
    atualizado_em: instante(14, 17, 15),
  },
  {
    chave: 'ffcm.regras.uso_do_diario',
    valor:
      'O diário registra o que foi observado no turno. Conteúdo clínico de terceiros não entra, e áudio é transcrito antes de virar registro.',
    rotulo: 'Uso do diário',
    versao: 1,
    atualizado_em: instante(2, 10, 0),
  },
];
