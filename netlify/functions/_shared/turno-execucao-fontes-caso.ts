import { operarAnamneseNativa } from './anamnese-nativa.ts';
import { operarSaudeNativa } from './saude-nativa.ts';
import { operarDocumentoPacienteNativo } from './documento-paciente-nativo.ts';
import {
  DOCUMENTO_CONTEXTO_CUIDADO,
  DOCUMENTO_REDE_CUIDADO,
} from './compor-documento-paciente-nativo.ts';
import { operarDiarioNativo } from './diario-nativo.ts';
import { operarDocumentoCasoNativo } from './documento-caso-nativo.ts';
import { operarPlanoCuidadoNativo } from './plano-cuidado-nativo.ts';
import { operarTarefaCuidadoNativo } from './tarefa-cuidado-nativo.ts';
import { operarEncaminhamentoNativo } from './encaminhamento-nativo.ts';
import { operarOrientacaoNativa } from './orientacao-nativa.ts';
import { objeto } from './turno-execucao-projecao.ts';
import type { PortasExecucaoTurno } from './turno-execucao-nativo.ts';
import type { carregarCofreNativo } from './cofre-nativo.ts';
import type { TransporteConversaoFilho } from './conversao-diario-atestado.ts';
export type RegistroFonteCaso = { registro_id: string; versao: number; conteudo: unknown };
function todos(valor: unknown): Record<string, unknown>[] {
  if (Array.isArray(valor)) return valor.flatMap(todos);
  if (valor === null || typeof valor !== 'object') return [];
  const r = objeto(valor);
  return [
    r,
    ...Object.values(r)
      .filter((v) => Array.isArray(v))
      .flatMap(todos),
  ];
}
export async function lerFonteCasoAutorizada(
  request: Request,
  paciente: string,
  fonte: string,
  alvo: { registro_id: string; versao: number } | undefined,
  portas: Pick<
    PortasExecucaoTurno,
    'autorizar' | 'revalidar' | 'metadados' | 'cifra' | 'idempotencia' | 'atestador'
  > & {
    cursor: Awaited<ReturnType<typeof carregarCofreNativo>>['cursor'];
    executarFonte(
      nome: string,
      transporte: { p_transporte: TransporteConversaoFilho },
    ): Promise<unknown>;
  },
): Promise<RegistroFonteCaso[]> {
  const rpcs: Record<string, string> = {
    anamnese: 'anamnese_privada',
    saude: 'saude_operacao_privada',
    contexto: 'contexto_cuidado_privado',
    rede: 'rede_cuidado_privado',
    diario: 'diario_privado',
    documento: 'documento_operacao_privada',
    objetivo: 'plano_cuidado_privado',
    tarefa: 'ler_tarefas_cuidado_privado',
    encaminhamento: 'encaminhamento_privado',
    orientacao: 'orientacao_privada',
  };
  const rpc = rpcs[fonte];
  if (!rpc) throw new Error('Fonte indisponível.');
  const referencias: RegistroFonteCaso[] = [];
  let bruto: unknown;
  const p = {
    ...portas,
    executar: async (_request: Request, transporte: { p_transporte: TransporteConversaoFilho }) => {
      bruto = await portas.executarFonte(
        fonte === 'anamnese' && alvo ? 'historico_anamnese_privada' : rpc,
        transporte,
      );
      return bruto;
    },
  };
  const comando = {
    operacao: 'ler' as const,
    paciente_id: paciente,
    ...(alvo && fonte !== 'anamnese'
      ? { registro_id_exportacao: alvo.registro_id, versao_exportacao: alvo.versao }
      : {}),
  };
  const associar = (claro: unknown) => {
    const envelope = objeto(bruto);
    if (envelope.ok !== true) throw new Error('Fonte negada.');
    const rows = todos(envelope.dados).filter(
      (r) => typeof r.registro_id === 'string' && typeof r.versao === 'number',
    );
    const claros = todos(claro);
    for (const raw of rows) {
      if (raw.paciente_id !== undefined && raw.paciente_id !== paciente)
        throw new Error('Caso incompatível.');
      const parentes = [
        'documento_id',
        'objetivo_id',
        'tarefa_id',
        'encaminhamento_id',
        'orientacao_id',
        'diario_registro_id',
      ];
      const parent = parentes.find((k) => typeof raw[k] === 'string');
      const encontrado = claros.find(
        (c) =>
          c.versao === raw.versao &&
          (c.registro_id === raw.registro_id || (parent && c[parent] === raw[parent])),
      );
      const unico = claros.find(
        (c) => c.versao === raw.versao && ['anamnese', 'saude', 'contexto', 'rede'].includes(fonte),
      );
      const conteudo = encontrado ?? unico;
      if (!conteudo) throw new Error('Versão não pode ser associada à projeção autorizada.');
      referencias.push({
        registro_id: String(raw.registro_id),
        versao: Number(raw.versao),
        conteudo,
      });
    }
  };
  if (fonte === 'objetivo') {
    if (alvo) {
      const r = await operarPlanoCuidadoNativo(request, { ...comando, limite: 1 }, p);
      if (!r.ok) throw new Error('Plano não autorizado.');
      associar(r.dados);
      if (!referencias.some((r) => r.registro_id === alvo.registro_id && r.versao === alvo.versao))
        throw new Error('Versão exata indisponível.');
      return referencias;
    }
    let cursor: string | undefined;
    const vistos = new Set<string>();
    do {
      const resultado = await operarPlanoCuidadoNativo(
        request,
        { ...comando, ...(cursor ? { cursor } : {}), limite: 20 },
        p,
      );
      if (!resultado.ok) throw new Error('Plano não autorizado.');
      associar(resultado.dados);
      const dados = objeto(resultado.dados);
      if (dados.proximo_cursor === null) break;
      if (typeof dados.proximo_cursor !== 'string' || vistos.has(dados.proximo_cursor))
        throw new Error('Paginação incompatível.');
      cursor = dados.proximo_cursor;
      vistos.add(cursor);
    } while (!request.signal.aborted);
    return referencias;
  }
  let resultado: { ok: boolean; dados?: unknown };
  switch (fonte) {
    case 'anamnese':
      resultado = await operarAnamneseNativa(
        request,
        alvo
          ? { operacao: 'historico', paciente_id: paciente, antes_versao: alvo.versao + 1 }
          : comando,
        p,
      );
      break;
    case 'saude':
      resultado = await operarSaudeNativa(request, comando, p);
      break;
    case 'contexto':
      resultado = await operarDocumentoPacienteNativo(
        request,
        DOCUMENTO_CONTEXTO_CUIDADO,
        comando,
        p,
      );
      break;
    case 'rede':
      resultado = await operarDocumentoPacienteNativo(request, DOCUMENTO_REDE_CUIDADO, comando, p);
      break;
    case 'diario':
      resultado = await operarDiarioNativo(request, comando, p);
      break;
    case 'documento':
      resultado = await operarDocumentoCasoNativo(request, comando, p);
      break;
    case 'tarefa':
      resultado = await operarTarefaCuidadoNativo(request, comando, p);
      break;
    case 'encaminhamento':
      resultado = await operarEncaminhamentoNativo(request, comando, p);
      break;
    case 'orientacao':
      resultado = await operarOrientacaoNativa(request, comando, p);
      break;
    default:
      throw new Error('Fonte não implementada.');
  }
  if (!resultado.ok) throw new Error('Fonte não autorizada.');
  associar(resultado.dados);
  if (
    alvo &&
    !referencias.some((r) => r.registro_id === alvo.registro_id && r.versao === alvo.versao)
  )
    throw new Error('Versão exata indisponível.');
  return referencias;
}
