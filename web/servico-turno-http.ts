import type { z } from 'zod';
import {
  chaveIdempotenciaSchema,
  erroRespostaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import {
  aberturaTurnoSchema,
  turnoSchema,
  type AberturaTurno,
} from '../packages/contracts/src/turno.ts';
import { consultaTurnoAtualHttp } from '../packages/contracts/src/turno-http.ts';
import { contratosBarreiraTurnoHttp } from '../packages/contracts/src/turno-barreira-servidor.ts';
import {
  reservarTurnoSchema,
  encerrarTurnoSchema,
  reconhecerTurnoSchema,
} from '../packages/contracts/src/turno-barreira.ts';
import { FalhaApi } from './api.ts';

type Identidade = { usuario_id: string; session_id: string };

/** Sem cache ou armazenamento de conteúdo. Autorização continua no servidor/banco. */
export function criarServicoTurnoHttp(identidadeAtual: () => Identidade | null) {
  const inicial = identidadeAtual();
  const identidadeMontagem = inicial ? { ...inicial } : null;
  async function solicitar<T>(
    caminho: string,
    saida: z.ZodType<T>,
    corpo?: unknown,
    chave?: string,
  ): Promise<T> {
    const sessao = identidadeAtual();
    if (
      !sessao ||
      !identidadeMontagem ||
      sessao.usuario_id !== identidadeMontagem.usuario_id ||
      sessao.session_id !== identidadeMontagem.session_id ||
      !uuidSchema.safeParse(sessao.session_id).success ||
      !uuidSchema.safeParse(sessao.usuario_id).success
    )
      throw new FalhaApi('nao_autenticado', 401);
    const identidade = { ...sessao };
    let fluxo: string | null;
    try {
      const modo = sessionStorage.getItem('modo-acesso');
      if (modo !== 'google' && modo !== 'tecnica') throw new Error();
      fluxo = sessionStorage.getItem(modo === 'tecnica' ? 'fluxo-tecnico' : 'fluxo-google');
      if (!fluxo || !/^[A-Za-z0-9_-]{22}$/.test(fluxo)) throw new Error();
    } catch {
      throw new FalhaApi('nao_autenticado', 401);
    }
    const mutacao = corpo !== undefined;
    let enviada = false;
    try {
      const sinal = AbortSignal.timeout(20_000);
      enviada = mutacao;
      const resposta = await fetch(caminho, {
        method: mutacao ? 'POST' : 'GET',
        headers: {
          Accept: 'application/json',
          'x-sessao': identidade.session_id,
          'x-fluxo': fluxo,
          ...(mutacao ? { 'Content-Type': 'application/json' } : {}),
          ...(chave ? { 'x-chave-idempotencia': chave } : {}),
        },
        ...(mutacao ? { body: JSON.stringify(corpo) } : {}),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: sinal,
      });
      if (
        resposta.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json' ||
        !resposta.body
      )
        throw new Error();
      const leitor = resposta.body.getReader();
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      let abortar!: () => void;
      const expiracao = new Promise<never>((_, rejeitar) => {
        abortar = () => rejeitar(new Error());
        sinal.addEventListener('abort', abortar, { once: true });
      });
      try {
        if (sinal.aborted) throw new Error();
        while (true) {
          const parte = await Promise.race([leitor.read(), expiracao]);
          if (sinal.aborted) throw new Error();
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          if (tamanho > 65_536) throw new Error();
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
        posicao += parte.length;
      }
      const envelope: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const atual = identidadeAtual();
      if (
        !atual ||
        atual.usuario_id !== identidade.usuario_id ||
        atual.session_id !== identidade.session_id
      )
        throw new FalhaApi(
          mutacao ? 'pendencia_externa' : 'nao_autenticado',
          mutacao ? 0 : 401,
          mutacao,
        );
      if (!resposta.ok) {
        const erro = erroRespostaSchema.parse(envelope).erro;
        throw new FalhaApi(
          erro.codigo,
          resposta.status,
          mutacao && (resposta.status >= 500 || erro.codigo === 'pendencia_externa'),
        );
      }
      return saida.parse(envelope);
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi(enviada ? 'pendencia_externa' : 'servico_indisponivel', 0, enviada);
    }
  }
  const paciente = (id: string) => {
    const resultado = uuidSchema.safeParse(id);
    if (!resultado.success) throw new FalhaApi('entrada_invalida', 422);
    return resultado.data.toLowerCase();
  };
  async function consultar(pacienteId: string, turnoId?: string) {
    const id = paciente(pacienteId);
    const alvo = turnoId === undefined ? 'atual' : paciente(turnoId);
    const caminho =
      turnoId === undefined
        ? consultaTurnoAtualHttp.caminho.replace(':paciente_id', id)
        : `/api/pacientes/${id}/turnos/${alvo}`;
    const { dados } = await solicitar(caminho, consultaTurnoAtualHttp.saida);
    const atual = identidadeAtual();
    if (
      dados &&
      (dados.paciente_id.toLowerCase() !== id ||
        dados.profissional_usuario_id.toLowerCase() !== atual?.usuario_id.toLowerCase() ||
        (turnoId !== undefined && dados.turno_id.toLowerCase() !== alvo) ||
        (turnoId === undefined && dados.situacao !== 'aberto'))
    )
      throw new FalhaApi('servico_indisponivel');
    return dados;
  }
  return {
    consultarAtual: (pacienteId: string) => consultar(pacienteId),
    consultar: (pacienteId: string, turnoId: string) => consultar(pacienteId, turnoId),
    async abrir(pacienteId: string, entrada: AberturaTurno, chave: string) {
      const id = paciente(pacienteId);
      const corpo = aberturaTurnoSchema.safeParse(entrada);
      if (!corpo.success || !chaveIdempotenciaSchema.safeParse(chave).success)
        throw new FalhaApi('entrada_invalida', 422);
      const { dados } = await solicitar(
        `/api/pacientes/${id}/turnos/abrir`,
        sucessoRespostaSchema(turnoSchema),
        corpo.data,
        chave,
      );
      if (
        dados.turno_id.toLowerCase() !== entrada.turno_id.toLowerCase() ||
        dados.paciente_id.toLowerCase() !== id ||
        dados.profissional_usuario_id.toLowerCase() !==
          identidadeAtual()?.usuario_id.toLowerCase() ||
        dados.situacao !== 'aberto'
      )
        throw new FalhaApi('pendencia_externa', 0, true);
      return dados;
    },
    async consultarBarreira() {
      return (
        await solicitar(
          contratosBarreiraTurnoHttp.consultar.caminho,
          contratosBarreiraTurnoHttp.consultar.saida,
        )
      ).dados;
    },
    async reservar(entrada: z.infer<typeof reservarTurnoSchema>) {
      return (
        await solicitar(
          contratosBarreiraTurnoHttp.reservar.caminho,
          contratosBarreiraTurnoHttp.reservar.saida,
          reservarTurnoSchema.parse(entrada),
        )
      ).dados;
    },
    async encerrarBarreira(entrada: z.infer<typeof encerrarTurnoSchema>) {
      return (
        await solicitar(
          contratosBarreiraTurnoHttp.encerrar.caminho,
          contratosBarreiraTurnoHttp.encerrar.saida,
          encerrarTurnoSchema.parse(entrada),
        )
      ).dados;
    },
    async reconhecer(entrada: z.infer<typeof reconhecerTurnoSchema>) {
      return (
        await solicitar(
          contratosBarreiraTurnoHttp.reconhecer.caminho,
          contratosBarreiraTurnoHttp.reconhecer.saida,
          reconhecerTurnoSchema.parse(entrada),
        )
      ).dados;
    },
  };
}
export type ServicoTurnoHttp = ReturnType<typeof criarServicoTurnoHttp>;
