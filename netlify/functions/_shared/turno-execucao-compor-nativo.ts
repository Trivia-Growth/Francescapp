import { uuidSchema } from '../../../packages/contracts/src/comum.ts';
import type { Pool } from 'pg';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import type { ReferenciasCifraCofre } from '../../../supabase/functions/_shared/cofre-vault.ts';
import { sessaoNativaSchema } from '../../../packages/contracts/src/identidade.ts';
import {
  turnoExecucaoHttp,
  type ComandoExecucaoTurno,
} from '../../../packages/contracts/src/turno-execucao-http.ts';
import { criarContextoAuthNativo, credencialAuthRejeitada } from './auth-nativo/cliente.ts';
import { carregarCofreNativo } from './cofre-nativo.ts';
import { carregarConfiguracaoServidor } from './configuracao-servidor.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import { operarExecucaoTurno } from './turno-execucao-nativo.ts';
import { lerFonteCasoAutorizada } from './turno-execucao-fontes-caso.ts';
import { lerFontesCasoPdf } from './turno-execucao-caso-pdf.ts';
export type DependenciasExecucaoTurno = {
  fonte: FonteDeConfiguracao;
  pool: Pool;
  referencias: ReferenciasCifraCofre;
  keyIdAtestado: string;
};
export async function comporExecucaoTurno(
  request: Request,
  comando: ComandoExecucaoTurno,
  dependencias: DependenciasExecucaoTurno,
) {
  const controle = new AbortController();
  const cancelar = () => controle.abort();
  if (request.signal.aborted) cancelar();
  else request.signal.addEventListener('abort', cancelar, { once: true });
  const temporizador = setTimeout(cancelar, 25_000);
  let iniciada = false;
  let requestId: string = crypto.randomUUID();
  const verificar = () => {
    if (controle.signal.aborted) throw new Error('Pedido cancelado.');
  };
  try {
    const pedido = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      signal: controle.signal,
    });
    const contexto = criarContextoAuthNativo(pedido, dependencias.fonte);
    if (
      turnoExecucaoHttp[comando.operacao].metodo !== 'GET' &&
      request.headers.get('origin') !== contexto.origem
    )
      return {
        ok: false as const,
        erro: { codigo: 'entrada_invalida' },
        request_id: crypto.randomUUID(),
      };
    const autorizar = async () => {
      verificar();
      const alvo = request.headers.get('x-sessao');
      if (!alvo) return { estado: 'nao_autenticado' as const };
      const usuario = await contexto.cliente.auth.getUser();
      verificar();
      if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' as const };
      if (usuario.error)
        return {
          estado: credencialAuthRejeitada(usuario.error)
            ? ('nao_autenticado' as const)
            : ('servico_indisponivel' as const),
        };
      if (!usuario.data.user) return { estado: 'nao_autenticado' as const };
      let resultado = await contexto.cliente
        .schema('api')
        .rpc('consultar_sessao_nativa', { p_request_id: crypto.randomUUID() });
      if (!resultado.error && resultado.data === null)
        resultado = await contexto.cliente
          .schema('api')
          .rpc('consultar_sessao_familiar_nativa', { p_request_id: crypto.randomUUID() });
      verificar();
      if (contexto.cookiesAlterados) return { estado: 'nao_autenticado' as const };
      if (resultado.error) return { estado: 'servico_indisponivel' as const };
      const sessao = sessaoNativaSchema.safeParse(resultado.data);
      if (
        !sessao.success ||
        !sessao.data.usuario.ativo ||
        sessao.data.usuario.id !== usuario.data.user.id ||
        sessao.data.session_id.toLowerCase() !== alvo.toLowerCase()
      )
        return { estado: 'nao_autenticado' as const };
      return {
        estado: 'autorizado' as const,
        identidade: { usuario_id: sessao.data.usuario.id, session_id: sessao.data.session_id },
      };
    };
    const inicial = await autorizar();
    if (inicial.estado !== 'autorizado')
      return {
        ok: false as const,
        erro: { codigo: inicial.estado },
        request_id: crypto.randomUUID(),
      };
    const cofre = await carregarCofreNativo(
      dependencias.pool,
      dependencias.referencias,
      dependencias.keyIdAtestado,
      controle.signal,
    );
    verificar();
    const config = await carregarConfiguracaoServidor(dependencias.pool);
    verificar();
    const bruto = config.get('ffcm.diario.areas_sintese')?.valor;
    const areas = Array.isArray(bruto)
      ? bruto.filter((v): v is string => typeof v === 'string')
      : [];
    const resultado = await operarExecucaoTurno(pedido, comando, {
      autorizar: async () => inicial,
      revalidar: autorizar,
      cifra: cofre.cifra,
      areas,
      metadados: (id) => metadadosAtestadoNativo(dependencias.keyIdAtestado, id, Date.now()),
      atestador: cofre.atestador,
      idempotencia: criarIdempotenciaNativa(cofre.cifra),
      executar: async (nome, transporte) => {
        verificar();
        requestId = uuidSchema.parse(transporte.p_transporte.entrada.request_id);
        const acao = String(
          (transporte.p_transporte.entrada.atestado as { operacao?: string })?.operacao,
        );
        if (!acao.startsWith('api.consultar_') && !acao.startsWith('api.listar_')) iniciada = true;
        const resposta = await contexto.cliente.schema('api').rpc(nome, transporte);
        verificar();
        if (contexto.cookiesAlterados) throw new Error('Sessão alterada.');
        if (resposta.error) {
          if (resposta.error.code === '42501' || resposta.error.code === '22023')
            return {
              ok: false,
              erro: {
                codigo: resposta.error.code === '42501' ? 'sem_permissao' : 'entrada_invalida',
              },
              request_id: transporte.p_transporte.entrada.request_id,
            };
          throw new Error('Operação indisponível.');
        }
        return resposta.data;
      },
      storage: {
        enviar: async (caminho, bytes, tipo) => {
          verificar();
          iniciada = true;
          const r = await contexto.cliente.storage
            .from('turno-ocorrencias')
            .upload(caminho, new Uint8Array(bytes), {
              upsert: false,
              contentType: tipo,
              cacheControl: '0',
            });
          verificar();
          if (contexto.cookiesAlterados) throw new Error('Sessão alterada.');
          if (r.error) {
            if ('statusCode' in r.error && String(r.error.statusCode) === '409') return 'existente';
            throw new Error('Anexo indisponível.');
          }
          return 'criado';
        },
        obter: async (caminho) => {
          verificar();
          const r = await contexto.cliente.storage.from('turno-ocorrencias').download(caminho);
          verificar();
          if (r.error || !r.data || r.data.size > 3 * 1024 * 1024 || contexto.cookiesAlterados)
            throw new Error('Anexo indisponível.');
          const bytes = new Uint8Array(await r.data.arrayBuffer());
          verificar();
          return bytes;
        },
      },
      lerCaso: (pedido, entrada) =>
        lerFontesCasoPdf(pedido, comando.paciente_id, entrada, dependencias, (fonte, alvo) =>
          lerFonteCasoAutorizada(pedido, comando.paciente_id, fonte, alvo, {
            autorizar,
            revalidar: autorizar,
            metadados: (id) => metadadosAtestadoNativo(dependencias.keyIdAtestado, id, Date.now()),
            cifra: cofre.cifra,
            atestador: cofre.atestador,
            idempotencia: criarIdempotenciaNativa(cofre.cifra),
            cursor: cofre.cursor,
            executarFonte: async (nome, transporte) => {
              verificar();
              requestId = uuidSchema.parse(transporte.p_transporte.entrada.request_id);
              const r = await contexto.cliente.schema('api').rpc(nome, transporte);
              verificar();
              if (r.error || contexto.cookiesAlterados) throw new Error('Fonte indisponível.');
              return r.data;
            },
          }),
        ),
    });
    verificar();
    return resultado;
  } catch {
    return {
      ok: false as const,
      erro: { codigo: iniciada ? 'pendencia_externa' : 'servico_indisponivel' },
      request_id: requestId,
    };
  } finally {
    clearTimeout(temporizador);
    request.signal.removeEventListener('abort', cancelar);
  }
}
