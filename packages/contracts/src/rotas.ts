import { z } from 'zod';
import { eventoAuditoriaSchema } from './auditoria.ts';
import { anamneseSchema, salvarAnamneseSchema } from './anamnese.ts';
import { reservaCadastroSchema } from './rpc.ts';

import {
  atualizarAcessoUsuarioSchema,
  comandoSessaoSchema,
  criarConcessaoEquipeSchema,
  desafioGoogleRespostaSchema,
  entradaSessaoComProvaRespostaSchema,
  entrarGoogleSchema,
  entrarTecnicoSchema,
  concessaoEquipeSchema,
  revogarConcessaoEquipeSchema,
  saidaSessaoSchema,
  sessaoAtualSchema,
  usuarioSessaoSchema,
} from './identidade.ts';
import {
  atualizarContatoSchema,
  atualizarPacienteSchema,
  atualizarRelacaoSchema,
  consultaPacientesSchema,
  criarAcessoPacienteSchema,
  criarPacienteSchema,
  criarRelacaoSchema,
  novoContatoSchema,
  pacienteAdministrativoSchema,
  pacienteBasicoSchema,
  pacienteListaSchema,
  revogarAcessoPacienteSchema,
} from './cadastro.ts';
import {
  cabecalhosMutacaoSchema,
  cursorSchema,
  limitePaginaSchema,
  paginaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from './comum.ts';
import {
  consultaReconciliacaoCadastroSchema,
  paginaReconciliacaoCadastroSchema,
} from './reconciliacao-cadastro.ts';

const vazioSchema = z.object({}).strict();
const origemSchema = z.string().url().max(2_048);
const cabecalhosProva = {
  'x-ffcm-prova-sessao': z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/),
  'x-ffcm-geracao-sessao': z
    .string()
    .regex(/^[1-9][0-9]{0,15}$/)
    .refine((v) => Number.isSafeInteger(Number(v))),
};
const cabecalhosConsultaProtegidaSchema = z.object(cabecalhosProva).strict();
const cabecalhosMutacaoProtegidaSchema = cabecalhosMutacaoSchema.extend(cabecalhosProva).strict();
const cabecalhosEntradaSessaoSchema = z.object({ origin: origemSchema }).strict();
const cabecalhosComCsrfSchema = cabecalhosEntradaSessaoSchema
  .extend({ 'x-csrf': z.string().min(32).max(512) })
  .strict();
const cabecalhosComDesafioSchema = cabecalhosComCsrfSchema
  .extend({
    'x-desafio': z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  })
  .strict();
const cabecalhosComSessaoSchema = cabecalhosComCsrfSchema
  .extend({
    'x-sessao': z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    ...cabecalhosProva,
  })
  .strict();
const consultaConcessoesSchema = z
  .object({
    cursor: cursorSchema.optional(),
    limite: limitePaginaSchema,
    estado: z.enum(['pendente', 'vinculada', 'revogada']).optional(),
  })
  .strict();
const consultaAuditoriaSchema = z
  .object({
    cursor: cursorSchema.optional(),
    limite: limitePaginaSchema,
    ator_id: uuidSchema.optional(),
    objeto_id: uuidSchema.optional(),
    acao: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type MetodoHttp = 'GET' | 'POST' | 'PATCH';

export type ContratoRota<
  Entrada extends z.ZodType,
  Saida extends z.ZodType,
  Cabecalhos extends z.ZodType = typeof vazioSchema,
  Parametros extends z.ZodType = typeof vazioSchema,
> = {
  metodo: MetodoHttp;
  caminho: string;
  entrada: Entrada;
  saida: Saida;
  cabecalhos: Cabecalhos;
  parametros: Parametros;
  transporte: TransporteSessao | null;
};

export type TransporteSessao = {
  exigeOrigem: true;
  exigeCsrf: boolean;
  cookiesEntrada: readonly (
    | 'ffcm_sessao_<seletor>'
    | 'ffcm_csrf_<seletor>'
    | 'ffcm_csrf_desafio_<seletor>'
    | 'ffcm_nonce_<seletor>'
  )[];
  cookiesSaida: readonly (
    | 'ffcm_sessao_<seletor>'
    | 'ffcm_csrf_<seletor>'
    | 'ffcm_csrf_desafio_<seletor>'
    | 'ffcm_nonce_<seletor>'
  )[];
  accessToken: 'somente-memoria' | 'nao-aplicavel';
};

export const politicaCookiesSessao = {
  httpOnly: true,
  sameSite: 'Lax',
  path: '/api/sessao',
  domain: null,
  secure: 'obrigatorio-https-excecao-http-local-explicita',
  formato: 'selado-autenticado',
  limpar: { maxAge: 0, mesmoPath: true, mesmoNome: true },
} as const;

// O desafio fornece CSRF também ao login técnico; o nonce Google só é
// consumido no login Google. O proxy preserva cada Set-Cookie separadamente.

const nenhumParametro = vazioSchema;
const pacienteParametrosSchema = z.object({ paciente_id: uuidSchema }).strict();
const contatoParametrosSchema = pacienteParametrosSchema
  .extend({ contato_id: uuidSchema })
  .strict();
const relacaoParametrosSchema = pacienteParametrosSchema
  .extend({ relacao_id: uuidSchema })
  .strict();
const acessoParametrosSchema = pacienteParametrosSchema.extend({ acesso_id: uuidSchema }).strict();
const concessaoParametrosSchema = z.object({ concessao_id: uuidSchema }).strict();
const usuarioParametrosSchema = z.object({ usuario_id: uuidSchema }).strict();

const mutacaoIdempotente = <
  Entrada extends z.ZodType,
  Saida extends z.ZodType,
  Parametros extends z.ZodType = typeof nenhumParametro,
>(
  metodo: Extract<MetodoHttp, 'POST' | 'PATCH'>,
  caminho: string,
  entrada: Entrada,
  saida: Saida,
  parametros: Parametros = nenhumParametro as unknown as Parametros,
): ContratoRota<Entrada, Saida, typeof cabecalhosMutacaoProtegidaSchema, Parametros> => ({
  metodo,
  caminho,
  entrada,
  saida,
  cabecalhos: cabecalhosMutacaoProtegidaSchema,
  parametros,
  transporte: null,
});

const comandoDeSessao = <Entrada extends z.ZodType, Saida extends z.ZodType>(
  caminho: string,
  entrada: Entrada,
  saida: Saida,
  cabecalhos:
    | typeof cabecalhosEntradaSessaoSchema
    | typeof cabecalhosComCsrfSchema
    | typeof cabecalhosComDesafioSchema
    | typeof cabecalhosComSessaoSchema,
  transporte: TransporteSessao,
): ContratoRota<
  Entrada,
  Saida,
  | typeof cabecalhosEntradaSessaoSchema
  | typeof cabecalhosComCsrfSchema
  | typeof cabecalhosComDesafioSchema
  | typeof cabecalhosComSessaoSchema
> => ({
  metodo: 'POST',
  caminho,
  entrada,
  saida,
  cabecalhos,
  parametros: nenhumParametro,
  transporte,
});

const consulta = <
  Entrada extends z.ZodType,
  Saida extends z.ZodType,
  Parametros extends z.ZodType = typeof nenhumParametro,
>(
  caminho: string,
  entrada: Entrada,
  saida: Saida,
  parametros: Parametros = nenhumParametro as unknown as Parametros,
): ContratoRota<Entrada, Saida, typeof cabecalhosConsultaProtegidaSchema, Parametros> => ({
  metodo: 'GET',
  caminho,
  entrada,
  saida,
  cabecalhos: cabecalhosConsultaProtegidaSchema,
  parametros,
  transporte: null,
});

const operacaoConcluidaSchema = z
  .object({ id: uuidSchema, versao: z.number().int().positive() })
  .strict();

/** Catálogo completo das rotas D-09; handlers não devem declarar DTOs próprios. */
export const contratosRotas = {
  desafioTecnico: comandoDeSessao(
    '/api/sessao/desafio-tecnico',
    vazioSchema,
    z
      .object({
        csrf: z.string().min(32).max(512),
        seletor_desafio: z
          .string()
          .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      })
      .strict(),
    cabecalhosEntradaSessaoSchema,
    {
      exigeOrigem: true,
      exigeCsrf: false,
      cookiesEntrada: [],
      cookiesSaida: ['ffcm_csrf_desafio_<seletor>'],
      accessToken: 'nao-aplicavel',
    },
  ),
  desafioGoogle: comandoDeSessao(
    '/api/sessao/desafio-google',
    vazioSchema,
    desafioGoogleRespostaSchema,
    cabecalhosEntradaSessaoSchema,
    {
      exigeOrigem: true,
      exigeCsrf: false,
      cookiesEntrada: [],
      cookiesSaida: ['ffcm_nonce_<seletor>', 'ffcm_csrf_desafio_<seletor>'],
      accessToken: 'nao-aplicavel',
    },
  ),
  entrarGoogle: comandoDeSessao(
    '/api/sessao/google',
    entrarGoogleSchema,
    entradaSessaoComProvaRespostaSchema,
    cabecalhosComDesafioSchema,
    {
      exigeOrigem: true,
      exigeCsrf: true,
      cookiesEntrada: ['ffcm_nonce_<seletor>', 'ffcm_csrf_desafio_<seletor>'],
      cookiesSaida: ['ffcm_sessao_<seletor>', 'ffcm_csrf_<seletor>'],
      accessToken: 'somente-memoria',
    },
  ),
  entrarTecnico: comandoDeSessao(
    '/api/sessao/tecnica',
    entrarTecnicoSchema,
    entradaSessaoComProvaRespostaSchema,
    cabecalhosComDesafioSchema,
    {
      exigeOrigem: true,
      exigeCsrf: true,
      cookiesEntrada: ['ffcm_csrf_desafio_<seletor>'],
      cookiesSaida: ['ffcm_sessao_<seletor>', 'ffcm_csrf_<seletor>'],
      accessToken: 'somente-memoria',
    },
  ),
  renovarSessao: comandoDeSessao(
    '/api/sessao/renovar',
    vazioSchema,
    entradaSessaoComProvaRespostaSchema,
    cabecalhosComSessaoSchema,
    {
      exigeOrigem: true,
      exigeCsrf: true,
      cookiesEntrada: ['ffcm_sessao_<seletor>', 'ffcm_csrf_<seletor>'],
      cookiesSaida: [],
      accessToken: 'somente-memoria',
    },
  ),
  sairSessao: comandoDeSessao(
    '/api/sessao/sair',
    vazioSchema,
    saidaSessaoSchema,
    cabecalhosComSessaoSchema,
    {
      exigeOrigem: true,
      exigeCsrf: true,
      cookiesEntrada: ['ffcm_sessao_<seletor>', 'ffcm_csrf_<seletor>'],
      cookiesSaida: ['ffcm_sessao_<seletor>', 'ffcm_csrf_<seletor>'],
      accessToken: 'nao-aplicavel',
    },
  ),
  sessaoAtual: consulta('/api/sessao', vazioSchema, sessaoAtualSchema),
  listarConcessoes: consulta(
    '/api/admin/concessoes-equipe',
    consultaConcessoesSchema,
    paginaSchema(
      concessaoEquipeSchema.omit({ metodo: true }).extend({
        email: z.string().email().max(254),
        ativo: z.boolean().nullable(),
      }),
    ),
  ),
  criarConcessao: mutacaoIdempotente(
    'POST',
    '/api/admin/concessoes-equipe',
    criarConcessaoEquipeSchema,
    concessaoEquipeSchema,
  ),
  revogarConcessao: mutacaoIdempotente(
    'POST',
    '/api/admin/concessoes-equipe/:concessao_id/revogar',
    revogarConcessaoEquipeSchema,
    concessaoEquipeSchema,
    concessaoParametrosSchema,
  ),
  atualizarAcessoUsuario: mutacaoIdempotente(
    'PATCH',
    '/api/admin/usuarios/:usuario_id/acesso',
    atualizarAcessoUsuarioSchema,
    usuarioSessaoSchema,
    usuarioParametrosSchema,
  ),
  listarPacientes: consulta(
    '/api/pacientes',
    consultaPacientesSchema,
    paginaSchema(pacienteListaSchema),
  ),
  // Contrato planejado, sem handler ou RPC; exposição exige S-02 e autorização.
  consultarOperacoesCadastro: consulta(
    '/api/cadastro/operacoes',
    consultaReconciliacaoCadastroSchema,
    paginaReconciliacaoCadastroSchema,
  ),
  criarPaciente: mutacaoIdempotente(
    'POST',
    '/api/pacientes',
    reservaCadastroSchema.extend({ entrada: criarPacienteSchema }).strict(),
    pacienteAdministrativoSchema,
  ),
  consultarPaciente: consulta(
    '/api/pacientes/:paciente_id',
    vazioSchema,
    z.union([pacienteBasicoSchema, pacienteAdministrativoSchema]),
    pacienteParametrosSchema,
  ),
  // Contratos locais; exposição depende da composição autorizada da rota.
  consultarAnamnese: consulta(
    '/api/pacientes/:paciente_id/anamnese',
    vazioSchema,
    anamneseSchema.nullable(),
    pacienteParametrosSchema,
  ),
  // Contrato preparado; replay autorizado e prova integrada ainda pendentes.
  salvarAnamnese: mutacaoIdempotente(
    'PATCH',
    '/api/pacientes/:paciente_id/anamnese',
    salvarAnamneseSchema,
    anamneseSchema,
    pacienteParametrosSchema,
  ),
  atualizarPaciente: mutacaoIdempotente(
    'PATCH',
    '/api/pacientes/:paciente_id',
    atualizarPacienteSchema,
    pacienteAdministrativoSchema,
    pacienteParametrosSchema,
  ),
  criarContato: mutacaoIdempotente(
    'POST',
    '/api/pacientes/:paciente_id/contatos',
    reservaCadastroSchema.extend({ entrada: novoContatoSchema }).strict(),
    pacienteAdministrativoSchema,
    pacienteParametrosSchema,
  ),
  atualizarContato: mutacaoIdempotente(
    'PATCH',
    '/api/pacientes/:paciente_id/contatos/:contato_id',
    atualizarContatoSchema,
    pacienteAdministrativoSchema,
    contatoParametrosSchema,
  ),
  criarRelacao: mutacaoIdempotente(
    'POST',
    '/api/pacientes/:paciente_id/relacoes',
    criarRelacaoSchema,
    operacaoConcluidaSchema,
    pacienteParametrosSchema,
  ),
  atualizarRelacao: mutacaoIdempotente(
    'PATCH',
    '/api/pacientes/:paciente_id/relacoes/:relacao_id',
    atualizarRelacaoSchema,
    operacaoConcluidaSchema,
    relacaoParametrosSchema,
  ),
  criarAcessoPaciente: mutacaoIdempotente(
    'POST',
    '/api/pacientes/:paciente_id/acessos',
    criarAcessoPacienteSchema.extend({ acesso_id: uuidSchema }),
    operacaoConcluidaSchema,
    pacienteParametrosSchema,
  ),
  revogarAcessoPaciente: mutacaoIdempotente(
    'POST',
    '/api/pacientes/:paciente_id/acessos/:acesso_id/revogar',
    revogarAcessoPacienteSchema,
    operacaoConcluidaSchema,
    acessoParametrosSchema,
  ),
  consultarAuditoria: consulta(
    '/api/admin/auditoria',
    consultaAuditoriaSchema,
    paginaSchema(eventoAuditoriaSchema),
  ),
} as const;

export const respostasHttp = {
  sucesso: sucessoRespostaSchema,
};
