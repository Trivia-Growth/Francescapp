import { TAMANHO_MAXIMO_DOCUMENTO } from '../packages/contracts/src/documento-caso.ts';
import type {
  ArquivoItemExportacao,
  Exportacao,
  ItemExportacao,
} from '../packages/contracts/src/exportacao.ts';
import { TAMANHO_MAXIMO_ANEXO_TURNO } from '../packages/contracts/src/turno-execucao-http.ts';
import { exigeNovoAcesso } from './api.ts';
import {
  FalhaPacoteExportacao,
  MAXIMO_ARQUIVOS_PACOTE_EXPORTACAO,
  RESERVA_INDICE_PACOTE_EXPORTACAO,
  TAMANHO_MAXIMO_PACOTE_EXPORTACAO,
  nomeSeguro,
  type AnexoPacote,
} from './pacote-exportacao.ts';

/** FR-033: reúne no NAVEGADOR os bytes dos anexos já autorizados, um arquivo por vez, pelas
 * mesmas rotas de download que a pessoa usaria à mão.
 *
 * Decisão de 13/11/2026 preservada: o servidor não decifra nem empacota nada; quem junta é
 * o navegador. Daí as regras duras deste módulo:
 *   - nenhuma URL pública e nenhuma URL assinada de longa duração: cada byte vem de uma
 *     chamada autenticada, revalidada antes e depois pelo próprio serviço de download;
 *   - anexo que falha, estoura o teto ou chega vazio NÃO quebra o pacote: vira item
 *     indisponível com motivo `anexo_nao_recuperado`, visível no resumo e no `dados.json`;
 *   - autorização perdida no meio INTERROMPE tudo e não entrega byte nenhum — um pacote
 *     meio montado com credencial revogada é pior que pacote nenhum.
 *
 * Os tetos por arquivo são os que já existem nas fatias de origem. Nada aqui os eleva. */

export type BytesDeArquivo = { bytes: Uint8Array<ArrayBuffer>; mime: string | null };

export type BaixarArquivoExportacao = (
  pacienteId: string,
  arquivo: ArquivoItemExportacao,
) => Promise<BytesDeArquivo>;

export type ReuniaoDeAnexos = {
  /** Manifesto com os itens que não vieram já marcados como indisponíveis. */
  exportacao: Exportacao;
  anexos: AnexoPacote[];
  naoRecuperados: number;
};

const TETO_POR_ORIGEM: Record<ArquivoItemExportacao['origem'], number> = {
  documento: TAMANHO_MAXIMO_DOCUMENTO,
  anexo_turno: TAMANHO_MAXIMO_ANEXO_TURNO,
};

const EXTENSAO_POR_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** Itens do manifesto que têm arquivo a buscar. */
export function arquivosDoManifesto(exportacao: Exportacao): ItemExportacao[] {
  return exportacao.itens.filter((item) => item.arquivo && item.disponibilidade === 'incluido');
}

/** Nome dentro do ZIP. O nome visível do documento vive no envelope cifrado e não chega até
 * aqui; derivar do identificador também evita carregar nome de terceiro para dentro do
 * pacote sem necessidade. A desduplicação final é do montador do pacote. */
function nomeDoAnexo(arquivo: ArquivoItemExportacao, mime: string | null): string {
  if (arquivo.nome) return nomeSeguro(arquivo.nome);
  const extensao = EXTENSAO_POR_MIME[(mime ?? arquivo.mime ?? '').toLowerCase()] ?? '';
  const prefixo = arquivo.origem === 'documento' ? 'documento' : 'anexo-turno';
  return `${prefixo}-${arquivo.id.slice(0, 8)}${extensao}`;
}

function marcarNaoRecuperado(item: ItemExportacao): ItemExportacao {
  return {
    ...item,
    disponibilidade: 'indisponivel',
    motivo_indisponibilidade: 'anexo_nao_recuperado',
  };
}

export async function reunirAnexosDaExportacao(
  pacienteId: string,
  exportacao: Exportacao,
  baixar: BaixarArquivoExportacao,
  progresso: (concluidos: number, total: number) => void = () => {},
): Promise<ReuniaoDeAnexos> {
  const alvos = arquivosDoManifesto(exportacao);
  // `resumo.html` e `dados.json` também ocupam entrada no ZIP.
  if (alvos.length + 2 > MAXIMO_ARQUIVOS_PACOTE_EXPORTACAO)
    throw new FalhaPacoteExportacao('arquivos_demais');

  const anexos: AnexoPacote[] = [];
  const naoRecuperados = new Set<ItemExportacao>();
  // Orçamento dos anexos: o teto total do pacote menos a reserva do índice.
  const orcamento = TAMANHO_MAXIMO_PACOTE_EXPORTACAO - RESERVA_INDICE_PACOTE_EXPORTACAO;
  let somados = 0;
  progresso(0, alvos.length);

  for (const [indice, item] of alvos.entries()) {
    const arquivo = item.arquivo as ArquivoItemExportacao;
    let recuperado: BytesDeArquivo | null = null;
    try {
      recuperado = await baixar(pacienteId, arquivo);
    } catch (erro) {
      // Autorização perdida não é "anexo que faltou": interrompe sem entregar bytes.
      if (exigeNovoAcesso(erro)) throw erro;
      recuperado = null;
    }
    const tamanho = recuperado?.bytes.length ?? 0;
    if (
      !recuperado ||
      tamanho === 0 ||
      tamanho > TETO_POR_ORIGEM[arquivo.origem] ||
      somados + tamanho > orcamento
    ) {
      naoRecuperados.add(item);
    } else {
      somados += tamanho;
      anexos.push({ nome: nomeDoAnexo(arquivo, recuperado.mime), conteudo: recuperado.bytes });
    }
    progresso(indice + 1, alvos.length);
  }

  return {
    exportacao: {
      ...exportacao,
      itens: exportacao.itens.map((item) =>
        naoRecuperados.has(item) ? marcarNaoRecuperado(item) : item,
      ),
    },
    anexos,
    naoRecuperados: naoRecuperados.size,
  };
}
