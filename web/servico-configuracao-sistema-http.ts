import { contratosRotas } from '../packages/contracts/src/rotas.ts';
import type {
  ConfiguracaoSistema,
  ValorConfiguracao,
} from '../packages/contracts/src/configuracao-sistema.ts';
import {
  erroRespostaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };

export type ServicoConfiguracaoSistema = {
  listar(): Promise<ConfiguracaoSistema[]>;
  gravar(entrada: {
    configuracao_chave: string;
    valor: ValorConfiguracao;
    versao_esperada: number;
  }): Promise<ConfiguracaoSistema>;
};

/** Serviço isolado da tela de administração; sessão, perfil e atestado continuam sendo
 * verificados no servidor e no banco. */
export function criarServicoConfiguracaoSistemaHttp(
  identidadeAtual: () => Identidade | null,
): ServicoConfiguracaoSistema {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  const enviar = async (
    rota:
      | typeof contratosRotas.listarConfiguracaoSistema
      | typeof contratosRotas.gravarConfiguracaoSistema,
    entrada: unknown,
    chave?: string,
  ) => {
    const corpo = rota.entrada.parse(entrada);
    const atual = identidadeAtual();
    if (
      !atual ||
      atual.usuario_id !== identidade.usuario_id ||
      atual.session_id !== identidade.session_id
    )
      throw new FalhaApi('nao_autenticado', 401);
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
      resposta = await fetch(rota.caminho, {
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
      const envelope: unknown = await resposta.json();
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
    listar: async () =>
      (await enviar(contratosRotas.listarConfiguracaoSistema, {})) as ConfiguracaoSistema[],
    gravar: async (entrada) =>
      (await enviar(
        contratosRotas.gravarConfiguracaoSistema,
        entrada,
        crypto.randomUUID(),
      )) as ConfiguracaoSistema,
  };
}
