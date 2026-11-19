import { z } from 'zod';
import { comporExportacaoNativa } from './compor-exportacao-nativa.ts';
import { comporLinhaTempoNativa } from './compor-linha-tempo-nativa.ts';
import { registroExportacoesSchema } from '../../../packages/contracts/src/exportacao.ts';
import type { DependenciasExecucaoTurno } from './turno-execucao-compor-nativo.ts';
import { objeto } from './turno-execucao-projecao.ts';
import { apresentarFonteCaso } from './turno-execucao-caso-apresentacao.ts';
function registros(valor: unknown): Record<string, unknown>[] {
  if (Array.isArray(valor)) return valor.flatMap(registros);
  if (valor === null || typeof valor !== 'object') return [];
  const r = objeto(valor);
  const filhos = Object.values(r).filter((v) => Array.isArray(v));
  return [r, ...filhos.flatMap(registros)];
}
/** Monta de fato conteúdo autorizado, somente versões do manifesto persistido.
 * Seletores privados de cada domínio preservam owner, audiência e autorização atual. */
export async function lerFontesCasoPdf(
  request: Request,
  paciente: string,
  entrada: { inicio: string; fim: string; destinatario: string; proposito: string },
  dependencias: DependenciasExecucaoTurno,
  lerVersao: (
    fonte: string,
    alvo: { registro_id: string; versao: number },
  ) => Promise<{ registro_id: string; versao: number; conteudo: unknown }[]>,
) {
  const leitura = new Request(request.url, {
    method: 'GET',
    headers: request.headers,
    signal: request.signal,
  });
  let respostaPrivada: unknown;
  const manifesto = await comporExportacaoNativa(
    request,
    {
      operacao: 'registrar',
      paciente_id: paciente,
      finalidade: 'acompanhamento',
      destinatario: entrada.destinatario,
      proposito: entrada.proposito,
      periodo_de: entrada.inicio,
      periodo_ate: entrada.fim,
    },
    dependencias,
    (r) => {
      respostaPrivada = r;
    },
  );
  if (!manifesto.ok) throw new Error('Exportação de caso não autorizada.');
  if (
    objeto(respostaPrivada).ok !== true ||
    objeto(respostaPrivada).request_id !== manifesto.request_id
  )
    throw new Error('Recibo privado incompatível.');
  const registro = registroExportacoesSchema.parse(manifesto.dados);
  const exportacao = registro.exportacoes.find(
    (e) => e.id === objeto(respostaPrivada).resultado_id,
  );
  if (!exportacao) throw new Error('Manifesto não confirmado.');
  const secoes: { titulo: string; texto: string }[] = [
    {
      titulo: 'Exportação de caso',
      texto:
        'Conteúdo autorizado das versões indicadas no manifesto. Dados estruturados de terceiros reduzidos a papel e primeiro nome. Anexos binários não são incorporados ao PDF; disponibilidade é indicada separadamente.',
    },
  ];
  const cache = new Map<string, unknown>();
  const obter = async (fonte: string): Promise<unknown> => {
    if (cache.has(fonte)) return cache.get(fonte);
    let r: { ok: boolean; dados?: unknown };
    const comando = { operacao: 'ler' as const, paciente_id: paciente };
    switch (fonte) {
      case 'pendencia':
      case 'situacao': {
        const itens: unknown[] = [];
        let cursor: { cursor_em: string; cursor_id: string } | undefined;
        const vistos = new Set<string>();
        do {
          const pagina = await comporLinhaTempoNativa(
            leitura,
            {
              ...comando,
              filtros: {
                fontes: [fonte as 'situacao' | 'pendencia'],
                de: entrada.inicio,
                ate: entrada.fim,
                limite: 100,
                ...cursor,
              },
            },
            dependencias,
          );
          if (!pagina.ok) throw new Error('Acompanhamento indisponível.');
          const p = objeto(pagina.dados);
          itens.push(...z.array(z.unknown()).parse(p.itens));
          if (p.proximo_cursor === null) break;
          const c = objeto(p.proximo_cursor);
          cursor = {
            cursor_em: z.string().parse(c.registrado_em),
            cursor_id: z.string().parse(c.id),
          };
          const chave = JSON.stringify(cursor);
          if (vistos.has(chave)) throw new Error('Paginação incompatível.');
          vistos.add(chave);
        } while (!request.signal.aborted);
        r = { ok: true, dados: itens };
        break;
      }
      default:
        throw new Error('Fonte não implementada.');
    }
    if (!r.ok) throw new Error('Conteúdo não autorizado.');
    cache.set(fonte, r.dados);
    return r.dados;
  };
  let total = 0;
  for (const item of exportacao.itens) {
    if (request.signal.aborted) throw new Error('Pedido cancelado.');
    if (item.disponibilidade === 'indisponivel') {
      secoes.push({
        titulo: 'Documento indisponível',
        texto:
          'O manifesto registra indisponibilidade deste anexo. Nenhum conteúdo foi incorporado.',
      });
      continue;
    }
    const fontesVersionadas = [
      'anamnese',
      'saude',
      'contexto',
      'rede',
      'diario',
      'documento',
      'objetivo',
      'tarefa',
      'encaminhamento',
      'orientacao',
    ];
    const versoes = fontesVersionadas.includes(item.fonte)
      ? await lerVersao(item.fonte, item)
      : undefined;
    const bruto = versoes
      ? versoes.find((r) => r.registro_id === item.registro_id && r.versao === item.versao)
          ?.conteudo
      : await obter(item.fonte);
    const candidatos = registros(bruto);
    const documentoUnico = ['anamnese', 'saude', 'contexto', 'rede'].includes(item.fonte);
    const correspondente = candidatos.find(
      (r) =>
        r.versao === item.versao &&
        (r.registro_id === item.registro_id || r.id === item.registro_id),
    );
    const atual =
      documentoUnico && bruto !== null && typeof bruto === 'object' ? objeto(bruto) : undefined;
    const selecionado =
      correspondente ??
      (versoes && bruto !== undefined ? objeto(bruto) : undefined) ??
      (atual?.versao === item.versao ? atual : undefined);
    if (!selecionado)
      throw new Error(
        'Versão do manifesto não está disponível na fonte autorizada. Gere nova exportação após conferir as alterações.',
      );
    const texto = apresentarFonteCaso(item.fonte, selecionado);
    if (!texto.trim())
      throw new Error('Conteúdo desta fonte não pode ser apresentado com segurança.');
    const secao = {
      titulo: `${({ diario: 'Diário', documento: 'Documento', anamnese: 'Anamnese', saude: 'Saúde', contexto: 'Contexto de cuidado', rede: 'Rede de cuidado', situacao: 'Situação do acompanhamento', objetivo: 'Objetivo de cuidado', tarefa: 'Tarefa de cuidado', encaminhamento: 'Encaminhamento', orientacao: 'Orientação', pendencia: 'Pendência' } as const)[item.fonte]} - versão ${item.versao}`,
      texto: `Registro: ${item.registrado_em}\nAutoria: ${item.autor_usuario_id ? `identificador do autor persistido ${item.autor_usuario_id}` : 'não informada na fonte'}\n${texto}`,
    };
    total += secao.titulo.length + secao.texto.length;
    if (total > 500_000) throw new Error('PDF excede o limite de conteúdo.');
    secoes.push(secao);
  }
  // Revalida alçada da exportação e todas as fontes ao final; nenhuma versão nova substitui a antiga.
  const atual = await comporExportacaoNativa(
    leitura,
    { operacao: 'ler', paciente_id: paciente },
    dependencias,
  );
  if (
    !atual.ok ||
    !registroExportacoesSchema.parse(atual.dados).exportacoes.some((e) => e.id === exportacao.id)
  )
    throw new Error('Exportação não está mais autorizada.');
  return secoes;
}
