import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TAMANHO_MAXIMO_PDF_TURNO } from '../../../packages/contracts/src/turno-execucao-http.ts';
/** Só aceita projeção produzida no servidor. Sem HTML, font fetch ou glifo substituído. */
export async function gerarPdfExecucao(
  titulo: string,
  secoes: readonly { titulo: string; texto: string }[],
  sinal: AbortSignal,
  instanteCorte: string,
): Promise<Uint8Array> {
  if (sinal.aborted) throw new Error('Pedido cancelado.');
  if (
    secoes.reduce((total, secao) => total + secao.titulo.length + secao.texto.length, 0) > 500_000
  )
    throw new Error('PDF indisponível: conteúdo excede o limite de emissão.');
  const pdf = await PDFDocument.create();
  const corte = new Date(instanteCorte);
  if (!Number.isFinite(corte.getTime())) throw new Error('Corte indisponível.');
  pdf.setCreationDate(corte);
  pdf.setModificationDate(corte);
  pdf.setTitle(titulo);
  pdf.setProducer('FFCMApp');
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  let pagina = pdf.addPage([595.28, 841.89]);
  let y = 795;
  const linha = (texto: string, tamanho = 10) => {
    if (sinal.aborted) throw new Error('Pedido cancelado.');
    // WinAnsi sem glifo falha explicitamente: nunca substituir conteúdo clínico.
    fonte.encodeText(texto);
    if (y < 50) {
      if (pdf.getPageCount() >= 200)
        throw new Error('PDF indisponível: número de páginas excede o limite de emissão.');
      pagina = pdf.addPage([595.28, 841.89]);
      y = 795;
    }
    pagina.drawText(texto, { x: 42, y, size: tamanho, font: fonte, color: rgb(0.12, 0.16, 0.1) });
    y -= tamanho + 5;
  };
  const texto = (valor: string, tamanho = 10) => {
    for (const paragrafo of valor.split(/\r?\n/)) {
      let atual = '';
      for (const caractere of paragrafo) {
        fonte.encodeText(caractere);
        if (atual && fonte.widthOfTextAtSize(atual + caractere, tamanho) > 510) {
          linha(atual, tamanho);
          atual = '';
        }
        atual += caractere;
      }
      linha(atual, tamanho);
    }
  };
  texto(titulo, 17);
  texto('Dados registrados e declarados. Sem interpretação clínica automática.');
  for (const secao of secoes) {
    y -= 10;
    texto(secao.titulo, 13);
    texto(secao.texto);
  }
  const bytes = await pdf.save({ useObjectStreams: true });
  if (sinal.aborted || bytes.byteLength > TAMANHO_MAXIMO_PDF_TURNO)
    throw new Error('PDF indisponível: limite de emissão excedido ou pedido cancelado.');
  return bytes;
}
