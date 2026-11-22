import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { TAMANHO_MAXIMO_PDF_TURNO } from '../../../packages/contracts/src/turno-execucao-http.ts';
import { bytesMarcaFfcm, PROPORCAO_MARCA_FFCM } from './marca-ffcm.ts';
import { instanteLegivel } from './instante-legivel.ts';

/** Emissão em papel dos relatórios do cuidado (FR-066).
 *
 * O documento é composto aqui, no servidor, a partir da projeção já autorizada. Nada vem do
 * HTML do cliente, nenhuma fonte é buscada na rede e nenhum glifo é substituído em silêncio.
 *
 * Tipografia: Helvetica e Helvetica-Bold, as duas faces de base do PDF. Nenhuma família nova
 * entra no produto por este caminho. A hierarquia vem de tamanho, peso, espaço e régua — a
 * mesma proporção da escala de tela (razão 1,25), reduzida para papel: 22 / 17,5 / 14 / 11,2
 * / 9 / 7,2 pt.
 *
 * Cor: carvão `#1F1F1D` para todo texto e oliva da marca `#839352` apenas como área, régua e
 * filete. O oliva nunca é texto, e o texto sobre a área oliva é carvão (4,92:1). Nenhuma cor
 * fora de `docs/projeto/identidade-visual.md`.
 *
 * O documento não interpreta: não há gráfico, tendência, pontuação, classificação de
 * gravidade nem destaque por conteúdo. O realce tipográfico marca a estrutura do relatório,
 * nunca o que um registro diz. */

const LARGURA_PAGINA = 595.28;
const ALTURA_PAGINA = 841.89;
const MARGEM = 56;
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM * 2;
const TOPO = ALTURA_PAGINA - MARGEM;
/** Piso do conteúdo. Abaixo dele só existe o rodapé de confidencialidade e paginação. */
const PISO = 86;

const ESCALA = {
  titulo: 22,
  secao: 17.5,
  bloco: 14,
  corpo: 11.2,
  apoio: 9,
  nota: 7.2,
} as const;

const CARVAO = rgb(0x1f / 255, 0x1f / 255, 0x1d / 255);
const OLIVA = rgb(0x83 / 255, 0x93 / 255, 0x52 / 255);

/** Ressalva clínica obrigatória: constante de código, nunca configuração (FR-084). */
const RESSALVA_CLINICA = 'Dados registrados e declarados. Sem interpretação clínica automática.';
const CONFIDENCIALIDADE =
  'Documento confidencial. Contém dados pessoais e de saúde do caso identificado, no recorte autorizado para quem o emitiu. Uso restrito ao destinatário e ao propósito declarados.';
const RODAPE = 'Confidencial. Uso restrito à audiência autorizada.';

export type SecaoPdfExecucao = {
  titulo: string;
  texto: string;
  /** 1 abre um bloco do relatório; 2 é uma linha dentro dele. Ausente vale 1. */
  nivel?: 1 | 2;
};

export type IdentificacaoPdfExecucao = {
  caso?: string;
  emissor?: string;
  destinatario?: string;
  proposito?: string;
  versao?: number;
  exportacao?: string;
  periodo?: { inicio: string; fim: string };
};

/** Uma linha `Rótulo: valor` vira duas colunas; qualquer outra linha é prosa. O corte é
 * conservador para não transformar texto redigido por uma pessoa em rótulo. */
function separarRotulo(linha: string): { rotulo: string; valor: string } | null {
  const corte = linha.indexOf(': ');
  if (corte < 2 || corte > 46) return null;
  const rotulo = linha.slice(0, corte);
  if (/[.!?]/.test(rotulo)) return null;
  return { rotulo, valor: linha.slice(corte + 2) };
}

export async function gerarPdfExecucao(
  titulo: string,
  secoes: readonly SecaoPdfExecucao[],
  sinal: AbortSignal,
  instanteCorte: string,
  identificacao?: IdentificacaoPdfExecucao,
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
  pdf.setSubject(CONFIDENCIALIDADE);
  if (identificacao?.emissor) pdf.setAuthor(identificacao.emissor);
  pdf.setProducer('FFCMApp');
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const forte = await pdf.embedFont(StandardFonts.HelveticaBold);

  const paginas: PDFPage[] = [];
  let pagina!: PDFPage;
  let y = 0;

  const verificar = () => {
    if (sinal.aborted) throw new Error('Pedido cancelado.');
  };
  const abrir = () => {
    verificar();
    if (pdf.getPageCount() >= 200)
      throw new Error('PDF indisponível: número de páginas excede o limite de emissão.');
    pagina = pdf.addPage([LARGURA_PAGINA, ALTURA_PAGINA]);
    paginas.push(pagina);
    y = TOPO;
    if (paginas.length > 1) {
      // Cabeça corrente: quem recebe folhas soltas continua sabendo o que está lendo.
      escreverLinha(titulo, { tamanho: ESCALA.nota, fonte: forte, y: TOPO + 16 });
      pagina.drawRectangle({
        x: MARGEM,
        y: TOPO + 8,
        width: LARGURA_UTIL,
        height: 0.75,
        color: OLIVA,
      });
      y = TOPO - 6;
    }
  };
  const espaco = (altura: number) => {
    y -= altura;
  };
  const cabe = (altura: number) => {
    if (y - altura < PISO) abrir();
  };
  /** Desenha uma única linha já medida. Falha explícita em glifo sem suporte: conteúdo
   * clínico nunca é substituído por caixa vazia. */
  const escreverLinha = (
    texto: string,
    opcoes: { tamanho: number; fonte: PDFFont; x?: number; y?: number },
  ) => {
    opcoes.fonte.encodeText(texto);
    pagina.drawText(texto, {
      x: opcoes.x ?? MARGEM,
      y: opcoes.y ?? y,
      size: opcoes.tamanho,
      font: opcoes.fonte,
      color: CARVAO,
    });
  };
  const quebrar = (texto: string, tamanho: number, face: PDFFont, largura: number): string[] => {
    face.encodeText(texto);
    const linhas: string[] = [];
    let atual = '';
    for (const palavra of texto.split(' ')) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (atual && face.widthOfTextAtSize(tentativa, tamanho) > largura) {
        linhas.push(atual);
        atual = palavra;
      } else atual = tentativa;
      // Palavra sozinha maior que a medida (identificador longo): quebra por caractere.
      while (face.widthOfTextAtSize(atual, tamanho) > largura && atual.length > 1) {
        let parcial = '';
        for (const caractere of atual) {
          if (face.widthOfTextAtSize(parcial + caractere, tamanho) > largura) break;
          parcial += caractere;
        }
        if (!parcial) break;
        linhas.push(parcial);
        atual = atual.slice(parcial.length);
      }
    }
    linhas.push(atual);
    return linhas;
  };
  const paragrafo = (
    texto: string,
    opcoes: { tamanho?: number; face?: PDFFont; x?: number; largura?: number } = {},
  ) => {
    const tamanho = opcoes.tamanho ?? ESCALA.corpo;
    const face = opcoes.face ?? fonte;
    const x = opcoes.x ?? MARGEM;
    const largura = opcoes.largura ?? LARGURA_UTIL;
    const entrelinha = tamanho * 1.38;
    for (const linha of quebrar(texto, tamanho, face, largura)) {
      cabe(entrelinha);
      y -= entrelinha;
      if (linha) escreverLinha(linha, { tamanho, fonte: face, x });
    }
  };
  const regua = (espessura: number, largura = LARGURA_UTIL) => {
    cabe(espessura + 2);
    y -= espessura;
    pagina.drawRectangle({ x: MARGEM, y, width: largura, height: espessura, color: OLIVA });
  };

  // ── Primeira página: assinatura, título e identificação ──────────────────────
  abrir();
  const marca = await pdf.embedJpg(bytesMarcaFfcm());
  // Imagem recebida como recebida: proporção original, sobre área branca do papel.
  const larguraMarca = 46;
  const alturaMarca = larguraMarca * PROPORCAO_MARCA_FFCM;
  y -= alturaMarca;
  pagina.drawImage(marca, { x: MARGEM, y, width: larguraMarca, height: alturaMarca });
  escreverLinha('FFCMApp', {
    tamanho: ESCALA.corpo,
    fonte: forte,
    x: MARGEM + larguraMarca + 14,
    y: y + alturaMarca - ESCALA.corpo,
  });
  escreverLinha('Francescato Family Case Management', {
    tamanho: ESCALA.apoio,
    fonte,
    x: MARGEM + larguraMarca + 14,
    y: y + alturaMarca - ESCALA.corpo - 14,
  });
  espaco(26);
  regua(3);
  espaco(22);
  paragrafo(titulo, { tamanho: ESCALA.titulo, face: forte });
  if (identificacao?.periodo)
    paragrafo(
      `Período de ${instanteLegivel(identificacao.periodo.inicio)} a ${instanteLegivel(identificacao.periodo.fim)}`,
      { tamanho: ESCALA.corpo },
    );

  // Área oliva com a identificação do documento. Texto em carvão sobre oliva: 4,92:1.
  const identidade: [string, string][] = [
    ['Emissão', instanteLegivel(instanteCorte)],
    ...(identificacao?.versao !== undefined
      ? ([['Versão do documento', String(identificacao.versao)]] as [string, string][])
      : []),
    ...(identificacao?.emissor
      ? ([['Autor da emissão', identificacao.emissor]] as [string, string][])
      : []),
    ...(identificacao?.destinatario
      ? ([['Destinatário declarado', identificacao.destinatario]] as [string, string][])
      : []),
    ...(identificacao?.proposito
      ? ([['Propósito declarado', identificacao.proposito]] as [string, string][])
      : []),
    ...(identificacao?.caso ? ([['Caso', identificacao.caso]] as [string, string][]) : []),
    ...(identificacao?.exportacao
      ? ([['Identificador da exportação', identificacao.exportacao]] as [string, string][])
      : []),
  ];
  const colunaValor = 150;
  const larguraValor = LARGURA_UTIL - colunaValor - 36;
  const linhasIdentidade = identidade.map(
    ([, valor]) => quebrar(valor, ESCALA.corpo, fonte, larguraValor).length,
  );
  const alturaIdentidade =
    linhasIdentidade.reduce((total, n) => total + n * ESCALA.corpo * 1.38, 0) + 20;
  espaco(24);
  cabe(alturaIdentidade);
  pagina.drawRectangle({
    x: MARGEM,
    y: y - alturaIdentidade,
    width: LARGURA_UTIL,
    height: alturaIdentidade,
    color: OLIVA,
  });
  espaco(6);
  for (const [rotulo, valor] of identidade) {
    const entrelinha = ESCALA.corpo * 1.38;
    y -= entrelinha;
    escreverLinha(rotulo, { tamanho: ESCALA.apoio, fonte: forte, x: MARGEM + 18 });
    const linhas = quebrar(valor, ESCALA.corpo, fonte, larguraValor);
    for (const [indice, linha] of linhas.entries()) {
      if (indice > 0) y -= entrelinha;
      escreverLinha(linha, { tamanho: ESCALA.corpo, fonte, x: MARGEM + colunaValor });
    }
  }
  espaco(38);
  paragrafo(CONFIDENCIALIDADE, { tamanho: ESCALA.apoio });
  espaco(4);
  paragrafo(RESSALVA_CLINICA, { tamanho: ESCALA.apoio, face: forte });

  // ── Seções ───────────────────────────────────────────────────────────────────
  for (const secao of secoes) {
    verificar();
    const bloco = (secao.nivel ?? 1) === 1;
    const alturaTitulo = bloco ? ESCALA.secao * 1.38 + 26 : ESCALA.bloco * 1.38 + 20;
    // Título não fica sozinho no pé da folha: precisa de espaço para ele e duas linhas.
    if (y - (alturaTitulo + ESCALA.corpo * 2.8) < PISO) abrir();
    if (bloco) {
      espaco(20);
      regua(2.5);
      espaco(12);
      paragrafo(secao.titulo, { tamanho: ESCALA.secao, face: forte });
    } else {
      espaco(16);
      regua(1, 42);
      espaco(8);
      paragrafo(secao.titulo, { tamanho: ESCALA.bloco, face: forte });
    }
    espaco(6);
    let anterior: 'rotulo' | 'prosa' | null = null;
    for (const linha of secao.texto.split(/\r?\n/)) {
      if (!linha.trim()) {
        espaco(10);
        anterior = null;
        continue;
      }
      const par = separarRotulo(linha);
      if (!par) {
        // Prosa logo depois de uma grade de rótulos precisa de ar, ou as duas se fundem.
        if (anterior === 'rotulo') espaco(6);
        anterior = 'prosa';
        paragrafo(linha);
        continue;
      }
      anterior = 'rotulo';
      const entrelinha = ESCALA.corpo * 1.38;
      const linhasValor = quebrar(par.valor, ESCALA.corpo, fonte, larguraValor);
      cabe(entrelinha * linhasValor.length);
      y -= entrelinha;
      escreverLinha(par.rotulo, { tamanho: ESCALA.apoio, fonte, x: MARGEM });
      for (const [indice, texto] of linhasValor.entries()) {
        if (indice > 0) {
          cabe(entrelinha);
          y -= entrelinha;
        }
        escreverLinha(texto, { tamanho: ESCALA.corpo, fonte, x: MARGEM + colunaValor });
      }
    }
  }

  // ── Rodapé de todas as folhas ────────────────────────────────────────────────
  const total = paginas.length;
  for (const [indice, folha] of paginas.entries()) {
    verificar();
    folha.drawRectangle({ x: MARGEM, y: 62, width: LARGURA_UTIL, height: 0.75, color: OLIVA });
    fonte.encodeText(RODAPE);
    folha.drawText(RODAPE, { x: MARGEM, y: 48, size: ESCALA.nota, font: fonte, color: CARVAO });
    const paginacao = `Página ${indice + 1} de ${total}`;
    fonte.encodeText(paginacao);
    folha.drawText(paginacao, {
      x: MARGEM + LARGURA_UTIL - fonte.widthOfTextAtSize(paginacao, ESCALA.nota),
      y: 48,
      size: ESCALA.nota,
      font: fonte,
      color: CARVAO,
    });
  }

  const bytes = await pdf.save({ useObjectStreams: true });
  if (sinal.aborted || bytes.byteLength > TAMANHO_MAXIMO_PDF_TURNO)
    throw new Error('PDF indisponível: limite de emissão excedido ou pedido cancelado.');
  return bytes;
}
