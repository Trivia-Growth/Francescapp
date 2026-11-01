import { entradaSessaoComProvaRespostaSchema } from '../../../../packages/contracts/src/identidade.ts';
import { criarErroPublicoSemCampos } from '../../../../packages/contracts/src/erros.ts';
import type { FonteDeConfiguracao } from '../../../../supabase/functions/_shared/configuracao.ts';
import type { ConfiguracaoJwtSessao } from '../../../../supabase/functions/_shared/sessao/nucleo.ts';
import { criarTransporteHttpSessao } from './http.ts';

const provaValida = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
class ErroProvaSessao extends Error {
  constructor() {
    super('Prova de sessão inválida.');
  }
}

function validarProva(prova: unknown, geracao: unknown): { prova: string; geracao: number } {
  if (
    typeof prova !== 'string' ||
    !provaValida.test(prova) ||
    typeof geracao !== 'number' ||
    !Number.isSafeInteger(geracao) ||
    geracao < 1
  )
    throw new ErroProvaSessao();
  return { prova, geracao };
}

function lerProva(request: Request) {
  const texto = request.headers.get('x-ffcm-geracao-sessao');
  if (!texto || !/^[1-9][0-9]{0,15}$/.test(texto)) throw new ErroProvaSessao();
  return validarProva(request.headers.get('x-ffcm-prova-sessao'), Number(texto));
}

/** Transporte experimental; não verifica a prova no banco e não autoriza operações. */
export function criarTransporteHttpSessaoComProva(
  fonte: FonteDeConfiguracao,
  opcoes: Readonly<{ configuracaoJwt: ConfiguracaoJwtSessao }>,
) {
  const transporte = criarTransporteHttpSessao(fonte, opcoes);
  const contextos = new WeakMap<
    object,
    { interno: object; prova: string; geracao: number; rota: 'renovarSessao' | 'sairSessao' }
  >();
  async function adicionarProva(resposta: Response, prova: string, geracao: number) {
    const envelope = await resposta.json();
    const dados = entradaSessaoComProvaRespostaSchema.parse({
      ...envelope.dados,
      prova_sessao: prova,
      geracao_sessao: geracao,
    });
    return Response.json(
      { dados, request_id: envelope.request_id },
      { status: resposta.status, headers: resposta.headers },
    );
  }
  async function responderEntrada(
    entrada: Readonly<{ sessao: unknown; accessToken: string; prova: string; geracao: number }>,
  ) {
    const { prova, geracao } = validarProva(entrada.prova, entrada.geracao);
    if (geracao !== 1) throw new TypeError('Prova de sessão inválida.');
    return adicionarProva(
      await transporte.responderEntrada({
        sessao: entrada.sessao,
        accessToken: entrada.accessToken,
      }),
      prova,
      geracao,
    );
  }
  async function lerComandoComCookie(request: Request, rota: 'renovarSessao' | 'sairSessao') {
    const { prova, geracao } = lerProva(request);
    const interno = await transporte.lerComandoComCookie(request, rota);
    const contexto = Object.freeze(
      Object.defineProperty({ ...interno, geracao }, 'prova', { value: prova, enumerable: false }),
    ) as typeof interno & { readonly prova: string; readonly geracao: number };
    contextos.set(contexto, { interno, prova, geracao, rota });
    return contexto;
  }
  async function lerIdentidadeDaConsulta(request: Request) {
    const prova = lerProva(request);
    const identidade = await transporte.lerIdentidadeDaConsulta(request);
    return Object.freeze(
      Object.defineProperties(
        { ...identidade, geracao: prova.geracao },
        {
          jwt: { value: identidade.jwt, enumerable: false },
          prova: { value: prova.prova, enumerable: false },
        },
      ),
    ) as typeof identidade & { readonly prova: string; readonly geracao: number };
  }
  async function responderRenovacao(
    entrada: Readonly<{ sessao: unknown; accessToken: string; prova: string; geracao: number }>,
    contexto: object,
  ) {
    const anterior = contextos.get(contexto);
    if (!anterior || anterior.rota !== 'renovarSessao')
      throw new TypeError('Contexto de sessão inválido.');
    contextos.delete(contexto);
    const { prova, geracao } = validarProva(entrada.prova, entrada.geracao);
    if (geracao !== anterior.geracao + 1 || prova === anterior.prova)
      throw new TypeError('Prova de sessão inválida.');
    return adicionarProva(
      await transporte.responderRenovacao(
        { sessao: entrada.sessao, accessToken: entrada.accessToken },
        anterior.interno,
      ),
      prova,
      geracao,
    );
  }
  function responderSaida(resultado: unknown, contexto: object) {
    const anterior = contextos.get(contexto);
    if (!anterior || anterior.rota !== 'sairSessao')
      throw new TypeError('Contexto de sessão inválido.');
    contextos.delete(contexto);
    return transporte.responderSaida(resultado, anterior.interno);
  }
  return Object.freeze({
    responderEntrada,
    lerComandoComCookie,
    lerIdentidadeDaConsulta,
    responderRenovacao,
    responderSaida,
    responderFalha: (erro: unknown) =>
      erro instanceof ErroProvaSessao
        ? Response.json(criarErroPublicoSemCampos('nao_autenticado', crypto.randomUUID()), {
            status: 401,
            headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
          })
        : transporte.responderFalha(erro),
  });
}
