import { encaminhamentoHttp } from '../packages/contracts/src/encaminhamento-http.ts';
import type { Encaminhamento } from '../packages/contracts/src/encaminhamento.ts';
import {
  erroRespostaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };
type Nome = keyof typeof encaminhamentoHttp;

export type ServicoEncaminhamentos = {
  consultar(paciente: string, apenasSemRetorno?: boolean): Promise<Encaminhamento[]>;
  salvar(
    paciente: string,
    entrada: {
      encaminhamento_id?: string;
      versao_esperada: number;
      etapa: Encaminhamento['etapa'];
      destino: string;
      motivo: string;
      responsavel: string;
      observacao?: string;
    },
  ): Promise<Encaminhamento>;
};

/** Serviço isolado da ficha; sessão e autorização continuam sendo verificadas no servidor. */
export function criarServicoEncaminhamentosHttp(
  identidadeAtual: () => Identidade | null,
): ServicoEncaminhamentos {
  const identidade = identidadeAtual();
  if (!identidade) throw new FalhaApi('nao_autenticado', 401);
  const enviar = async (nome: Nome, entrada: unknown, paciente: string, chave?: string) => {
    const rota = encaminhamentoHttp[nome];
    const corpo = rota.entrada.parse(entrada);
    const atual = identidadeAtual();
    if (
      !atual ||
      atual.usuario_id !== identidade.usuario_id ||
      atual.session_id !== identidade.session_id
    )
      throw new FalhaApi('nao_autenticado', 401);
    let caminho: string = rota.caminho.replace(
      ':paciente_id',
      encodeURIComponent(uuidSchema.parse(paciente)),
    );
    if (rota.metodo === 'GET') {
      const parametros = new URLSearchParams();
      for (const [nomeParametro, valor] of Object.entries(corpo))
        if (valor !== undefined && valor !== null) parametros.set(nomeParametro, String(valor));
      const query = parametros.toString();
      if (query) caminho += `?${query}`;
    }
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
    consultar: async (paciente, apenasSemRetorno) =>
      (await enviar(
        'consultar',
        apenasSemRetorno ? { apenas_sem_retorno: true } : {},
        paciente,
      )) as Encaminhamento[],
    salvar: async (paciente, entrada) =>
      (await enviar('salvar', entrada, paciente, crypto.randomUUID())) as Encaminhamento,
  };
}
