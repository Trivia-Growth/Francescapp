import {
  contratosRotas,
  criarErroPublico,
  statusErroHttp,
  uuidSchema,
  type AdaptadorCifra,
  type CodigoErro,
} from '@ffcmapp/contratos';
import { processarCarteiraExperimental } from './carteira-experimental.ts';
import type { criarCursorCarteira } from './cursor-carteira.ts';

type Identidade = Readonly<{ usuario_id: string; session_id: string }>;
type Contexto = Identidade & Readonly<{ jwt: string; prova: string; geracao: number }>;
type Autorizacao =
  | { estado: 'nao_autenticado' | 'sem_permissao' }
  | { estado: 'autorizado'; identidade: Identidade; jwt: string; prova: string; geracao: number };

function contextoAutorizado(valor: Extract<Autorizacao, { estado: 'autorizado' }>): Contexto {
  const usuario_id = uuidSchema.parse(valor.identidade.usuario_id).toLowerCase();
  const session_id = uuidSchema.parse(valor.identidade.session_id).toLowerCase();
  if (
    typeof valor.jwt !== 'string' ||
    valor.jwt.length < 1 ||
    valor.jwt.length > 16_384 ||
    typeof valor.prova !== 'string' ||
    !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(valor.prova) ||
    !Number.isSafeInteger(valor.geracao) ||
    valor.geracao < 1
  )
    throw new Error();
  return Object.freeze(
    Object.defineProperties(
      { usuario_id, session_id, geracao: valor.geracao },
      {
        jwt: { value: valor.jwt, enumerable: false },
        prova: { value: valor.prova, enumerable: false },
      },
    ),
  ) as Contexto;
}

/** Sem rota ativa: as portas devem validar identidade e autorizar/auditar no banco.
 * Não usar antes da S-02, provisão de chave e revisão de logs de query. */
export function criarHandlerCarteiraExperimental(portas: {
  autorizar(request: Request): Promise<Autorizacao>;
  consultar(
    identidade: Contexto,
    entrada: { limite: number; cursor?: string; request_id: string },
  ): Promise<unknown>;
  cursores: Awaited<ReturnType<typeof criarCursorCarteira>>;
  cifra: Pick<AdaptadorCifra, 'decifrar'>;
}) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const controle = new AbortController();
    const temporizador = setTimeout(() => controle.abort(), 15_000);
    const noPrazo = async <T>(executar: () => Promise<T>): Promise<T> => {
      if (controle.signal.aborted) throw new Error();
      let abortar!: () => void;
      const prazo = new Promise<never>((_, rejeitar) => {
        abortar = () => rejeitar(new Error());
        controle.signal.addEventListener('abort', abortar, { once: true });
      });
      try {
        const resultado = await Promise.race([executar(), prazo]);
        if (controle.signal.aborted) throw new Error();
        return resultado;
      } finally {
        controle.signal.removeEventListener('abort', abortar);
      }
    };
    const responder = (corpo: unknown, status: number) =>
      Response.json(corpo, {
        status,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    const falha = (codigo: CodigoErro) =>
      responder(criarErroPublico(codigo, requestId), statusErroHttp[codigo]);
    try {
      const url = new URL(request.url);
      if (request.method !== 'GET' || url.pathname !== contratosRotas.listarPacientes.caminho)
        return falha('entrada_invalida');
      const consulta: Record<string, unknown> = {};
      for (const [chave, valor] of url.searchParams) {
        if ((chave !== 'cursor' && chave !== 'limite') || Object.hasOwn(consulta, chave))
          return falha('entrada_invalida');
        consulta[chave] = chave === 'limite' && /^\d{1,3}$/.test(valor) ? Number(valor) : valor;
      }
      const validada = contratosRotas.listarPacientes.entrada.safeParse(consulta);
      if (!validada.success) return falha('entrada_invalida');
      const primeira = await noPrazo(() => portas.autorizar(request));
      if (primeira.estado !== 'autorizado') return falha(primeira.estado);
      const identidade = contextoAutorizado(primeira);
      const vinculo = { usuarioId: identidade.usuario_id, sessaoId: identidade.session_id };
      let cursor: string | undefined;
      if (validada.data.cursor !== undefined) {
        try {
          cursor = await noPrazo(() =>
            portas.cursores.abrir(validada.data.cursor as string, vinculo),
          );
        } catch {
          if (controle.signal.aborted) throw new Error();
          return falha('entrada_invalida');
        }
      }
      const resposta = await noPrazo(() =>
        portas.consultar(identidade, {
          limite: validada.data.limite,
          ...(cursor === undefined ? {} : { cursor }),
          request_id: requestId,
        }),
      );
      const resultado = await noPrazo(() =>
        processarCarteiraExperimental(
          resposta,
          { requestId, limite: validada.data.limite, signal: controle.signal },
          portas.cifra,
        ),
      );
      if (!resultado.ok) return falha(resultado.erro.codigo);
      const proximo_cursor =
        resultado.dados.proximo_cursor === null
          ? null
          : await noPrazo(() =>
              portas.cursores.emitir(resultado.dados.proximo_cursor as string, vinculo),
            );
      const segunda = await noPrazo(() => portas.autorizar(request));
      if (segunda.estado !== 'autorizado') return falha(segunda.estado);
      const revalidada = contextoAutorizado(segunda);
      if (
        revalidada.usuario_id !== identidade.usuario_id ||
        revalidada.session_id !== identidade.session_id ||
        revalidada.geracao !== identidade.geracao ||
        revalidada.prova !== identidade.prova
      )
        return falha('nao_autenticado');
      return responder(
        { dados: { ...resultado.dados, proximo_cursor }, request_id: requestId },
        200,
      );
    } catch {
      return falha('servico_indisponivel');
    } finally {
      clearTimeout(temporizador);
    }
  };
}
