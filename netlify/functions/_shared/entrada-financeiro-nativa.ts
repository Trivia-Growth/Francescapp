import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { financeiroHttp } from '../../../packages/contracts/src/financeiro-http.ts';
import { TAMANHO_MAXIMO_COMPROVANTE_BYTES } from '../../../packages/contracts/src/financeiro.ts';
import { comporFinanceiroNativo } from './compor-financeiro-nativo.ts';
import {
  nomeObjetoComprovante,
  tipoDosBytesComprovante,
  type ComandoFinanceiro,
} from './financeiro-nativo.ts';
import { registrarFalhaDeResposta } from './falha-operacional.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporFinanceiroNativo>[2];

/** Corpo com teto antes da decodificação. O teto do comprovante é o do balde mais a
 * sobrecarga do base64 e do envelope JSON; as demais rotas usam o teto curto, porque nenhuma
 * delas transporta arquivo. */
async function lerCorpo(request: Request, limite: number): Promise<unknown> {
  if (!request.body) throw new Error();
  const leitor = request.body.getReader();
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  request.signal.addEventListener('abort', cancelar, { once: true });
  if (request.signal.aborted) cancelar();
  const prazo = setTimeout(cancelar, 15_000);
  try {
    while (true) {
      let abortar!: () => void;
      const interrupcao = new Promise<never>((_, rejeitar) => {
        abortar = () => rejeitar(new Error());
        if (controle.signal.aborted) abortar();
        else controle.signal.addEventListener('abort', abortar, { once: true });
      });
      let parte: ReadableStreamReadResult<Uint8Array>;
      try {
        parte = await Promise.race([leitor.read(), interrupcao]);
      } finally {
        controle.signal.removeEventListener('abort', abortar);
      }
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > limite) throw new Error();
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(tamanho);
    let posicao = 0;
    for (const parte of partes) {
      bytes.set(parte, posicao);
      posicao += parte.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (erro) {
    void leitor.cancel().catch(() => {});
    throw erro;
  } finally {
    clearTimeout(prazo);
    request.signal.removeEventListener('abort', cancelar);
  }
}

const LIMITE_CORPO_PADRAO = 32_768;
const LIMITE_CORPO_COMPROVANTE = Math.ceil(TAMANHO_MAXIMO_COMPROVANTE_BYTES / 3) * 4 + 4_096;

type Rota =
  | { tipo: 'audiencia' }
  | { tipo: 'listarConcessoes' }
  | { tipo: 'gravarConcessao' }
  | { tipo: 'valores'; profissional_usuario_id: string }
  | { tipo: 'registrarValor' }
  | { tipo: 'despesas'; paciente_id: string }
  | { tipo: 'registrarDespesa' }
  | { tipo: 'retificarDespesa'; despesa_id: string }
  | { tipo: 'comprovante'; paciente_id: string; despesa_id: string }
  | { tipo: 'apuracao' };

/** Reconhecimento de caminho por expressão ancorada, nunca por prefixo: um caminho que não
 * casar exatamente é `nao_encontrado`, não cai em outra rota. */
function reconhecer(pathname: string): Rota | null {
  if (pathname === '/api/financeiro/audiencia') return { tipo: 'audiencia' };
  // Mesmo caminho para ler e gravar; o método decide, e `reconhecer` não enxerga método.
  if (pathname === '/api/financeiro/concessoes') return { tipo: 'listarConcessoes' };
  if (pathname === '/api/financeiro/valores-acordados') return { tipo: 'registrarValor' };
  if (pathname === '/api/financeiro/despesas') return { tipo: 'registrarDespesa' };
  if (pathname === '/api/financeiro/apuracoes') return { tipo: 'apuracao' };
  let m = /^\/api\/financeiro\/profissionais\/([^/]+)\/valores-acordados$/.exec(pathname);
  if (m?.[1]) return { tipo: 'valores', profissional_usuario_id: m[1] };
  m = /^\/api\/financeiro\/despesas\/([^/]+)\/retificacoes$/.exec(pathname);
  if (m?.[1]) return { tipo: 'retificarDespesa', despesa_id: m[1] };
  m = /^\/api\/financeiro\/casos\/([^/]+)\/despesas$/.exec(pathname);
  if (m?.[1]) return { tipo: 'despesas', paciente_id: m[1] };
  m = /^\/api\/financeiro\/casos\/([^/]+)\/despesas\/([^/]+)\/comprovante$/.exec(pathname);
  if (m?.[1] && m[2]) return { tipo: 'comprovante', paciente_id: m[1], despesa_id: m[2] };
  return null;
}

/** Entrada interna do financeiro do cuidado; não registra rota nem concede privilégios.
 * Nenhuma decisão de audiência acontece aqui: a borda só valida forma e repassa. */
export function criarEntradaFinanceiraNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      let rota = reconhecer(url.pathname);
      if (!rota) return erro('nao_encontrado');
      const metodo = request.method;
      // A concessão usa um caminho só: GET lista, POST grava (conceder e revogar).
      if (rota.tipo === 'listarConcessoes' && metodo === 'POST') rota = { tipo: 'gravarConcessao' };
      const escrita =
        rota.tipo === 'gravarConcessao' ||
        rota.tipo === 'registrarValor' ||
        rota.tipo === 'registrarDespesa' ||
        rota.tipo === 'retificarDespesa' ||
        (rota.tipo === 'comprovante' && metodo === 'POST');
      if (escrita ? metodo !== 'POST' : metodo !== 'GET') return erro('nao_encontrado');
      if (url.hash || (url.search && rota.tipo !== 'apuracao')) return erro('entrada_invalida');
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');

      let comando: ComandoFinanceiro;
      let contrato: (typeof financeiroHttp)[keyof typeof financeiroHttp] | undefined;
      try {
        if (escrita) {
          if (
            !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia'))
              .success ||
            request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
              'application/json'
          )
            return erro('entrada_invalida');
        }
        switch (rota.tipo) {
          case 'audiencia': {
            contrato = financeiroHttp.consultarAudiencia;
            comando = { operacao: 'consultarAudiencia' };
            break;
          }
          case 'listarConcessoes': {
            contrato = financeiroHttp.listarConcessoes;
            comando = { operacao: 'listarConcessoes' };
            break;
          }
          case 'gravarConcessao': {
            const corpo = financeiroHttp.gravarConcessao.entrada.safeParse(
              await lerCorpo(request, LIMITE_CORPO_PADRAO),
            );
            if (!corpo.success) return erro('entrada_invalida');
            contrato = financeiroHttp.gravarConcessao;
            comando = { operacao: 'gravarConcessao', ...corpo.data };
            break;
          }
          case 'valores': {
            const profissional = uuidSchema.safeParse(rota.profissional_usuario_id);
            if (!profissional.success) return erro('entrada_invalida');
            contrato = financeiroHttp.consultarValoresAcordados;
            comando = {
              operacao: 'consultarValores',
              profissional_usuario_id: profissional.data,
            };
            break;
          }
          case 'despesas': {
            const paciente = uuidSchema.safeParse(rota.paciente_id);
            if (!paciente.success) return erro('entrada_invalida');
            contrato = financeiroHttp.consultarDespesas;
            comando = { operacao: 'consultarDespesas', paciente_id: paciente.data };
            break;
          }
          case 'apuracao': {
            const consulta = financeiroHttp.consultarApuracao.entrada.safeParse(
              Object.fromEntries(url.searchParams),
            );
            if (!consulta.success) return erro('entrada_invalida');
            contrato = financeiroHttp.consultarApuracao;
            comando = { operacao: 'consultarApuracao', ...consulta.data };
            break;
          }
          case 'registrarValor': {
            const corpo = financeiroHttp.registrarValorAcordado.entrada.safeParse(
              await lerCorpo(request, LIMITE_CORPO_PADRAO),
            );
            if (!corpo.success) return erro('entrada_invalida');
            contrato = financeiroHttp.registrarValorAcordado;
            comando = { operacao: 'registrarValor', ...corpo.data };
            break;
          }
          case 'registrarDespesa': {
            const corpo = financeiroHttp.registrarDespesa.entrada.safeParse(
              await lerCorpo(request, LIMITE_CORPO_PADRAO),
            );
            if (!corpo.success) return erro('entrada_invalida');
            // O nome do objeto é do servidor, não do navegador: um nome escolhido pelo
            // cliente apontaria o lançamento para o comprovante de outra despesa.
            if (corpo.data.comprovante.objeto_nome !== nomeObjetoComprovante(corpo.data.despesa_id))
              return erro('entrada_invalida');
            contrato = financeiroHttp.registrarDespesa;
            comando = { operacao: 'registrarDespesa', ...corpo.data };
            break;
          }
          case 'retificarDespesa': {
            const despesa = uuidSchema.safeParse(rota.despesa_id);
            const corpo = financeiroHttp.retificarDespesa.entrada.safeParse(
              await lerCorpo(request, LIMITE_CORPO_PADRAO),
            );
            if (!despesa.success || !corpo.success) return erro('entrada_invalida');
            if (corpo.data.despesa_id.toLowerCase() !== despesa.data.toLowerCase())
              return erro('entrada_invalida');
            contrato = financeiroHttp.retificarDespesa;
            comando = { operacao: 'retificarDespesa', ...corpo.data };
            break;
          }
          case 'comprovante': {
            const paciente = uuidSchema.safeParse(rota.paciente_id);
            const despesa = uuidSchema.safeParse(rota.despesa_id);
            if (!paciente.success || !despesa.success) return erro('entrada_invalida');
            if (metodo === 'GET') {
              contrato = financeiroHttp.consultarComprovante;
              comando = {
                operacao: 'lerComprovante',
                paciente_id: paciente.data,
                despesa_id: despesa.data,
              };
              break;
            }
            const corpo = financeiroHttp.enviarComprovante.entrada.safeParse(
              await lerCorpo(request, LIMITE_CORPO_COMPROVANTE),
            );
            if (!corpo.success) return erro('entrada_invalida');
            let bytes: Uint8Array;
            try {
              bytes = Uint8Array.from(atob(corpo.data.arquivo_base64), (c) => c.charCodeAt(0));
            } catch {
              return erro('entrada_invalida');
            }
            if (bytes.byteLength !== corpo.data.tamanho_bytes) return erro('entrada_invalida');
            contrato = financeiroHttp.enviarComprovante;
            comando = {
              operacao: 'enviarComprovante',
              paciente_id: paciente.data,
              despesa_id: despesa.data,
              bytes,
              mime_type: corpo.data.mime_type,
            };
            break;
          }
        }
      } catch {
        return erro('entrada_invalida');
      }

      try {
        const pedido = new Request(request.url, {
          method: metodo,
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporFinanceiroNativo(pedido, comando, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        if (comando.operacao === 'lerComprovante') {
          const bytes = financeiroHttp.consultarComprovante.saida.parse(resultado.dados);
          const tipo = tipoDosBytesComprovante(bytes);
          // Tipo decidido pelos bytes guardados. Sem tipo reconhecido não há entrega: um
          // objeto de tipo inesperado não vira download de conteúdo arbitrário.
          if (!tipo) return erro('servico_indisponivel', resultado.request_id);
          return new Response(new Uint8Array(bytes), {
            headers: {
              ...headers,
              'Content-Type': tipo,
              'Content-Disposition': 'attachment; filename="comprovante"',
              'Content-Length': String(bytes.byteLength),
              'Content-Security-Policy': "default-src 'none'; sandbox",
            },
          });
        }
        const dados = contrato?.saida.parse(resultado.dados);
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch (erroResposta) {
        return erro(
          escrita ? 'pendencia_externa' : 'servico_indisponivel',
          registrarFalhaDeResposta('financeiro', erroResposta),
        );
      }
    },
  };
}
