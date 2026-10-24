import { z } from 'zod';

import {
  atualizarAcessoUsuarioSchema,
  comandoSessaoSchema,
  criarConcessaoEquipeSchema,
  desafioGoogleRespostaSchema,
  entradaSessaoRespostaSchema,
  entrarGoogleSchema,
  entrarTecnicoSchema,
  concessaoEquipeSchema,
  revogarConcessaoEquipeSchema,
  saidaSessaoSchema,
  sessaoAtualSchema,
  usuarioSessaoSchema,
} from './identidade.js';
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
  revogarAcessoPacienteSchema,
} from './cadastro.js';
import {
  cabecalhosMutacaoSchema,
  cursorSchema,
  limitePaginaSchema,
  paginaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from './comum.js';

const vazioSchema = z.object({}).strict();
const origemSchema = z.string().url().max(2_048);
const cabecalhosEntradaSessaoSchema = z.object({ origin: origemSchema }).strict();
const cabecalhosComCsrfSchema = cabecalhosEntradaSessaoSchema
  .extend({ 'x-csrf': z.string().min(32).max(512) })
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
const auditoriaSchema = z
  .object({
    id: uuidSchema,
    instante: z.string().datetime({ offset: true }),
    acao: z.string().min(1).max(120),
    tipo_objeto: z.string().min(1).max(120),
    objeto_id: uuidSchema.nullable(),
    resultado: z.enum(['permitido', 'negado', 'falhou']),
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
  cookiesEntrada: readonly ('ffcm_refresh' | 'ffcm_csrf' | 'ffcm_nonce')[];
  cookiesSaida: readonly ('ffcm_refresh' | 'ffcm_csrf' | 'ffcm_nonce')[];
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
): ContratoRota<Entrada, Saida, typeof cabecalhosMutacaoSchema, Parametros> => ({
  metodo,
  caminho,
  entrada,
  saida,
  cabecalhos: cabecalhosMutacaoSchema,
  parametros,
  transporte: null,
});

const comandoDeSessao = <Entrada extends z.ZodType, Saida extends z.ZodType>(
  caminho: string,
  entrada: Entrada,
  saida: Saida,
  cabecalhos: typeof cabecalhosEntradaSessaoSchema | typeof cabecalhosComCsrfSchema,
  transporte: TransporteSessao,
): ContratoRota<
  Entrada,
  Saida,
  typeof cabecalhosEntradaSessaoSchema | typeof cabecalhosComCsrfSchema
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
): ContratoRota<Entrada, Saida, typeof vazioSchema, Parametros> => ({
  metodo: 'GET',
  caminho,
  entrada,
  saida,
  cabecalhos: vazioSchema,
  parametros,
  transporte: null,
});

const operacaoConcluidaSchema = z
  .object({ id: uuidSchema, versao: z.number().int().positive() })
  .strict();

/** Catálogo completo das rotas D-09; handlers não devem declarar DTOs próprios. */
export const contratosRotas = {
  desafioGoogle: comandoDeSessao(
    '/api/sessao/desafio-google',
    vazioSchema,
    desafioGoogleRespostaSchema,
    cabecalhosEntradaSessaoSchema,
    {
      exigeOrigem: true,
      exigeCsrf: false,
      cookiesEntrada: [],
      cookiesSaida: ['ffcm_nonce', 'ffcm_csrf'],
      accessToken: 'nao-aplicavel',
    },
  ),
  entrarGoogle: comandoDeSessao(
    '/api/sessao/google',
    entrarGoogleSchema,
    entradaSessaoRespostaSchema,
    cabecalhosComCsrfSchema,
    {
      exigeOrigem: true,
      exigeCsrf: true,
      cookiesEntrada: ['ffcm_nonce', 'ffcm_csrf'],
      cookiesSaida: ['ffcm_refresh', 'ffcm_csrf'],
      accessToken: 'somente-memoria',
    },
  ),
  entrarTecnico: comandoDeSessao(
    '/api/sessao/tecnica',
    entrarTecnicoSchema,
    entradaSessaoRespostaSchema,
    cabecalhosComCsrfSchema,
    {
      exigeOrigem: true,
      exigeCsrf: true,
      cookiesEntrada: ['ffcm_csrf'],
      cookiesSaida: ['ffcm_refresh', 'ffcm_csrf'],
      accessToken: 'somente-memoria',
    },
  ),
  renovarSessao: comandoDeSessao(
    '/api/sessao/renovar',
    vazioSchema,
    entradaSessaoRespostaSchema,
    cabecalhosComCsrfSchema,
    {
      exigeOrigem: true,
      exigeCsrf: true,
      cookiesEntrada: ['ffcm_refresh', 'ffcm_csrf'],
      cookiesSaida: ['ffcm_refresh', 'ffcm_csrf'],
      accessToken: 'somente-memoria',
    },
  ),
  sairSessao: comandoDeSessao(
    '/api/sessao/sair',
    vazioSchema,
    saidaSessaoSchema,
    cabecalhosComCsrfSchema,
    {
      exigeOrigem: true,
      exigeCsrf: true,
      cookiesEntrada: ['ffcm_refresh', 'ffcm_csrf'],
      cookiesSaida: ['ffcm_refresh', 'ffcm_csrf'],
      accessToken: 'nao-aplicavel',
    },
  ),
  sessaoAtual: consulta('/api/sessao', vazioSchema, sessaoAtualSchema),
  listarConcessoes: consulta(
    '/api/admin/concessoes-equipe',
    consultaConcessoesSchema,
    paginaSchema(concessaoEquipeSchema),
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
    paginaSchema(pacienteBasicoSchema),
  ),
  criarPaciente: mutacaoIdempotente(
    'POST',
    '/api/pacientes',
    criarPacienteSchema,
    pacienteAdministrativoSchema,
  ),
  consultarPaciente: consulta(
    '/api/pacientes/:paciente_id',
    vazioSchema,
    z.union([pacienteBasicoSchema, pacienteAdministrativoSchema]),
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
    novoContatoSchema,
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
    criarAcessoPacienteSchema,
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
    paginaSchema(auditoriaSchema),
  ),
} as const;

export const respostasHttp = {
  sucesso: sucessoRespostaSchema,
};
