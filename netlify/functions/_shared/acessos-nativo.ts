import { z } from 'zod';
import {
  acessoPrivadoSchema,
  acessoSchema,
  criarAcessoSchema,
  listaAcessosPrivadaSchema,
  listaAcessosSchema,
} from '../../../packages/contracts/src/acessos.ts';
import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
  type CampoCifrado,
  type MetadadosAad,
} from '../../../packages/contracts/src/rpc.ts';
import type { User, AdminUserAttributes } from '@supabase/supabase-js';

type Identidade = { usuario_id: string; session_id: string; perfil: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'entrada_invalida' | 'nao_autenticado' | 'servico_indisponivel' };
export type ComandoAcessos =
  | { operacao: 'listar'; cursor_id?: string }
  | { operacao: 'consultar'; operacao_id: string }
  | { operacao: 'criar'; entrada: unknown };
export type PortasAcessos = {
  autorizar(): Promise<Autorizacao>;
  cifra: {
    cifrar(valor: string, aad: MetadadosAad): Promise<CampoCifrado>;
    decifrar(valor: CampoCifrado, aad: MetadadosAad): Promise<string>;
    calcularHmac(valor: string): Promise<string>;
  };
  atestador: {
    canonicalizar(valor: unknown): string;
    atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<unknown>;
  };
  metadados(requestId: string): {
    key_id: string;
    emitido_em: string;
    expira_em: string;
    request_id: string;
  };
  executar(transporte: {
    entrada: Record<string, unknown>;
    entrada_canonica: string;
    dados_canonicos: string;
  }): Promise<unknown>;
  auth: {
    criar(
      atributos: AdminUserAttributes,
    ): Promise<{ user: User | null; conflito: boolean; recusado?: boolean }>;
    consultar(usuarioId: string): Promise<User | null>;
  };
};
const respostaRpcSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.unknown(),
      request_id: uuidSchema,
      repeticao: z.boolean(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z.object({ codigo: z.string() }).strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** Uma reserva nova permite um único create. Repetição só lê UUID reservado.
 * Senha não participa do digest, cifra, transporte SQL, recibo ou erro. */
export async function operarAcessosNativo(
  request: Request,
  comando: ComandoAcessos,
  portas: PortasAcessos,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  let iniciada = false;
  const erro = (codigo: CodigoErro) =>
    Response.json(criarErroPublicoSemCampos(codigo, requestId), {
      status: statusErroHttp[codigo],
      headers,
    });
  try {
    const inicial = await portas.autorizar();
    if (inicial.estado !== 'autorizado') return erro(inicial.estado);
    if (inicial.identidade.perfil !== 'administrador') return erro('sem_permissao');
    const identidade = inicial.identidade;
    const vigente = async () => {
      const atual = await portas.autorizar();
      return (
        !request.signal.aborted &&
        atual.estado === 'autorizado' &&
        atual.identidade.perfil === 'administrador' &&
        atual.identidade.usuario_id === identidade.usuario_id &&
        atual.identidade.session_id === identidade.session_id
      );
    };
    const executar = async (operacao: string, campos: Record<string, unknown>) => {
      if (!(await vigente())) throw new Error();
      const entrada = { ...campos, request_id: requestId };
      const metadados = {
        ...portas.metadados(requestId),
        usuario_id: identidade.usuario_id,
        session_id: identidade.session_id,
        operacao,
      };
      const prova = resultadoAtestacaoSchema.parse(
        await portas.atestador.atestarEntrada(metadados, entrada),
      );
      const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
      if (
        portas.atestador.canonicalizar(entrada) !== prova.entradaCanonica ||
        Object.entries(metadados).some(([k, v]) => dados[k as keyof typeof dados] !== v)
      )
        throw new Error();
      const resposta = respostaRpcSchema.parse(
        await portas.executar({
          entrada: { ...entrada, atestado: { ...dados, mac: prova.atestado.mac } },
          entrada_canonica: prova.entradaCanonica,
          dados_canonicos: prova.dadosCanonicos,
        }),
      );
      if (resposta.request_id !== requestId || request.signal.aborted) throw new Error();
      return resposta;
    };
    const abrir = async (valor: z.infer<typeof acessoPrivadoSchema>) => {
      const aad = {
        tabela: 'identidade.acesso_gerenciado' as const,
        registro_id: valor.operacao_id,
        formato: 1 as const,
      };
      const nome = await portas.cifra.decifrar(valor.nome_cifrado, { ...aad, campo: 'nome' });
      const email = await portas.cifra.decifrar(valor.email_cifrado, { ...aad, campo: 'email' });
      return acessoSchema.parse({
        operacao_id: valor.operacao_id,
        usuario_id: valor.usuario_id,
        nome,
        email,
        funcao: valor.funcao,
        metodo: valor.metodo,
        estado: valor.estado,
        criado_em: valor.criado_em,
        criado_por_usuario_id: valor.criado_por_usuario_id,
      });
    };
    const publico = async (valor: z.infer<typeof acessoPrivadoSchema> | null) => {
      if (!(await vigente())) return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
      const dados = valor ? await abrir(valor) : null;
      if (!(await vigente())) return erro(iniciada ? 'pendencia_externa' : 'nao_autenticado');
      return Response.json({ dados, request_id: requestId }, { headers });
    };
    if (comando.operacao === 'listar') {
      const resposta = await executar(
        'api.listar_acessos_gerenciados',
        comando.cursor_id ? { cursor_id: uuidSchema.parse(comando.cursor_id) } : {},
      );
      if (!resposta.ok)
        return erro(
          resposta.erro.codigo === 'sem_permissao' ? 'sem_permissao' : 'servico_indisponivel',
        );
      const pagina = listaAcessosPrivadaSchema.parse(resposta.dados);
      if (
        new Set(pagina.itens.map((item) => item.operacao_id)).size !== pagina.itens.length ||
        !(await vigente())
      )
        return erro('nao_autenticado');
      const dados = listaAcessosSchema.parse({
        itens: await Promise.all(pagina.itens.map(abrir)),
        proximo_cursor: pagina.proximo_cursor,
      });
      if (!(await vigente())) return erro('nao_autenticado');
      return Response.json({ dados, request_id: requestId }, { headers });
    }
    let reservado: z.infer<typeof acessoPrivadoSchema>;
    let senha: string | undefined;
    let email: string | undefined;
    let podeCriar = false;
    if (comando.operacao === 'criar') {
      const dados = criarAcessoSchema.safeParse(comando.entrada);
      const chave = chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'));
      if (!dados.success || !chave.success) return erro('entrada_invalida');
      const corpo = dados.data;
      const operacaoId = corpo.operacao_id.toLowerCase();
      email = corpo.email.toLowerCase();
      const aad = {
        tabela: 'identidade.acesso_gerenciado' as const,
        registro_id: operacaoId,
        formato: 1 as const,
      };
      // Projeção explícita: senha não entra sequer no comando lógico persistido.
      const logico = {
        operacao_id: operacaoId,
        nome: corpo.nome,
        email,
        funcao: corpo.funcao,
        metodo: corpo.metodo,
        motivo: corpo.motivo,
      };
      const entrada = {
        operacao_id: operacaoId,
        usuario_id: corpo.metodo === 'interno' ? crypto.randomUUID() : undefined,
        nome_cifrado: await portas.cifra.cifrar(corpo.nome, { ...aad, campo: 'nome' }),
        email_cifrado: await portas.cifra.cifrar(email, { ...aad, campo: 'email' }),
        motivo_cifrado: await portas.cifra.cifrar(corpo.motivo, { ...aad, campo: 'motivo' }),
        email_concessao_cifrado: await portas.cifra.cifrar(email, {
          tabela: 'identidade.concessao_equipe',
          registro_id: operacaoId,
          campo: 'email',
          formato: 1,
        }),
        motivo_concessao_cifrado: await portas.cifra.cifrar(corpo.motivo, {
          tabela: 'identidade.concessao_equipe',
          registro_id: operacaoId,
          campo: 'motivo',
          formato: 1,
        }),
        dominio_email: corpo.metodo === 'google_workspace' ? email.split('@')[1] : undefined,
        email_hmac: await portas.cifra.calcularHmac(`email-concessao:${email}`),
        funcao: corpo.funcao,
        metodo: corpo.metodo,
        chave_idempotencia: chave.data,
        digest_idempotencia: await portas.cifra.calcularHmac(
          `ffcmapp:acessos:idempotencia:v1:${portas.atestador.canonicalizar(logico)}`,
        ),
      };
      iniciada = true;
      const resposta = await executar(
        'api.reservar_acesso_gerenciado',
        Object.fromEntries(Object.entries(entrada).filter(([, v]) => v !== undefined)),
      );
      if (!resposta.ok)
        return erro(
          resposta.erro.codigo === 'conflito_idempotencia'
            ? 'conflito_idempotencia'
            : resposta.erro.codigo === 'sem_permissao'
              ? 'sem_permissao'
              : resposta.erro.codigo === 'entrada_invalida'
                ? 'entrada_invalida'
                : resposta.erro.codigo === 'conflito'
                  ? 'conflito'
                  : 'pendencia_externa',
        );
      reservado = acessoPrivadoSchema.parse(resposta.dados);
      if (
        reservado.operacao_id !== operacaoId ||
        reservado.metodo !== corpo.metodo ||
        reservado.funcao !== corpo.funcao
      )
        throw new Error();
      podeCriar = resposta.repeticao === false && reservado.estado === 'reservado';
      senha = corpo.metodo === 'interno' ? corpo.senha : undefined;
    } else {
      const operacaoId = uuidSchema.parse(comando.operacao_id).toLowerCase();
      const resposta = await executar('api.consultar_operacao_acesso', { operacao_id: operacaoId });
      if (!resposta.ok)
        return erro(
          resposta.erro.codigo === 'sem_permissao' ? 'sem_permissao' : 'servico_indisponivel',
        );
      if (resposta.dados === null) return publico(null);
      reservado = acessoPrivadoSchema.parse(resposta.dados);
      if (reservado.operacao_id !== operacaoId) throw new Error();
    }
    if (reservado.metodo !== 'interno' || !reservado.usuario_id || reservado.estado !== 'reservado')
      return publico(reservado);
    if (!(await vigente())) return erro('pendencia_externa');
    let usuario: User | null;
    if (podeCriar && email && senha) {
      // Única escrita externa. Nunca repetir nem executar updateUserById após colisão.
      const resultado = await portas.auth.criar({
        id: reservado.usuario_id,
        email,
        password: senha,
        email_confirm: false,
        app_metadata: { ffcm_provisionamento_id: reservado.operacao_id },
      });
      senha = undefined;
      usuario = resultado.user;
      if (resultado.conflito || resultado.recusado) {
        const confirmado = await executar('api.confirmar_acesso_gerenciado', {
          operacao_id: reservado.operacao_id,
          usuario_id: reservado.usuario_id,
          resultado_auth: resultado.recusado ? 'recusado' : 'conflito',
        });
        if (!confirmado.ok) throw new Error();
        const terminal = acessoPrivadoSchema.parse(confirmado.dados);
        if (
          terminal.operacao_id !== reservado.operacao_id ||
          terminal.usuario_id !== reservado.usuario_id ||
          terminal.estado !== (resultado.recusado ? 'falha_confirmada' : 'conflito')
        )
          throw new Error();
        return publico(terminal);
      }
    } else {
      // Metadados persistidos seguem consultáveis mesmo sem Authadmin disponível.
      try {
        usuario = await portas.auth.consultar(reservado.usuario_id);
      } catch {
        return publico(reservado);
      }
    }
    if (!usuario) return publico(reservado);
    const emailReservado =
      email ??
      (await portas.cifra.decifrar(reservado.email_cifrado, {
        tabela: 'identidade.acesso_gerenciado',
        registro_id: reservado.operacao_id,
        campo: 'email',
        formato: 1,
      }));
    if (
      usuario.id !== reservado.usuario_id ||
      usuario.app_metadata.ffcm_provisionamento_id !== reservado.operacao_id ||
      usuario.email?.trim().toLowerCase() !== emailReservado.toLowerCase()
    )
      throw new Error();
    iniciada = true;
    // Confirmação do endereço vem da bridge Auth no banco, nunca de flag do chamador.
    const confirmado = await executar('api.confirmar_acesso_gerenciado', {
      operacao_id: reservado.operacao_id,
      usuario_id: usuario.id,
      resultado_auth: 'criado',
    });
    if (!confirmado.ok) throw new Error();
    const final = acessoPrivadoSchema.parse(confirmado.dados);
    if (final.operacao_id !== reservado.operacao_id || final.usuario_id !== reservado.usuario_id)
      throw new Error();
    return publico(final);
  } catch {
    return erro(iniciada ? 'pendencia_externa' : 'servico_indisponivel');
  }
}
