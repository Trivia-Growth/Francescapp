import { realizacaoCompromissoHttp } from '../packages/contracts/src/realizacao-compromisso-http.ts';
import type {
  RealizacaoCompromisso,
  RegistrarRealizacao,
} from '../packages/contracts/src/realizacao-compromisso.ts';
import { sucessoRespostaSchema, erroRespostaSchema } from '../packages/contracts/src/comum.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.js';

export type PedidoEvento = { evento_id: string; fim?: string | null };

export type ServicoRealizacaoCompromisso = {
  consultar(eventos: readonly PedidoEvento[]): Promise<readonly RealizacaoCompromisso[]>;
  registrar(pedido: RegistrarRealizacao): Promise<readonly RealizacaoCompromisso[]>;
};

/** Serviço isolado do registro de realização (FR-024). A autorização e a audiência são do
 * servidor; aqui só há transporte, validação de contrato e tradução de falha. */
export function criarServicoRealizacaoCompromissoHttp(
  cabecalhos: () => Headers,
): ServicoRealizacaoCompromisso {
  const enviar = async (nome: 'consultar' | 'registrar', corpo: unknown) => {
    const rota = realizacaoCompromissoHttp[nome];
    const entrada = rota.entrada.parse(corpo);
    let headers: Headers;
    try {
      headers = cabecalhos();
    } catch {
      throw new FalhaApi('nao_autenticado', 401);
    }
    headers.set('Content-Type', 'application/json');
    if (nome === 'registrar') headers.set('x-chave-idempotencia', crypto.randomUUID());
    let resposta: Response;
    try {
      resposta = await fetch(rota.caminho, {
        method: rota.metodo,
        headers,
        body: JSON.stringify(entrada),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20_000),
      });
      const envelope: unknown = await resposta.json();
      if (!resposta.ok) {
        const erro = erroRespostaSchema.safeParse(envelope);
        if (!erro.success || statusErroHttp[erro.data.erro.codigo] !== resposta.status)
          throw new Error();
        throw new FalhaApi(erro.data.erro.codigo, resposta.status);
      }
      return sucessoRespostaSchema(rota.saida).parse(envelope).dados.compromissos;
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi('servico_indisponivel');
    }
  };
  return {
    consultar: (eventos) => enviar('consultar', { eventos }),
    registrar: (pedido) => enviar('registrar', pedido),
  };
}
