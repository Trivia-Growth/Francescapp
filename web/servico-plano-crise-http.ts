import { planoCriseHttp } from '../packages/contracts/src/plano-crise-http.ts';
import type { PlanoCrise, PlanoCriseConteudo } from '../packages/contracts/src/plano-crise.ts';
import {
  sucessoRespostaSchema,
  erroRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { FalhaApi } from './api.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import type { ServicoPlanoCrise } from './plano-crise.ts';

type Identidade = { usuario_id: string; session_id: string };
type Nome = keyof typeof planoCriseHttp;

/** Serviço isolado do plano de crise (FR-020). Autorização é do servidor; aqui só
 * verificamos que a identidade não trocou entre o começo e o fim da chamada. */
export function criarServicoPlanoCriseHttp(
  identidadeAtual: () => Identidade | null,
): ServicoPlanoCrise {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  const enviar = async (nome: Nome, entrada: unknown, paciente: string, chave?: string) => {
    const rota = planoCriseHttp[nome];
    const corpo = rota.entrada.parse(entrada);
    const atual = identidadeAtual();
    if (
      !atual ||
      atual.usuario_id !== identidade.usuario_id ||
      atual.session_id !== identidade.session_id
    )
      throw new FalhaApi('nao_autenticado', 401);
    const caminho = rota.caminho.replace(
      ':paciente_id',
      encodeURIComponent(uuidSchema.parse(paciente)),
    );
    const headers = new Headers({ Accept: 'application/json', 'x-sessao': atual.session_id });
    let modo: string | null;
    let fluxo: string | null;
    try {
      modo = sessionStorage.getItem('modo-acesso');
      fluxo = sessionStorage.getItem(modo === 'tecnica' ? 'fluxo-tecnico' : 'fluxo-google');
    } catch {
      throw new FalhaApi('nao_autenticado', 401);
    }
    if ((modo !== 'google' && modo !== 'tecnica') || !fluxo || !/^[A-Za-z0-9_-]{22}$/.test(fluxo))
      throw new FalhaApi('nao_autenticado', 401);
    headers.set('x-fluxo', fluxo);
    if (chave) headers.set('x-chave-idempotencia', uuidSchema.parse(chave));
    if (rota.metodo !== 'GET') headers.set('Content-Type', 'application/json');
    let resposta: Response;
    try {
      resposta = await fetch(caminho, {
        method: rota.metodo,
        headers,
        ...(rota.metodo === 'GET' ? {} : { body: JSON.stringify(corpo) }),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20_000),
      });
      if (rota.metodo !== 'GET' && resposta.status === 202) throw new Error();
      if (!resposta.headers.get('content-type')?.includes('application/json')) throw new Error();
      if (!resposta.body) throw new Error();
      const leitor = resposta.body.getReader();
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      try {
        while (true) {
          const parte = await leitor.read();
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          if (tamanho > 1_048_576) throw new Error();
          partes.push(parte.value);
        }
      } catch (erro) {
        void leitor.cancel().catch(() => {});
        throw erro;
      } finally {
        leitor.releaseLock();
      }
      const bytes = new Uint8Array(tamanho);
      let posicao = 0;
      for (const parte of partes) {
        bytes.set(parte, posicao);
        posicao += parte.length;
      }
      const envelope: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const depois = identidadeAtual();
      if (
        !depois ||
        depois.usuario_id !== identidade.usuario_id ||
        depois.session_id !== identidade.session_id
      )
        throw new FalhaApi('nao_autenticado', rota.metodo === 'GET' ? 401 : 0, true);
      if (!resposta.ok) {
        const erro = erroRespostaSchema.safeParse(envelope);
        if (
          !erro.success ||
          (rota.metodo !== 'GET' && statusErroHttp[erro.data.erro.codigo] !== resposta.status)
        )
          throw new Error();
        throw new FalhaApi(erro.data.erro.codigo, resposta.status);
      }
      return sucessoRespostaSchema(rota.saida).parse(envelope).dados;
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi('servico_indisponivel');
    }
  };
  return {
    consultar: async (paciente) => (await enviar('consultar', {}, paciente)) as PlanoCrise | null,
    salvar: async (paciente, versaoEsperada, conteudo: PlanoCriseConteudo) =>
      (await enviar(
        'salvar',
        { versao_esperada: versaoEsperada, conteudo },
        paciente,
        crypto.randomUUID(),
      )) as PlanoCrise,
    aprovar: async (paciente, registroId, versao) =>
      (await enviar(
        'aprovar',
        { registro_id: registroId, versao },
        paciente,
        crypto.randomUUID(),
      )) as PlanoCrise,
  };
}
