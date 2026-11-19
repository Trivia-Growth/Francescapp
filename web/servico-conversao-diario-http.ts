import {
  erroRespostaSchema,
  sucessoRespostaSchema,
  uuidSchema,
  chaveIdempotenciaSchema,
} from '../packages/contracts/src/comum.ts';
import {
  converterDiarioTarefaSchema,
  reciboConversaoDiarioTarefaSchema,
  type ConverterDiarioTarefa,
} from '../packages/contracts/src/conversao-diario-tarefa.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };

/** Nenhum conteúdo persiste no navegador. Consulta e mutação seguem uma única rota atômica. */
export function criarServicoConversaoDiarioHttp(identidadeAtual: () => Identidade | null) {
  const inicial = identidadeAtual();
  if (!inicial) throw new FalhaApi('nao_autenticado', 401);
  const identidade = { ...inicial };
  const controles = new Set<AbortController>();
  let ativa = true;
  const verificar = () => {
    const atual = identidadeAtual();
    if (
      !ativa ||
      !atual ||
      atual.usuario_id !== identidade.usuario_id ||
      atual.session_id !== identidade.session_id
    )
      throw new FalhaApi('nao_autenticado', 401);
  };
  async function enviar(
    pacienteId: string,
    origemId: string,
    entrada?: ConverterDiarioTarefa,
    chave?: string,
  ) {
    verificar();
    const paciente = uuidSchema.parse(pacienteId);
    const origem = uuidSchema.parse(origemId);
    const corpo = entrada ? converterDiarioTarefaSchema.parse(entrada) : undefined;
    if (corpo && !chaveIdempotenciaSchema.safeParse(chave).success)
      throw new FalhaApi('entrada_invalida', 400);
    const controle = new AbortController();
    controles.add(controle);
    try {
      const modo = sessionStorage.getItem('modo-acesso');
      const fluxo = sessionStorage.getItem(modo === 'interno' ? 'fluxo-interno' : 'fluxo-google');
      if ((modo !== 'google' && modo !== 'interno') || !fluxo || !/^[A-Za-z0-9_-]{22}$/.test(fluxo))
        throw new FalhaApi('nao_autenticado', 401);
      const sinal = AbortSignal.any([controle.signal, AbortSignal.timeout(25_000)]);
      const resposta = await fetch(
        `/api/pacientes/${encodeURIComponent(paciente)}/diario/${encodeURIComponent(origem)}/conversao-tarefa`,
        {
          method: corpo ? 'POST' : 'GET',
          headers: {
            Accept: 'application/json',
            'x-sessao': identidade.session_id,
            'x-fluxo': fluxo,
            ...(corpo
              ? { 'Content-Type': 'application/json', 'x-chave-idempotencia': chave ?? '' }
              : {}),
          },
          ...(corpo ? { body: JSON.stringify(corpo) } : {}),
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: sinal,
        },
      );
      if (!resposta.headers.get('content-type')?.includes('application/json') || !resposta.body)
        throw new Error();
      const leitor = resposta.body.getReader();
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      let abortar!: () => void;
      const cancelamento = new Promise<never>((_, rejeitar) => {
        abortar = () => rejeitar(new Error('Consulta interrompida'));
        sinal.addEventListener('abort', abortar, { once: true });
      });
      try {
        if (sinal.aborted) throw new Error();
        while (true) {
          const parte = await Promise.race([leitor.read(), cancelamento]);
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          if (tamanho > 16_384) throw new Error();
          partes.push(parte.value);
        }
      } catch (erro) {
        void leitor.cancel().catch(() => {});
        throw erro;
      } finally {
        sinal.removeEventListener('abort', abortar);
        leitor.releaseLock();
      }
      const bytes = new Uint8Array(tamanho);
      let posicao = 0;
      for (const parte of partes) {
        bytes.set(parte, posicao);
        posicao += parte.byteLength;
      }
      const bruto: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      verificar();
      if (!resposta.ok) {
        const erro = erroRespostaSchema.parse(bruto);
        if (statusErroHttp[erro.erro.codigo] !== resposta.status) throw new Error();
        throw new FalhaApi(erro.erro.codigo, resposta.status);
      }
      const recibo = sucessoRespostaSchema(reciboConversaoDiarioTarefaSchema.nullable()).parse(
        bruto,
      ).dados;
      if (corpo && !recibo) throw new Error();
      if (recibo && (recibo.paciente_id !== paciente || recibo.origem_id !== origem))
        throw new Error();
      return recibo;
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi('servico_indisponivel');
    } finally {
      controles.delete(controle);
    }
  }
  return {
    consultar: (paciente: string, origem: string) => enviar(paciente, origem),
    converter: async (
      paciente: string,
      origem: string,
      entrada: ConverterDiarioTarefa,
      chave: string,
    ) => {
      const recibo = await enviar(paciente, origem, entrada, chave);
      if (!recibo) throw new FalhaApi('servico_indisponivel');
      return recibo;
    },
    desmontar: () => {
      ativa = false;
      for (const controle of controles) controle.abort();
      controles.clear();
    },
  };
}
