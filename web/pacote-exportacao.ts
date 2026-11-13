import type { Exportacao, ItemExportacao } from '../packages/contracts/src/exportacao.js';

/** Monta o pacote de exportação (FR-032/FR-033) no NAVEGADOR.
 *
 * Decisão de 13/11/2026 sobre o formato: um ZIP com `resumo.html`, `dados.json` e a pasta
 * `anexos/`. HTML porque "consultável" para uma família significa abrir e ler sem instalar
 * nada; JSON porque outro serviço precisa ler sem raspar HTML. PDF foi descartado: perde
 * estrutura e não ajuda ninguém.
 *
 * O ZIP é montado aqui, no cliente, e isso não é detalhe de implementação: o servidor não
 * decifra nada, e o dono da operação não tem privilégio sobre `conteudo_cifrado` de nenhuma
 * tabela de versão. Montar o pacote no servidor exigiria reunir o caso decifrado num só
 * lugar, que é exatamente o que a fatia foi desenhada para não fazer.
 *
 * Compressão: nenhuma (método `store`). Evita acrescentar dependência de terceiro a uma
 * fatia que carrega dado clínico, e o ganho seria marginal — os anexos já chegam em formatos
 * comprimidos. O arquivo abre em qualquer sistema operacional sem ferramenta extra. */

const TAMANHO_MAXIMO_NOME = 180;

export type AnexoPacote = {
  /** Nome como aparecerá dentro de `anexos/`. Sanitizado na montagem. */
  nome: string;
  conteudo: Uint8Array<ArrayBuffer>;
};

export type EntradaPacote = {
  exportacao: Exportacao;
  /** Nome de exibição do caso. Não é documento nem identificador. */
  pacienteRotulo: string;
  anexos?: readonly AnexoPacote[];
  /** Injetável para o teste; padrão é o relógio do navegador. */
  geradoEm?: Date;
};

const tabelaCrc32 = (() => {
  const tabela = new Uint32Array(256);
  for (let indice = 0; indice < 256; indice += 1) {
    let valor = indice;
    for (let bit = 0; bit < 8; bit += 1)
      valor = valor & 1 ? (valor >>> 1) ^ 0xedb88320 : valor >>> 1;
    tabela[indice] = valor >>> 0;
  }
  return tabela;
})();

export function crc32(dados: Uint8Array<ArrayBuffer>): number {
  let valor = 0xffffffff;
  for (const byte of dados) valor = (valor >>> 8) ^ (tabelaCrc32[(valor ^ byte) & 0xff] as number);
  return (valor ^ 0xffffffff) >>> 0;
}

/** Nome seguro dentro do ZIP: sem caminho, sem byte de controle, sem nome vazio. Impede que
 *  um nome vindo de anexo escape da pasta ou confunda o extrator.
 *
 *  O descarte de caracteres de controle compara por CÓDIGO, e não por expressão regular com
 *  escapes: a regex equivalente já foi corrompida por edição automática de texto, virando
 *  bytes literais no arquivo. Comparar por código não tem como ser reescrito por engano. */
export function nomeSeguro(bruto: string): string {
  const limpo = [...bruto]
    .filter((caractere) => {
      const codigo = caractere.codePointAt(0) ?? 0;
      return codigo > 0x1f && codigo !== 0x7f;
    })
    .join('')
    .replaceAll('\\', '/')
    .split('/')
    .filter((parte) => parte !== '' && parte !== '.' && parte !== '..')
    .join('-')
    .trim();
  const sanitizado = limpo === '' ? 'anexo' : limpo;
  return sanitizado.length > TAMANHO_MAXIMO_NOME
    ? sanitizado.slice(0, TAMANHO_MAXIMO_NOME)
    : sanitizado;
}

function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const ROTULO_FINALIDADE: Record<Exportacao['finalidade'], string> = {
  acompanhamento: 'Acompanhamento do caso',
  portabilidade_titular: 'Pedido do titular',
  encerramento_uso: 'Encerramento do uso',
};

const ROTULO_MOTIVO: Record<NonNullable<ItemExportacao['motivo_indisponibilidade']>, string> = {
  documento_indisponivel: 'documento marcado como indisponível',
  anexo_nao_recuperado: 'anexo não recuperado',
};

export function montarResumoHtml(entrada: EntradaPacote): string {
  const { exportacao, pacienteRotulo } = entrada;
  const incluidos = exportacao.itens.filter((i) => i.disponibilidade === 'incluido');
  const indisponiveis = exportacao.itens.filter((i) => i.disponibilidade === 'indisponivel');
  const linhas = incluidos
    .map(
      (item) =>
        `<tr><td>${escaparHtml(item.fonte)}</td><td>${escaparHtml(item.tipo_evento)}</td>` +
        `<td>${escaparHtml(item.aconteceu_em ?? '—')}</td>` +
        `<td>${escaparHtml(item.registrado_em)}</td></tr>`,
    )
    .join('\n');
  const avisoIndisponivel =
    indisponiveis.length === 0
      ? ''
      : `<section><h2>Conteúdo indisponível</h2><p>${indisponiveis.length} registro(s) não puderam ser incluídos:</p><ul>${indisponiveis
          .map(
            (item) =>
              `<li>${escaparHtml(item.fonte)} — ${escaparHtml(
                item.motivo_indisponibilidade
                  ? ROTULO_MOTIVO[item.motivo_indisponibilidade]
                  : 'motivo não informado',
              )}</li>`,
          )
          .join(
            '',
          )}</ul><p>Isto não significa que exista conteúdo que você não possa ver: o que a audiência exclui não entra neste pacote nem como contagem.</p></section>`;
  const avisoTerceiros = exportacao.terceiros_reduzidos
    ? '<p><strong>Dados de outras pessoas</strong> entraram apenas como papel e primeiro nome, sem contato, anotação ou documento.</p>'
    : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Exportação — ${escaparHtml(pacienteRotulo)}</title>
<style>
body{font-family:system-ui,sans-serif;line-height:1.5;margin:0 auto;max-width:48rem;padding:16px;color:#1b1b1b;background:#fff}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:.9375rem}
caption{text-align:left;font-weight:600;padding-bottom:8px}
</style>
</head>
<body>
<h1>Exportação do acompanhamento</h1>
<p>Pessoa acompanhada: <strong>${escaparHtml(pacienteRotulo)}</strong></p>
<p>Finalidade: ${escaparHtml(ROTULO_FINALIDADE[exportacao.finalidade])}</p>
<p>Registrada em: ${escaparHtml(exportacao.criado_em)}</p>
${avisoTerceiros}
<section>
<table>
<caption>${incluidos.length} registro(s) incluído(s)</caption>
<thead><tr><th>Origem</th><th>Tipo</th><th>Aconteceu em</th><th>Registrado em</th></tr></thead>
<tbody>
${linhas}
</tbody>
</table>
</section>
${avisoIndisponivel}
<section>
<h2>Sobre este pacote</h2>
<p>O arquivo <code>dados.json</code> traz a mesma informação em formato estruturado, para quem precisar lê-la em outro sistema. Os anexos, quando existem, estão na pasta <code>anexos/</code>.</p>
<p>Este pacote registra o que foi entregue e por quem. <strong>Ele não comprova recebimento</strong>: quem recebe não tem conta no sistema e não confirma nada por lá.</p>
</section>
</body>
</html>
`;
}

export function montarDadosJson(entrada: EntradaPacote): string {
  const { exportacao, pacienteRotulo } = entrada;
  return `${JSON.stringify(
    {
      formato: 'ffcm.exportacao.v1',
      gerado_em: (entrada.geradoEm ?? new Date()).toISOString(),
      paciente_rotulo: pacienteRotulo,
      exportacao: {
        id: exportacao.id,
        finalidade: exportacao.finalidade,
        criado_em: exportacao.criado_em,
        terceiros_reduzidos: exportacao.terceiros_reduzidos,
        itens: exportacao.itens,
        entregas: exportacao.entregas,
      },
      // Declarado dentro do próprio pacote, não só na tela: quem abrir isto daqui a um ano
      // precisa saber o que o carimbo de entrega significa.
      observacao_entrega:
        'As entregas registradas são declaração de quem entregou. O destinatário não confirma recebimento neste sistema.',
    },
    null,
    2,
  )}\n`;
}

type ArquivoZip = { nome: string; dados: Uint8Array<ArrayBuffer> };

function dataHoraDos(data: Date): { hora: number; dia: number } {
  const hora = (data.getHours() << 11) | (data.getMinutes() << 5) | (data.getSeconds() >> 1);
  const dia =
    (Math.max(data.getFullYear() - 1980, 0) << 9) | ((data.getMonth() + 1) << 5) | data.getDate();
  return { hora, dia };
}

/** ZIP sem compressão (método 0). Estrutura: um cabeçalho local por arquivo, o diretório
 *  central e o registro de fim. Nomes em UTF-8, com o bit 11 ligado para o extrator saber.
 *
 *  Devolve BYTES, não `Blob`, de propósito: assim o teste verifica o arquivo de verdade sem
 *  depender da implementação de `Blob` do ambiente. O embrulho fica em `montarZip`. */
export function montarBytesZip(
  arquivos: readonly ArquivoZip[],
  geradoEm: Date,
): Uint8Array<ArrayBuffer> {
  const codificador = new TextEncoder();
  const { hora, dia } = dataHoraDos(geradoEm);
  const locais: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = codificador.encode(arquivo.nome) as Uint8Array<ArrayBuffer>;
    const soma = crc32(arquivo.dados);
    const tamanho = arquivo.dados.length;

    const cabecalho = new Uint8Array(30 + nome.length);
    const visao = new DataView(cabecalho.buffer);
    visao.setUint32(0, 0x04034b50, true);
    visao.setUint16(4, 20, true);
    visao.setUint16(6, 0x0800, true);
    visao.setUint16(8, 0, true);
    visao.setUint16(10, hora, true);
    visao.setUint16(12, dia, true);
    visao.setUint32(14, soma, true);
    visao.setUint32(18, tamanho, true);
    visao.setUint32(22, tamanho, true);
    visao.setUint16(26, nome.length, true);
    visao.setUint16(28, 0, true);
    cabecalho.set(nome, 30);
    locais.push(cabecalho, arquivo.dados);

    const entrada = new Uint8Array(46 + nome.length);
    const visaoCentral = new DataView(entrada.buffer);
    visaoCentral.setUint32(0, 0x02014b50, true);
    visaoCentral.setUint16(4, 20, true);
    visaoCentral.setUint16(6, 20, true);
    visaoCentral.setUint16(8, 0x0800, true);
    visaoCentral.setUint16(10, 0, true);
    visaoCentral.setUint16(12, hora, true);
    visaoCentral.setUint16(14, dia, true);
    visaoCentral.setUint32(16, soma, true);
    visaoCentral.setUint32(20, tamanho, true);
    visaoCentral.setUint32(24, tamanho, true);
    visaoCentral.setUint16(28, nome.length, true);
    visaoCentral.setUint32(42, deslocamento, true);
    entrada.set(nome, 46);
    central.push(entrada);

    deslocamento += cabecalho.length + tamanho;
  }

  const tamanhoCentral = central.reduce((total, parte) => total + parte.length, 0);
  const fim = new Uint8Array(22);
  const visaoFim = new DataView(fim.buffer);
  visaoFim.setUint32(0, 0x06054b50, true);
  visaoFim.setUint16(8, arquivos.length, true);
  visaoFim.setUint16(10, arquivos.length, true);
  visaoFim.setUint32(12, tamanhoCentral, true);
  visaoFim.setUint32(16, deslocamento, true);

  const partes = [...locais, ...central, fim];
  const total = partes.reduce((soma, parte) => soma + parte.length, 0);
  const bytes = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    bytes.set(parte, posicao);
    posicao += parte.length;
  }
  return bytes;
}

export function montarZip(arquivos: readonly ArquivoZip[], geradoEm: Date): Blob {
  return new Blob([montarBytesZip(arquivos, geradoEm)], { type: 'application/zip' });
}

function arquivosDoPacote(entrada: EntradaPacote): ArquivoZip[] {
  const codificador = new TextEncoder();
  const geradoEm = entrada.geradoEm ?? new Date();
  const arquivos: ArquivoZip[] = [
    {
      nome: 'resumo.html',
      dados: codificador.encode(montarResumoHtml(entrada)) as Uint8Array<ArrayBuffer>,
    },
    {
      nome: 'dados.json',
      dados: codificador.encode(montarDadosJson(entrada)) as Uint8Array<ArrayBuffer>,
    },
  ];
  const usados = new Set<string>();
  for (const anexo of entrada.anexos ?? []) {
    let nome = nomeSeguro(anexo.nome);
    let repeticao = 2;
    while (usados.has(nome)) {
      nome = `${repeticao}-${nomeSeguro(anexo.nome)}`;
      repeticao += 1;
    }
    usados.add(nome);
    arquivos.push({ nome: `anexos/${nome}`, dados: anexo.conteudo });
  }
  return arquivos;
}

/** Bytes do pacote. Separado do `Blob` para que o teste possa gravar o arquivo em disco e
 *  provar que um descompactador de verdade o abre. */
export function montarBytesPacoteExportacao(entrada: EntradaPacote): Uint8Array<ArrayBuffer> {
  return montarBytesZip(arquivosDoPacote(entrada), entrada.geradoEm ?? new Date());
}

export function montarPacoteExportacao(entrada: EntradaPacote): Blob {
  return new Blob([montarBytesPacoteExportacao(entrada)], { type: 'application/zip' });
}

export function nomeDoArquivoPacote(exportacao: Exportacao): string {
  return `exportacao-${exportacao.id.slice(0, 8)}.zip`;
}
