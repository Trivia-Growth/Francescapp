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
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.ts';
import {
  turnoGrupo3Http,
  type CriarEscala,
  type AlterarEscala,
  type PublicarPassagem,
} from '../packages/contracts/src/turno-passagem.ts';
import {
  encerramentoTurnoSchema,
  type EncerramentoTurno,
} from '../packages/contracts/src/turno.ts';

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
    metodo?: 'GET' | 'POST' | 'PATCH',
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
        method: metodo ?? (mutacao ? 'POST' : 'GET'),
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
          if (tamanho > 1_048_576) throw new Error();
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
      if (mutacao && resposta.status === 202) throw new Error();
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
        if (resposta.status !== statusErroHttp[erro.codigo]) throw new Error();
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
    async consultarEscala(pacienteId: string, cursor?: { escala_id: string; versao: number }) {
      const entrada = turnoGrupo3Http.escala.entrada.parse(
        cursor ? { cursor_escala_id: cursor.escala_id, cursor_versao: cursor.versao } : {},
      );
      const parametros = new URLSearchParams(
        Object.entries(entrada).map(([chave, valor]) => [chave, String(valor)]),
      );
      const caminho =
        turnoGrupo3Http.escala.caminho.replace(':paciente_id', paciente(pacienteId)) +
        (parametros.size ? `?${parametros}` : '');
      const { dados } = await solicitar(
        caminho,
        sucessoRespostaSchema(turnoGrupo3Http.escala.saida),
      );
      if (dados.itens.some((item) => item.paciente_id.toLowerCase() !== paciente(pacienteId)))
        throw new FalhaApi('servico_indisponivel');
      return dados;
    },
    async criarEscala(pacienteId: string, entrada: CriarEscala, chave: string) {
      const corpo = turnoGrupo3Http.criarEscala.entrada.parse(entrada);
      chaveIdempotenciaSchema.parse(chave);
      const { dados } = await solicitar(
        turnoGrupo3Http.criarEscala.caminho.replace(':paciente_id', paciente(pacienteId)),
        sucessoRespostaSchema(turnoGrupo3Http.criarEscala.saida),
        corpo,
        chave,
      );
      if (
        dados.paciente_id.toLowerCase() !== paciente(pacienteId) ||
        dados.escala_id !== entrada.escala_id ||
        dados.versao !== 1
      )
        throw new FalhaApi('pendencia_externa', 0, true);
      return dados;
    },
    async alterarEscala(
      pacienteId: string,
      escalaId: string,
      entrada: AlterarEscala,
      chave: string,
    ) {
      const corpo = turnoGrupo3Http.alterarEscala.entrada.parse(entrada);
      chaveIdempotenciaSchema.parse(chave);
      const caminho = turnoGrupo3Http.alterarEscala.caminho
        .replace(':paciente_id', paciente(pacienteId))
        .replace(':escala_id', paciente(escalaId));
      const { dados } = await solicitar(
        caminho,
        sucessoRespostaSchema(turnoGrupo3Http.alterarEscala.saida),
        corpo,
        chave,
        'PATCH',
      );
      if (
        dados.paciente_id.toLowerCase() !== paciente(pacienteId) ||
        dados.escala_id.toLowerCase() !== paciente(escalaId) ||
        dados.versao !== entrada.versao_esperada + 1
      )
        throw new FalhaApi('pendencia_externa', 0, true);
      return dados;
    },
    async consultarPassagem(pacienteId: string, turnoId: string) {
      const caminho = turnoGrupo3Http.passagem.caminho
        .replace(':paciente_id', paciente(pacienteId))
        .replace(':turno_id', paciente(turnoId));
      const { dados } = await solicitar(
        caminho,
        sucessoRespostaSchema(turnoGrupo3Http.passagem.saida),
      );
      if (
        dados.propria &&
        (dados.propria.turno_id.toLowerCase() !== paciente(turnoId) ||
          dados.propria.autor_usuario_id !== identidadeMontagem?.usuario_id)
      )
        throw new FalhaApi('servico_indisponivel');
      if (
        dados.anterior &&
        dados.anterior.turno_destinatario_id.toLowerCase() !== paciente(turnoId)
      )
        throw new FalhaApi('servico_indisponivel');
      return dados;
    },
    async publicarPassagem(
      pacienteId: string,
      turnoId: string,
      entrada: PublicarPassagem,
      chave: string,
    ) {
      chaveIdempotenciaSchema.parse(chave);
      const corpo = turnoGrupo3Http.publicar.entrada.parse(entrada);
      const caminho = turnoGrupo3Http.publicar.caminho
        .replace(':paciente_id', paciente(pacienteId))
        .replace(':turno_id', paciente(turnoId));
      const { dados } = await solicitar(
        caminho,
        sucessoRespostaSchema(turnoGrupo3Http.publicar.saida),
        corpo,
        chave,
      );
      if (
        dados.turno_id.toLowerCase() !== paciente(turnoId) ||
        dados.autor_usuario_id !== identidadeMontagem?.usuario_id ||
        dados.versao_passagem !== entrada.versao_esperada + 1
      )
        throw new FalhaApi('pendencia_externa', 0, true);
      return dados;
    },
    async registrarCiencia(pacienteId: string, turnoId: string, chave: string) {
      chaveIdempotenciaSchema.parse(chave);
      const caminho = turnoGrupo3Http.ciencia.caminho
        .replace(':paciente_id', paciente(pacienteId))
        .replace(':turno_id', paciente(turnoId));
      const { dados } = await solicitar(
        caminho,
        sucessoRespostaSchema(turnoGrupo3Http.ciencia.saida),
        {},
        chave,
      );
      if (dados.usuario_id !== identidadeMontagem?.usuario_id)
        throw new FalhaApi('pendencia_externa', 0, true);
      return dados;
    },
    async encerrar(pacienteId: string, entrada: EncerramentoTurno, chave: string) {
      const corpo = encerramentoTurnoSchema.parse(entrada);
      chaveIdempotenciaSchema.parse(chave);
      const { dados } = await solicitar(
        `/api/pacientes/${paciente(pacienteId)}/turnos/encerrar`,
        sucessoRespostaSchema(turnoSchema),
        corpo,
        chave,
      );
      if (
        dados.turno_id !== entrada.turno_id ||
        dados.paciente_id.toLowerCase() !== paciente(pacienteId) ||
        dados.profissional_usuario_id !== identidadeMontagem?.usuario_id ||
        dados.situacao !== 'encerrado'
      )
        throw new FalhaApi('pendencia_externa', 0, true);
      return dados;
    },
    consultarAtual: (pacienteId: string) => consultar(pacienteId),
    async consultarUltimo(pacienteId: string) {
      const id = paciente(pacienteId);
      const { dados } = await solicitar(
        `/api/pacientes/${id}/turnos/ultimo`,
        sucessoRespostaSchema(turnoSchema.nullable()),
      );
      if (
        dados &&
        (dados.paciente_id.toLowerCase() !== id ||
          dados.profissional_usuario_id !== identidadeMontagem?.usuario_id)
      )
        throw new FalhaApi('servico_indisponivel');
      return dados;
    },
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
