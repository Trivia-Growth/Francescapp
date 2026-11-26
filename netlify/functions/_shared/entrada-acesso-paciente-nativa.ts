import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { contratosRotas } from '../../../packages/contracts/src/rotas.ts';
import {
  criarAcessoReservadoHttpSchema,
  revogarAcessoReservadoHttpSchema,
} from '../../../packages/contracts/src/barreira-acesso-servidor.ts';
import { comporAcessoPacienteNativo } from './compor-acesso-paciente-nativo.ts';
import type { configurarDependenciasNativas } from './configurar-dependencias-nativas.ts';
import { servicoAtivo } from './configuracao-servidor.ts';

export const cabecalhosAcessoPaciente = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** Padrões de última instância lidos do ambiente pela rota; não são autorização. */
export type PadroesAcessoPaciente = { acessoAtivo: boolean; barreiraAtiva: boolean };

/** Entrada interna do acesso ao paciente; não registra rota nem concede privilégios. */
export function criarEntradaAcessoPacienteNativa(
  dependencias: ReturnType<typeof configurarDependenciasNativas>,
) {
  const erro = (codigo: CodigoErro, id: string = crypto.randomUUID()) =>
    Response.json(criarErroPublicoSemCampos(codigo, id), {
      status: statusErroHttp[codigo],
      headers: cabecalhosAcessoPaciente,
    });
  return {
    async atender(request: Request, padroes: PadroesAcessoPaciente): Promise<Response> {
      // Dois interruptores administrados pela tela, com as variáveis de ambiente como padrão
      // quando o banco não responde. Não são autorização: conceder e revogar continuam exigindo
      // sessão, perfil e atestado verificados no banco. A ordem das checagens é a mesma de antes,
      // para não revelar se um caminho existe quando o serviço está desligado.
      if (
        !(await servicoAtivo(dependencias.pool, 'ffcm.acesso_paciente.ativo', padroes.acessoAtivo))
      )
        return erro('servico_indisponivel');
      const url = new URL(request.url);
      const concessao = /^\/api\/pacientes\/([^/]+)\/acessos$/.exec(url.pathname);
      const revogacao = /^\/api\/pacientes\/([^/]+)\/acessos\/([^/]+)\/revogar$/.exec(url.pathname);
      if ((!concessao && !revogacao) || request.method !== 'POST') return erro('nao_encontrado');
      if (
        !(await servicoAtivo(
          dependencias.pool,
          'ffcm.acesso_paciente.barreira_ativa',
          padroes.barreiraAtiva,
        ))
      )
        return erro('servico_indisponivel');
      const pacienteId = (concessao ?? revogacao)?.[1];
      if (
        url.search ||
        url.hash ||
        !uuidSchema.safeParse(pacienteId).success ||
        (revogacao && !uuidSchema.safeParse(revogacao[2]).success) ||
        !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success ||
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          'application/json' ||
        !request.body
      )
        return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');

      const leitor = request.body.getReader();
      let corpo: unknown;
      try {
        const partes: Uint8Array[] = [];
        let tamanho = 0;
        const controle = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
        const interrupcao = new Promise<never>((_, rejeitar) => {
          if (controle.aborted) rejeitar(new Error());
          else controle.addEventListener('abort', () => rejeitar(new Error()), { once: true });
        });
        while (true) {
          const parte = await Promise.race([leitor.read(), interrupcao]);
          if (parte.done) break;
          tamanho += parte.value.length;
          if (tamanho > 32_768) throw new Error();
          partes.push(parte.value);
        }
        const bytes = new Uint8Array(tamanho);
        let posicao = 0;
        for (const parte of partes) {
          bytes.set(parte, posicao);
          posicao += parte.length;
        }
        corpo = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch {
        void leitor.cancel().catch(() => {});
        return erro('entrada_invalida');
      } finally {
        leitor.releaseLock();
      }
      const entrada = concessao
        ? criarAcessoReservadoHttpSchema.safeParse(corpo)
        : revogarAcessoReservadoHttpSchema.safeParse(corpo);
      if (!entrada.success) return erro('entrada_invalida');
      let acessoId: string;
      let dados: unknown;
      let reservaId: string | undefined;
      let geracaoReserva: number | undefined;
      if (concessao) {
        const concessaoValidada = criarAcessoReservadoHttpSchema.safeParse(corpo);
        if (!concessaoValidada.success) return erro('entrada_invalida');
        const { acesso_id, ...restante } = concessaoValidada.data.entrada;
        acessoId = acesso_id;
        dados = restante;
        reservaId = concessaoValidada.data.reserva_id;
        geracaoReserva = concessaoValidada.data.geracao_reserva;
      } else {
        acessoId = revogacao?.[2] as string;
        const revogacaoValidada = revogarAcessoReservadoHttpSchema.safeParse(corpo);
        if (!revogacaoValidada.success) return erro('entrada_invalida');
        dados = revogacaoValidada.data.entrada;
        reservaId = revogacaoValidada.data.reserva_id;
        geracaoReserva = revogacaoValidada.data.geracao_reserva;
      }
      try {
        const resultado = await comporAcessoPacienteNativo(
          request,
          {
            acao: concessao ? 'conceder' : 'revogar',
            pacienteId,
            acessoId,
            reservaId,
            geracaoReserva,
            corpo: dados,
            cabecalhos: { 'x-chave-idempotencia': request.headers.get('x-chave-idempotencia') },
          },
          dependencias,
        );
        if (!resultado.ok) return erro(resultado.erro.codigo as CodigoErro, resultado.request_id);
        const saida = contratosRotas.criarAcessoPaciente.saida.parse(resultado.dados);
        return Response.json(
          { dados: saida, request_id: resultado.request_id },
          { headers: cabecalhosAcessoPaciente },
        );
      } catch {
        return erro('pendencia_externa');
      }
    },
  };
}
