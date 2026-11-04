import { z } from 'zod';
import { eventoAuditoriaSchema } from './auditoria.ts';

import {
  chaveIdempotenciaSchema,
  codigoErroSchema,
  cursorSchema,
  limitePaginaSchema,
  perfilSchema,
  uuidSchema,
  versaoSchema,
} from './comum.ts';
import { estadoConcessaoSchema } from './identidade.ts';

export const formatoCifraSchema = z.literal(1);
export const base64UrlSchema = z
  .string()
  .min(1)
  .max(32_768)
  .regex(/^[A-Za-z0-9_-]+$/);
const keyIdSchema = z.string().min(1).max(128);
const instanteSchema = z.string().datetime({ offset: true });

/** Persistência e transporte interno; nunca enviado ao navegador. */
export const campoCifradoSchema = z
  .object({
    formato: formatoCifraSchema,
    key_id: keyIdSchema,
    nonce: base64UrlSchema,
    ciphertext: base64UrlSchema,
    tag: base64UrlSchema,
  })
  .strict();
const metadadosAadCamposSchema = z
  .object({
    tabela: z.enum([
      'cadastro.paciente',
      'cadastro.contato_paciente',
      'cadastro.pessoa_relacionada',
      'cadastro.relacao_paciente',
      'auditoria.evento',
    ]),
    registro_id: uuidSchema,
    campo: z.string().min(1).max(80),
    formato: formatoCifraSchema,
  })
  .strict();

/** A exceção técnica do bootstrap reutiliza o envelope de motivo da concessão. */
export const metadadosAadConcessaoSchema = z
  .object({
    tabela: z.literal('identidade.concessao_equipe'),
    registro_id: uuidSchema,
    campo: z.enum(['email', 'motivo']),
    formato: formatoCifraSchema,
  })
  .strict();

const metadadosAadAcessoFamiliarSchema = z
  .object({
    tabela: z.literal('cadastro.acesso_paciente'),
    registro_id: uuidSchema,
    campo: z.literal('motivo_concessao'),
    formato: formatoCifraSchema,
  })
  .strict();

const metadadosAadSessaoSchema = z
  .object({
    tabela: z.literal('identidade.sessao'),
    registro_id: uuidSchema,
    usuario_id: uuidSchema,
    campo: z.literal('refresh_token'),
    formato: formatoCifraSchema,
  })
  .strict();

const metadadosAadAnamneseSchema = z
  .object({
    tabela: z.literal('cadastro.anamnese_versao'),
    paciente_id: uuidSchema,
    registro_id: uuidSchema,
    versao: z.number().int().min(1).max(2147483647),
    campo: z.literal('conteudo'),
    formato: formatoCifraSchema,
  })
  .strict();

const metadadosAadPlanoSchema = z
  .object({
    tabela: z.literal('cadastro.objetivo_cuidado_versao'),
    paciente_id: uuidSchema,
    objetivo_id: uuidSchema,
    registro_id: uuidSchema,
    versao: z.number().int().min(1).max(2147483647),
    campo: z.literal('conteudo'),
    formato: formatoCifraSchema,
  })
  .strict();

const metadadosAadTarefaSchema = z
  .object({
    tabela: z.literal('cadastro.tarefa_cuidado_versao'),
    paciente_id: uuidSchema,
    tarefa_id: uuidSchema,
    registro_id: uuidSchema,
    versao: z.number().int().min(1).max(2147483647),
    campo: z.literal('conteudo'),
    formato: formatoCifraSchema,
  })
  .strict();

const metadadosAadDiarioSchema = z
  .object({
    tabela: z.literal('cadastro.diario_rascunho_textual'),
    paciente_id: uuidSchema,
    autor_usuario_id: uuidSchema,
    registro_id: uuidSchema,
    versao: z.number().int().min(1).max(2147483647),
    campo: z.literal('conteudo'),
    formato: formatoCifraSchema,
  })
  .strict();

export const metadadosAadSchema = z.union([
  metadadosAadCamposSchema,
  metadadosAadConcessaoSchema,
  metadadosAadAcessoFamiliarSchema,
  metadadosAadSessaoSchema,
  metadadosAadAnamneseSchema,
  metadadosAadPlanoSchema,
  metadadosAadTarefaSchema,
  metadadosAadDiarioSchema,
]);

export const dadosAtestadoSchema = z
  .object({
    key_id: keyIdSchema,
    usuario_id: uuidSchema,
    session_id: uuidSchema,
    emitido_em: instanteSchema,
    expira_em: instanteSchema,
    request_id: uuidSchema,
    operacao: z.string().min(1).max(120),
    digest_entrada: base64UrlSchema,
  })
  .strict();
export const atestadoOperacaoSchema = dadosAtestadoSchema.extend({ mac: base64UrlSchema }).strict();
/** Resultado interno do assinador. O parse é estrutural: não verifica JCS,
 * digest, MAC, identidade, autorização ou equivalência com a operação executada.
 * Não verifica conteúdo sensível nos snapshots: o chamador deve impedir texto
 * pessoal claro e chaves e nunca enviá-los ao navegador ou registrá-los em logs. */
const snapshotCanonicoSchema = z
  .string()
  .min(1)
  .max(1_048_576)
  .refine((valor) => new TextEncoder().encode(valor).byteLength <= 1_048_576);
export const resultadoAtestacaoSchema = z
  .object({
    atestado: atestadoOperacaoSchema,
    entradaCanonica: snapshotCanonicoSchema,
    dadosCanonicos: snapshotCanonicoSchema,
  })
  .strict();
export const contextoRpcUsuarioSchema = z
  .object({ request_id: uuidSchema, atestado: atestadoOperacaoSchema })
  .strict();
const mutacaoSchema = contextoRpcUsuarioSchema
  .extend({
    chave_idempotencia: chaveIdempotenciaSchema,
    digest_idempotencia: base64UrlSchema,
    auditoria_id: uuidSchema,
  })
  .strict();
const alteracaoSchema = mutacaoSchema
  .extend({ versao_esperada: versaoSchema, motivo: campoCifradoSchema })
  .strict();

const identidadeBase = { usuario_id: uuidSchema, session_id: uuidSchema };
const identidadeGoogleSchema = z
  .object({
    ...identidadeBase,
    metodo: z.literal('google_workspace'),
    subject_google: z.string().min(1).max(255),
    email_hmac: base64UrlSchema,
    desafio_id: uuidSchema,
    nonce_hash: base64UrlSchema,
  })
  .strict();
const identidadeTecnicaSchema = z
  .object({ ...identidadeBase, metodo: z.literal('tecnica') })
  .strict();
export const identidadeComprovadaServidorSchema = z.discriminatedUnion('metodo', [
  identidadeGoogleSchema,
  identidadeTecnicaSchema,
]);
export const admissaoSessaoEntradaSchema = z
  .object({
    identidade: identidadeComprovadaServidorSchema,
    request_id: uuidSchema,
    credencial_refresh: campoCifradoSchema,
  })
  .strict();
const googleAdmissaoSchema = admissaoSessaoEntradaSchema
  .extend({ identidade: identidadeGoogleSchema })
  .strict();
const tecnicaAdmissaoSchema = admissaoSessaoEntradaSchema
  .extend({ identidade: identidadeTecnicaSchema })
  .strict();
/** Refresh/logout recebem somente os claims comprovados do JWT atual,
 * sem consumir novamente um desafio de login. */
const sessaoComprovadaEntradaSchema = z
  .object({
    identidade: z.object(identidadeBase).strict(),
    request_id: uuidSchema,
  })
  .strict();
export const admissaoSessaoSaidaSchema = z
  .object({
    usuario_id: uuidSchema,
    session_id: uuidSchema,
    concessao_id: uuidSchema,
    perfil: perfilSchema,
    versao_usuario: versaoSchema,
  })
  .strict();

const contatoCifradoSchema = z
  .object({
    contato_id: uuidSchema,
    tipo: z.enum(['email', 'telefone']),
    valor: campoCifradoSchema,
    versao: versaoSchema,
  })
  .strict();
export const pacienteBasicoRpcSaidaSchema = z
  .object({
    paciente_id: uuidSchema,
    nome: campoCifradoSchema,
    nome_preferencia: campoCifradoSchema.nullable(),
    versao: versaoSchema,
  })
  .strict();
export const pacienteAdministrativoRpcSaidaSchema = pacienteBasicoRpcSaidaSchema
  .extend({
    data_nascimento: campoCifradoSchema.nullable(),
    contatos: z.array(contatoCifradoSchema),
  })
  .strict();
export const leituraProtegidaSaidaSchema = pacienteBasicoRpcSaidaSchema;
const concessaoSaidaSchema = z
  .object({
    concessao_id: uuidSchema,
    email: campoCifradoSchema,
    perfil: perfilSchema.exclude(['familia']),
    estado: estadoConcessaoSchema,
    usuario_id: uuidSchema.nullable(),
    versao: versaoSchema,
  })
  .strict();
const operacaoConcluidaSchema = z.object({ id: uuidSchema, versao: versaoSchema }).strict();
const paginaInterna = <T extends z.ZodType>(item: T) =>
  z.object({ itens: z.array(item), proximo_cursor: cursorSchema.nullable() }).strict();
const paginacao = { cursor: cursorSchema.optional(), limite: limitePaginaSchema };
const aadPaciente = <C extends 'nome' | 'nome_preferencia' | 'data_nascimento'>(campo: C) =>
  z
    .object({
      tabela: z.literal('cadastro.paciente'),
      registro_id: uuidSchema,
      campo: z.literal(campo),
      formato: formatoCifraSchema,
    })
    .strict();
export const reservaCadastroSchema = z
  .object({
    reserva_id: uuidSchema,
    geracao_reserva: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

/** AAD e reserva obrigatórios tornam este contrato incompatível com entradas anteriores.
 * Validação estrutural não autentica ciphertext nem substitui verificação no banco. */
export const criarPacienteRpcEntradaSchema = mutacaoSchema
  .extend({
    ...reservaCadastroSchema.shape,
    paciente_id: uuidSchema,
    nome: campoCifradoSchema,
    nome_preferencia: campoCifradoSchema.optional(),
    data_nascimento: campoCifradoSchema.optional(),
    aad: z
      .object({
        nome: aadPaciente('nome'),
        nome_preferencia: aadPaciente('nome_preferencia').optional(),
        data_nascimento: aadPaciente('data_nascimento').optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((valor, ctx) => {
    for (const campo of ['nome', 'nome_preferencia', 'data_nascimento'] as const) {
      const envelope = valor[campo];
      const aad = valor.aad[campo];
      if (
        (envelope === undefined) !== (aad === undefined) ||
        (aad &&
          envelope &&
          (aad.registro_id !== valor.paciente_id || aad.formato !== envelope.formato))
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'AAD incompatível com o campo cifrado.',
          path: ['aad', campo],
        });
      }
    }
  });
const atualizarPacienteEntrada = alteracaoSchema
  .extend({
    paciente_id: uuidSchema,
    nome: campoCifradoSchema.optional(),
    nome_preferencia: campoCifradoSchema.nullable().optional(),
    data_nascimento: campoCifradoSchema.nullable().optional(),
    aad: z
      .object({
        nome: aadPaciente('nome').optional(),
        nome_preferencia: aadPaciente('nome_preferencia').optional(),
        data_nascimento: aadPaciente('data_nascimento').optional(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (v) =>
      v.nome !== undefined || v.nome_preferencia !== undefined || v.data_nascimento !== undefined,
  )
  .superRefine((valor, ctx) => {
    for (const campo of ['nome', 'nome_preferencia', 'data_nascimento'] as const) {
      const envelope = valor[campo];
      const aad = valor.aad[campo];
      if (
        (envelope != null) !== (aad !== undefined) ||
        (envelope != null &&
          aad &&
          (aad.registro_id !== valor.paciente_id || aad.formato !== envelope.formato))
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'AAD incompatível com o campo cifrado.',
          path: ['aad', campo],
        });
      }
    }
  });
const novoContatoInternoSchema = z
  .object({
    contato_id: uuidSchema,
    tipo: z.enum(['email', 'telefone']),
    valor: campoCifradoSchema,
  })
  .strict();

/** Negativas esperadas retornam erro após persistir auditoria, sem RAISE/rollback. */
export const erroRpcSchema = z.object({ codigo: codigoErroSchema }).strict();
export const resultadoRpcSchema = <T extends z.ZodType>(dados: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), dados, request_id: uuidSchema }).strict(),
    z.object({ ok: z.literal(false), erro: erroRpcSchema, request_id: uuidSchema }).strict(),
  ]);

/** Contrato da função privada local; não representa uma rota pública. */
export const respostaEdicaoPacientePrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.object({ paciente_id: uuidSchema, versao: versaoSchema }).strict(),
      request_id: uuidSchema,
      repeticao: z.boolean(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z
        .object({ codigo: z.enum(['sem_permissao', 'conflito', 'conflito_idempotencia']) })
        .strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);

export type ExecutorOperacao = 'jwt-do-solicitante' | 'somente-servidor';
export type TransacaoOperacao =
  | 'leitura-auditada'
  | 'mutacao-auditada'
  | 'admissao-sessao'
  | 'sessao';
export type MapeamentoOperacao = {
  rota: string;
  rpc: string;
  executor: ExecutorOperacao;
  transacao: TransacaoOperacao;
  perfilExigido: 'administrador' | 'sessao-admitida' | 'servidor';
};

/** Uma função SQL recebe exclusivamente p_entrada jsonb. Ator vem do JWT;
 * usuario_id/session_id do atestado são comparados com o JWT e a autoridade viva.
 * digest_entrada cobre a representação canônica de TODO p_entrada sem atestado:
 * inclui request, IDs pré-gerados/path, versões, chave idempotente, envelopes
 * e digest_idempotencia. Protege a integridade desta tentativa específica.
 * digest_idempotencia tem outro propósito: comparar o comando lógico no ledger.
 * É HMAC com chave separada e secreta no servidor sobre a entrada HTTP validada
 * canônica, parâmetros alvo/versão, operação e ator comprovado. Exclui request_id,
 * IDs novos (inclusive auditoria_id) e envelopes aleatórios. Duas tentativas do
 * mesmo comando mantêm esse HMAC, mesmo com request/nonce/ciphertext distintos.
 * MAC cobre dadosAtestadoSchema inteiro; tempos, operação e digest são verificados
 * no servidor/banco. Parse estrutural não verifica assinatura, prova Google ou JWT.
 */
const assinatura = <E extends z.ZodType, S extends z.ZodType>(
  rpc: string,
  executor: ExecutorOperacao,
  transacao: TransacaoOperacao,
  perfilExigido: MapeamentoOperacao['perfilExigido'],
  entrada: E,
  dados: S,
) => ({
  rpc,
  nome: rpc,
  executor,
  contexto: executor,
  transacao,
  perfilExigido,
  argumentoSql: 'p_entrada' as const,
  entrada: entrada.superRefine((valor, ctx) => {
    const v = valor as { request_id?: string; atestado?: z.infer<typeof atestadoOperacaoSchema> };
    if (v.atestado && (v.atestado.operacao !== rpc || v.atestado.request_id !== v.request_id)) {
      ctx.addIssue({ code: 'custom', message: 'Atestado incompatível com operação ou request.' });
    }
  }),
  saida: resultadoRpcSchema(dados),
});

export const assinaturasRpc = {
  desafioGoogle: assinatura(
    'identidade.criar_desafio_login',
    'somente-servidor',
    'sessao',
    'servidor',
    z
      .object({
        desafio_id: uuidSchema,
        nonce_hash: base64UrlSchema,
        expira_em: instanteSchema,
        request_id: uuidSchema,
      })
      .strict(),
    z
      .object({ desafio_id: uuidSchema, nonce_hash: base64UrlSchema, expira_em: instanteSchema })
      .strict(),
  ),
  entrarGoogle: assinatura(
    'identidade.admitir_sessao',
    'somente-servidor',
    'admissao-sessao',
    'servidor',
    googleAdmissaoSchema,
    admissaoSessaoSaidaSchema,
  ),
  entrarTecnico: assinatura(
    'identidade.admitir_sessao_tecnica',
    'somente-servidor',
    'admissao-sessao',
    'servidor',
    tecnicaAdmissaoSchema,
    admissaoSessaoSaidaSchema,
  ),
  renovarSessao: assinatura(
    'identidade.revalidar_sessao',
    'somente-servidor',
    'sessao',
    'servidor',
    sessaoComprovadaEntradaSchema,
    admissaoSessaoSaidaSchema,
  ),
  sairSessao: assinatura(
    'identidade.revogar_sessao',
    'somente-servidor',
    'sessao',
    'servidor',
    sessaoComprovadaEntradaSchema,
    z.object({ encerrada_localmente: z.literal(true), pendencia_externa: z.boolean() }).strict(),
  ),
  sessaoAtual: assinatura(
    'api.consultar_sessao_atual',
    'jwt-do-solicitante',
    'leitura-auditada',
    'sessao-admitida',
    contextoRpcUsuarioSchema,
    admissaoSessaoSaidaSchema,
  ),
  listarConcessoes: assinatura(
    'api.listar_concessoes_equipe',
    'jwt-do-solicitante',
    'leitura-auditada',
    'administrador',
    contextoRpcUsuarioSchema
      .extend({ ...paginacao, estado: estadoConcessaoSchema.optional() })
      .strict(),
    paginaInterna(concessaoSaidaSchema),
  ),
  criarConcessao: assinatura(
    'api.criar_concessao_equipe',
    'jwt-do-solicitante',
    'mutacao-auditada',
    'administrador',
    mutacaoSchema
      .extend({
        concessao_id: uuidSchema,
        email: campoCifradoSchema,
        email_hmac: base64UrlSchema,
        perfil: perfilSchema.exclude(['familia']),
        metodo: z.literal('google_workspace'),
        motivo: campoCifradoSchema,
      })
      .strict(),
    concessaoSaidaSchema,
  ),
  revogarConcessao: assinatura(
    'api.revogar_concessao_equipe',
    'jwt-do-solicitante',
    'mutacao-auditada',
    'administrador',
    alteracaoSchema.extend({ concessao_id: uuidSchema }).strict(),
    concessaoSaidaSchema,
  ),
  atualizarAcessoUsuario: assinatura(
    'api.atualizar_acesso_usuario',
    'jwt-do-solicitante',
    'mutacao-auditada',
    'administrador',
    alteracaoSchema
      .extend({
        usuario_id: uuidSchema,
        perfil: perfilSchema.exclude(['familia']).optional(),
        ativo: z.boolean().optional(),
      })
      .strict()
      .refine((v) => v.perfil !== undefined || v.ativo !== undefined),
    z
      .object({
        usuario_id: uuidSchema,
        perfil: perfilSchema,
        ativo: z.boolean(),
        versao: versaoSchema,
      })
      .strict(),
  ),
  listarPacientes: assinatura(
    'api.listar_pacientes',
    'jwt-do-solicitante',
    'leitura-auditada',
    'sessao-admitida',
    contextoRpcUsuarioSchema.extend(paginacao).strict(),
    paginaInterna(pacienteBasicoRpcSaidaSchema),
  ),
  criarPaciente: assinatura(
    'api.criar_paciente',
    'jwt-do-solicitante',
    'mutacao-auditada',
    'administrador',
    criarPacienteRpcEntradaSchema,
    pacienteAdministrativoRpcSaidaSchema,
  ),
  consultarPaciente: assinatura(
    'api.consultar_paciente',
    'jwt-do-solicitante',
    'leitura-auditada',
    'sessao-admitida',
    contextoRpcUsuarioSchema.extend({ paciente_id: uuidSchema }).strict(),
    z.union([pacienteBasicoRpcSaidaSchema, pacienteAdministrativoRpcSaidaSchema]),
  ),
  atualizarPaciente: assinatura(
    'api.atualizar_paciente',
    'jwt-do-solicitante',
    'mutacao-auditada',
    'administrador',
    atualizarPacienteEntrada,
    pacienteAdministrativoRpcSaidaSchema,
  ),
  criarContato: assinatura(
    'api.criar_contato_paciente',
    'jwt-do-solicitante',
    'mutacao-auditada',
    'administrador',
    mutacaoSchema
      .extend({
        paciente_id: uuidSchema,
        contato_id: uuidSchema,
        tipo: z.enum(['email', 'telefone']),
        valor: campoCifradoSchema,
        aad: z
          .object({
            tabela: z.literal('cadastro.contato_paciente'),
            registro_id: uuidSchema,
            campo: z.literal('valor'),
            formato: formatoCifraSchema,
          })
          .strict(),
      })
      .strict()
      .refine((v) => v.aad.registro_id === v.contato_id && v.aad.formato === v.valor.formato),
    pacienteAdministrativoRpcSaidaSchema,
  ),
  atualizarContato: assinatura(
    'api.atualizar_contato_paciente',
    'jwt-do-solicitante',
    'mutacao-auditada',
    'administrador',
    alteracaoSchema
      .extend({
        paciente_id: uuidSchema,
        contato_id: uuidSchema,
        tipo: z.enum(['email', 'telefone']),
        valor: campoCifradoSchema,
      })
      .strict(),
    pacienteAdministrativoRpcSaidaSchema,
  ),
  criarRelacao: assinatura(
    'api.criar_relacao_paciente',
    'jwt-do-solicitante',
    'mutacao-auditada',
    'administrador',
    mutacaoSchema
      .extend({
        paciente_id: uuidSchema,
        pessoa_id: uuidSchema,
        relacao_id: uuidSchema,
        nome: campoCifradoSchema,
        contatos: z.array(novoContatoInternoSchema).max(10).optional(),
        descricao_relacao: campoCifradoSchema,
        responsabilidade: campoCifradoSchema.optional(),
      })
      .strict(),
    operacaoConcluidaSchema,
  ),
  atualizarRelacao: assinatura(
    'api.atualizar_relacao_paciente',
    'jwt-do-solicitante',
    'mutacao-auditada',
    'administrador',
    alteracaoSchema
      .extend({
        paciente_id: uuidSchema,
        relacao_id: uuidSchema,
        descricao_relacao: campoCifradoSchema.optional(),
        responsabilidade: campoCifradoSchema.nullable().optional(),
      })
      .strict()
      .refine((v) => v.descricao_relacao !== undefined || v.responsabilidade !== undefined),
    operacaoConcluidaSchema,
  ),
  criarAcessoPaciente: assinatura(
    'api.conceder_acesso_paciente',
    'jwt-do-solicitante',
    'mutacao-auditada',
    'administrador',
    mutacaoSchema
      .extend({
        paciente_id: uuidSchema,
        acesso_id: uuidSchema,
        usuario_id: uuidSchema,
        motivo: campoCifradoSchema,
      })
      .strict(),
    operacaoConcluidaSchema,
  ),
  revogarAcessoPaciente: assinatura(
    'api.revogar_acesso_paciente',
    'jwt-do-solicitante',
    'mutacao-auditada',
    'administrador',
    alteracaoSchema.extend({ paciente_id: uuidSchema, acesso_id: uuidSchema }).strict(),
    operacaoConcluidaSchema,
  ),
  consultarAuditoria: assinatura(
    'api.consultar_auditoria',
    'jwt-do-solicitante',
    'leitura-auditada',
    'administrador',
    contextoRpcUsuarioSchema
      .extend({
        ...paginacao,
        ator_id: uuidSchema.optional(),
        objeto_id: uuidSchema.optional(),
        acao: z.string().min(1).max(120).optional(),
      })
      .strict(),
    paginaInterna(eventoAuditoriaSchema),
  ),
} as const;

/** Transporte experimental exclusivamente interno, ainda incompatível com o
 * formato atual das RPCs. Não usar em runtime antes da revisão S-02 e da prova
 * de verificação dos bytes, equivalência semântica e autorização no banco.
 * O schema só valida estrutura: não autentica nem inspeciona os snapshots. */
export function criarTransporteRpcAtestadaSchema<R extends keyof typeof assinaturasRpc>(rota: R) {
  const contrato = assinaturasRpc[rota];
  if (contrato.executor !== 'jwt-do-solicitante') {
    throw new Error('A RPC não utiliza transporte atestado de usuário.');
  }
  return z
    .object({
      p_entrada: z
        .object({
          entrada: contrato.entrada,
          entrada_canonica: snapshotCanonicoSchema,
          dados_canonicos: snapshotCanonicoSchema,
        })
        .strict(),
    })
    .strict();
}

export const mapeamentoOperacoes = Object.entries(assinaturasRpc).map(([rota, contrato]) => ({
  rota,
  rpc: contrato.rpc,
  executor: contrato.executor,
  transacao: contrato.transacao,
  perfilExigido: contrato.perfilExigido,
}));
export const contratosRpc = { ...assinaturasRpc, admitirSessao: assinaturasRpc.entrarGoogle };
export type CampoCifrado = z.infer<typeof campoCifradoSchema>;
export type MetadadosAad = z.infer<typeof metadadosAadSchema>;
export type AtestadoOperacao = z.infer<typeof atestadoOperacaoSchema>;
export type ResultadoAtestacao = z.infer<typeof resultadoAtestacaoSchema>;
export type AdaptadorCifra = {
  cifrar(valor: string, aad: MetadadosAad): Promise<CampoCifrado>;
  decifrar(campo: CampoCifrado, aad: MetadadosAad): Promise<string>;
  /** Recebe os metadados e p_entrada sem atestado (incluindo IDs, versão e chave).
   * Deve conferir digest_entrada contra a representação canônica antes de assinar.
   * O consumidor futuro deve transportar os snapshots imutáveis e comprovar sua
   * equivalência à operação executada antes de autorizar qualquer escrita. */
  atestar(
    dados: z.infer<typeof dadosAtestadoSchema>,
    entrada: Record<string, unknown>,
  ): Promise<ResultadoAtestacao>;
};
export const invariantesCifra = [
  'O HTTP valida o DTO em texto claro antes de qualquer cifra.',
  'O servidor gera o UUID do registro antes de montar AAD.',
  'A RPC só aceita envelopes atestados, confere JWT, atestado e metadados AAD.',
  'A RPC autoriza e audita antes de devolver envelopes cifrados.',
  'A descriptografia ocorre somente no servidor após a autorização da RPC.',
] as const;
