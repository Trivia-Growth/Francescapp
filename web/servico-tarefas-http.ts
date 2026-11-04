import {
  erroRespostaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { registroTarefaCuidadoSchema } from '../packages/contracts/src/tarefa-cuidado.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };

/** Leitura isolada, sem persistência local nem operação de escrita. */
export function criarServicoTarefasHttp(identidadeAtual: () => Identidade | null) {
  return {
    async consultarTarefas(pacienteId: string) {
      const paciente = uuidSchema.safeParse(pacienteId);
      if (!paciente.success) throw new FalhaApi('entrada_invalida', 422);
      const sessao = identidadeAtual();
      if (!sessao || !uuidSchema.safeParse(sessao.session_id).success)
        throw new FalhaApi('nao_autenticado', 401);
      const identidade = { ...sessao };
      let fluxo: string | null;
      let modo: string | null;
      try {
        modo = sessionStorage.getItem('modo-acesso');
        fluxo = sessionStorage.getItem(modo === 'tecnica' ? 'fluxo-tecnico' : 'fluxo-google');
      } catch {
        throw new FalhaApi('nao_autenticado', 401);
      }
      if ((modo !== 'google' && modo !== 'tecnica') || !fluxo || !/^[A-Za-z0-9_-]{22}$/.test(fluxo))
        throw new FalhaApi('nao_autenticado', 401);
      try {
        const sinal = AbortSignal.timeout(20_000);
        const resposta = await fetch(
          `/api/pacientes/${encodeURIComponent(paciente.data)}/tarefas`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'x-sessao': identidade.session_id,
              'x-fluxo': fluxo,
            },
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
        const envelope: unknown = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        );
        const atual = identidadeAtual();
        if (
          !atual ||
          atual.usuario_id !== identidade.usuario_id ||
          atual.session_id !== identidade.session_id
        )
          throw new FalhaApi('nao_autenticado', 401);
        if (!resposta.ok) {
          const falha = erroRespostaSchema.safeParse(envelope);
          if (!falha.success) throw new Error();
          throw new FalhaApi(falha.data.erro.codigo, resposta.status);
        }
        return sucessoRespostaSchema(registroTarefaCuidadoSchema.array()).parse(envelope).dados;
      } catch (erro) {
        if (erro instanceof FalhaApi) throw erro;
        throw new FalhaApi('servico_indisponivel');
      }
    },
  };
}
