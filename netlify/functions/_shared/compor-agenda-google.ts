import { processarReconciliacaoAgenda } from './agenda-google-reconciliacao-handler.ts';
import { processarEscritaAgenda } from './agenda-google-escrita-handler.ts';
import { processarLeituraAgenda } from './agenda-google-leitura-handler.ts';
import { criarCanalAgenda } from '../../../supabase/functions/_shared/agenda-google-canal.ts';
import { criarExecutorAgendaPostgres } from '../../../supabase/functions/_shared/agenda-google-postgres.ts';
import { criarRepositorioAgenda } from '../../../supabase/functions/_shared/agenda-google-repositorio.ts';
import { criarStateAgenda } from '../../../supabase/functions/_shared/agenda-google-state.ts';
import { criarExecutorCofrePostgres } from '../../../supabase/functions/_shared/cofre-vault-postgres.ts';
import { criarInfraGoogleJwks } from '../../../supabase/functions/_shared/identidade/google-jwks.ts';
import { autorizarOperacaoNativa } from './auth-nativo/operacao-protegida.ts';
import { carregarConfiguracaoAuthNativo } from './auth-nativo/cliente.ts';
import { configurarDependenciasNativas } from './configurar-dependencias-nativas.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { criarCookieAgenda } from './agenda-google-cookie.ts';
import { processarConexaoAgenda } from './agenda-google-conexao-handler.ts';

const jwks = criarInfraGoogleJwks();

/** Composição preparada, não habilitada: depende de privilégios, logs e provas reais. */
export async function comporAgendaGoogle(
  request: Request,
  fonte: NodeJS.ProcessEnv,
): Promise<Response> {
  const deps = configurarDependenciasNativas(fonte);
  try {
    const origem = carregarConfiguracaoAuthNativo(fonte).origem;
    const referencia = fonte.FFCM_AGENDA_STATE_VAULT_REFERENCIA ?? '';
    const clientId = fonte.FFCM_AGENDA_GOOGLE_CLIENT_ID ?? '';
    const clientSecret = fonte.FFCM_AGENDA_GOOGLE_CLIENT_SECRET ?? '';
    const dominio = fonte.FFCM_GOOGLE_WORKSPACE_DOMAIN ?? '';
    if (
      !/^ffcmapp\.cifra\.[a-z0-9][a-z0-9_-]{0,63}$/.test(referencia) ||
      Object.values(deps.referencias.referenciasCifra).includes(referencia) ||
      deps.referencias.referenciaHmac === referencia ||
      !clientId ||
      !clientSecret ||
      !dominio
    )
      throw new Error();
    const [cofre, textoChave] = await Promise.all([
      carregarCofreNativo(deps.pool, deps.referencias, deps.keyIdAtestado, request.signal),
      criarExecutorCofrePostgres(deps.pool).executar('identidade.ler_chave_cifra_vault', {
        p_referencia: referencia,
      }),
    ]);
    if (typeof textoChave !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(textoChave))
      throw new Error();
    const binario = atob(textoChave);
    const chave = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
    if (chave.length !== 32 || btoa(binario) !== textoChave) throw new Error();
    const executar = criarExecutorAgendaPostgres(deps.pool);
    let identidade: { usuarioId: string; sessaoId: string; subjectGoogle: string } | undefined;
    const canal = {
      async identidade() {
        return identidade ?? null;
      },
      async chamar(nome: string, argumentos: Record<string, string>) {
        if (!identidade) throw new Error();
        return criarCanalAgenda({
          identidade,
          keyId: deps.keyIdAtestado,
          atestador: cofre.atestador,
          executar,
        }).chamar(nome, argumentos);
      },
    };
    const repositorio = criarRepositorioAgenda(canal);
    const autorizar = async (pedido: Request) => {
      const autorizacao = await autorizarOperacaoNativa(pedido, fonte);
      if (autorizacao.estado !== 'autorizado') {
        identidade = undefined;
        return null;
      }
      const resultado = await autorizacao.contexto.cliente.auth.getUser();
      if (
        resultado.error ||
        autorizacao.contexto.cookiesAlterados ||
        resultado.data.user?.id !== autorizacao.sessao.usuario.id
      ) {
        identidade = undefined;
        return null;
      }
      const google =
        resultado.data.user.identities?.filter((item) => item.provider === 'google') ?? [];
      const subject = google.length === 1 ? google[0]?.identity_data?.sub : undefined;
      if (typeof subject !== 'string' || !subject) {
        identidade = undefined;
        return null;
      }
      identidade = {
        usuarioId: autorizacao.sessao.usuario.id,
        sessaoId: autorizacao.sessao.session_id,
        subjectGoogle: subject,
      };
      return identidade;
    };
    const oauth = { clientId, clientSecret, redirectUri: `${origem}/api/agenda/google/callback` };
    if (
      ['/api/agenda/google/pendencia', '/api/agenda/google/reconciliar'].includes(
        new URL(request.url).pathname,
      )
    ) {
      return await processarReconciliacaoAgenda(request, {
        origem,
        oauth,
        autorizar,
        lerCredencial: () => repositorio.lerCredencial(),
        pendencia: () => repositorio.pendencia(),
        resolverEscrita: (...args) => repositorio.resolverEscrita(...args),
      });
    }
    if (new URL(request.url).pathname === '/api/agenda/google/operacoes') {
      return await processarEscritaAgenda(request, {
        origem,
        oauth,
        autorizar,
        lerCredencial: () => repositorio.lerCredencial(),
        reservarEscrita: (...args) => repositorio.reservarEscrita(...args),
        resolverEscrita: (...args) => repositorio.resolverEscrita(...args),
      });
    }
    if (new URL(request.url).pathname === '/api/agenda/google/compromissos') {
      return await processarLeituraAgenda(request, {
        origem,
        oauth,
        autorizar,
        lerCredencial: () => repositorio.lerCredencial(),
      });
    }
    return await processarConexaoAgenda(request, {
      origem,
      retorno: '/?agenda=conectada',
      oauth,
      validacao: (nonce) => ({
        audienciaEsperada: clientId,
        dominioWorkspace: dominio,
        nonceEsperado: nonce,
        chaveDeVerificacao: jwks.chaveDeVerificacao,
      }),
      state: criarStateAgenda(chave, repositorio),
      cookie: criarCookieAgenda(chave),
      autorizar,
      async salvar(refresh, geracao, atual) {
        if (
          !identidade ||
          identidade.usuarioId !== atual.usuarioId ||
          identidade.sessaoId !== atual.sessaoId
        )
          throw new Error();
        await repositorio.salvarCredencial(refresh, geracao, atual.subjectGoogle);
      },
    });
  } finally {
    await deps.pool.end();
  }
}
