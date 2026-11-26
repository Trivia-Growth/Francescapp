import { chaveIdempotenciaSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  type CodigoErro,
} from '../../../packages/contracts/src/erros.ts';
import { fichaPlantaoHttp } from '../../../packages/contracts/src/ficha-plantao-http.ts';
import { comporFichaPlantaoNativo } from './compor-ficha-plantao-nativo.ts';
import { registrarFalhaDeResposta } from './falha-operacional.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
type Dependencias = Parameters<typeof comporFichaPlantaoNativo>[2];

/** Lê o corpo com teto antes da decodificação: o limite evita acumular corpo arbitrário em
 * memória e o prazo evita que um envio lento segure a função até o fim do tempo da rota. */
async function lerCorpo(request: Request): Promise<unknown> {
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
      if (tamanho > 65_536) throw new Error();
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

/** Entrada interna da ficha de plantão; não registra rota no catálogo público nem concede
 * privilégio nenhum. Cinco superfícies: consultar a ficha do plantão, publicá-la, guardar e
 * recuperar o rascunho do próprio autor, resolver pendência escrita e listar as pendências
 * escritas do caso para a carteira — esta última pela MESMA projeção autorizada. */
export function criarEntradaFichaPlantaoNativa(dependencias: Dependencias) {
  return {
    async atender(request: Request): Promise<Response> {
      const erro = (codigo: CodigoErro, id = crypto.randomUUID()) =>
        Response.json(criarErroPublicoSemCampos(codigo, id), {
          status: statusErroHttp[codigo],
          headers,
        });
      const url = new URL(request.url);
      if (url.hash || url.search) return erro('entrada_invalida');
      const porTurno =
        /^\/api\/pacientes\/([^/]+)\/turnos\/([^/]+)\/ficha-plantao(\/rascunho)?$/.exec(
          url.pathname,
        );
      const porCaso =
        /^\/api\/pacientes\/([^/]+)\/ficha-plantao(\/pendencias\/resolucao|\/pendencias)?$/.exec(
          url.pathname,
        );
      const caminho = porTurno ?? porCaso;
      if (!caminho) return erro('nao_encontrado');
      const paciente = uuidSchema.safeParse(caminho[1]);
      if (!paciente.success) return erro('entrada_invalida');
      const metodo = request.method;
      let tipo: Parameters<typeof comporFichaPlantaoNativo>[1]['operacao'] | undefined;
      let turnoId: string | undefined;
      if (porTurno) {
        const turno = uuidSchema.safeParse(porTurno[2]);
        if (!turno.success) return erro('entrada_invalida');
        turnoId = turno.data;
        if (porTurno[3] !== undefined)
          tipo =
            metodo === 'GET' ? 'rascunho_ler' : metodo === 'PUT' ? 'rascunho_salvar' : undefined;
        else tipo = metodo === 'GET' ? 'consultar' : undefined;
      } else if (metodo === 'GET' && porCaso?.[2] === '/pendencias') tipo = 'pendencias';
      else if (metodo === 'POST' && porCaso?.[2] !== '/pendencias')
        tipo = porCaso?.[2] === undefined ? 'submeter' : 'resolver';
      if (!tipo) return erro('nao_encontrado');
      const saida: 'resultado' | 'rascunho' | 'pendencias' =
        tipo === 'rascunho_ler' || tipo === 'rascunho_salvar'
          ? 'rascunho'
          : tipo === 'pendencias'
            ? 'pendencias'
            : 'resultado';
      let corpo: unknown;
      if (metodo !== 'GET') {
        if (
          !chaveIdempotenciaSchema.safeParse(request.headers.get('x-chave-idempotencia')).success ||
          request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
            'application/json'
        )
          return erro('entrada_invalida');
        let bruto: unknown;
        try {
          bruto = await lerCorpo(request);
        } catch {
          return erro('entrada_invalida');
        }
        if (tipo === 'rascunho_salvar') {
          const lido = fichaPlantaoHttp.salvarRascunho.entrada.safeParse(bruto);
          // O rascunho é do turno do caminho; divergência no corpo é entrada inválida, nunca
          // uma gravação silenciosa em outro plantão.
          if (!lido.success || lido.data.turno_id !== turnoId) return erro('entrada_invalida');
          corpo = lido.data;
        } else if (tipo === 'submeter') {
          const lido = fichaPlantaoHttp.submeter.entrada.safeParse(bruto);
          if (!lido.success) return erro('entrada_invalida');
          corpo = lido.data;
        } else {
          const lido = fichaPlantaoHttp.resolverPendencia.entrada.safeParse(bruto);
          if (!lido.success) return erro('entrada_invalida');
          corpo = lido.data;
        }
      }
      const comando: Parameters<typeof comporFichaPlantaoNativo>[1] =
        tipo === 'consultar' || tipo === 'rascunho_ler'
          ? { operacao: tipo, paciente_id: paciente.data, turno_id: turnoId ?? '' }
          : tipo === 'pendencias'
            ? { operacao: tipo, paciente_id: paciente.data }
            : { operacao: tipo, paciente_id: paciente.data, corpo };
      if (!uuidSchema.safeParse(request.headers.get('x-sessao')).success)
        return erro('nao_autenticado');
      try {
        const pedido = new Request(request.url, {
          method: metodo,
          headers: request.headers,
          signal: request.signal,
        });
        const resultado = await comporFichaPlantaoNativo(pedido, comando, dependencias);
        if (!resultado.ok) return erro(resultado.erro.codigo, resultado.request_id);
        const dados =
          saida === 'rascunho'
            ? fichaPlantaoHttp.consultarRascunho.saida.parse(resultado.dados.rascunho)
            : saida === 'pendencias'
              ? fichaPlantaoHttp.listarPendencias.saida.parse({
                  pendencias: resultado.dados.pendencias,
                })
              : fichaPlantaoHttp.consultar.saida.parse({
                  ficha: resultado.dados.ficha,
                  pendencias: resultado.dados.pendencias,
                });
        return Response.json({ dados, request_id: resultado.request_id }, { headers });
      } catch (erroResposta) {
        return erro(
          metodo === 'GET' ? 'servico_indisponivel' : 'pendencia_externa',
          registrarFalhaDeResposta('ficha-plantao', erroResposta),
        );
      }
    },
  };
}
