import type { RelatorioTurnoPublico } from '../../../packages/contracts/src/turno-execucao-http.ts';
import { apresentarEventoExecucao } from './turno-execucao-apresentacao.ts';
import type { SecaoPdfExecucao } from './turno-execucao-pdf.ts';
import { instanteLegivel } from './instante-legivel.ts';

/** FR-080. Consolidado diário em papel, na ordem da ficha de plantão.
 *
 * Mesma ordem e mesmos rótulos de `web/consolidado-ficha-plantao.ts`, para que a folha
 * impressa e a tela sejam o mesmo documento. O conteúdo vem da projeção autorizada de
 * FR-062 exatamente como ela chega: o que muda aqui é agrupamento e rotulagem, nunca a
 * audiência. Não há consulta nova, não há regra de acesso nova e nada é inferido.
 *
 * As linhas redigidas da ficha (estado emocional, atividades, observações) e as pendências
 * escritas vivem na ficha do plantão, que esta emissão não consulta. Elas aparecem com a
 * ausência declarada, e não como "nada registrado": dizer que nada foi escrito seria
 * afirmar algo que este caminho não verificou.
 *
 * Nenhuma pontuação, classificação de gravidade, alerta, tendência ou sugestão de conduta é
 * produzida a partir de campo nenhum. */

type Evento = RelatorioTurnoPublico['itens'][number];

/** Ordem da ficha de papel. */
const LINHAS = [
  'Estado emocional',
  'Rotina',
  'Atividades',
  'Alimentação',
  'Medicação',
  'Intercorrências',
  'Observações',
  'Pendências',
] as const;
type Linha = (typeof LINHAS)[number];

/** Linhas cujo conteúdo é redigido na ficha do plantão, fora da projeção de FR-062. */
const REDIGIDAS: ReadonlySet<Linha> = new Set([
  'Estado emocional',
  'Atividades',
  'Observações',
  'Pendências',
]);
const FORA_DA_EMISSAO =
  'Conteúdo redigido na ficha do plantão. Não integra esta emissão, e a ausência aqui não significa que nada foi escrito.';
const SEM_REGISTRO = 'Nada registrado neste plantão.';

function linhaDoEvento(evento: Evento): Linha | 'Aferições' | null {
  const dados = evento.dados;
  if (!('registrador_usuario_id' in dados)) return null;
  const conteudo = dados.conteudo;
  if (conteudo.classe === 'afericao') return 'Aferições';
  if (conteudo.classe === 'prescricao' || conteudo.classe === 'administracao') return 'Medicação';
  if (conteudo.classe === 'ocorrencia') return 'Intercorrências';
  const tipo = conteudo.dados.tipo;
  if (tipo === 'refeicao' || tipo === 'hidratacao') return 'Alimentação';
  return 'Rotina';
}

/** O nome da categoria abre cada registro. Some apenas quando há um único registro e o nome
 * repetiria o título da linha — com dois ou mais ele é o que separa um do outro. */
function textoDosEventos(eventos: readonly Evento[], linha?: string): string {
  return eventos
    .map((evento) => {
      const apresentado = apresentarEventoExecucao(evento);
      return eventos.length === 1 && apresentado.titulo === linha
        ? apresentado.texto
        : `${apresentado.titulo}\n${apresentado.texto}`;
    })
    .join('\n\n');
}

export function montarSecoesFichaConsolidada(
  relatorio: Pick<RelatorioTurnoPublico, 'itens' | 'lacunas'>,
): SecaoPdfExecucao[] {
  const plantoes = new Map<
    string,
    { turno?: Extract<Evento['dados'], { aberto_em: string }>; eventos: Evento[] }
  >();
  const passagens: Evento[] = [];
  const ordem: string[] = [];
  const registrar = (chave: string) => {
    let grupo = plantoes.get(chave);
    if (!grupo) {
      grupo = { eventos: [] };
      plantoes.set(chave, grupo);
      ordem.push(chave);
    }
    return grupo;
  };
  for (const evento of relatorio.itens) {
    const dados = evento.dados;
    if ('aberto_em' in dados) {
      registrar(dados.turno_id).turno = dados;
      continue;
    }
    if ('publicado_em' in dados) {
      passagens.push(evento);
      continue;
    }
    registrar(dados.turno_id ?? 'sem-plantao').eventos.push(evento);
  }

  const secoes: SecaoPdfExecucao[] = [];
  if (!ordem.length && !passagens.length)
    secoes.push({
      titulo: 'Nenhum registro neste período',
      texto:
        'Nenhum plantão foi registrado neste dia. A consulta foi concluída e nada foi encontrado — não é falha, e não há dado de exemplo.',
    });

  for (const chave of ordem) {
    const grupo = plantoes.get(chave);
    if (!grupo) continue;
    const turno = grupo.turno;
    secoes.push({
      titulo: turno ? 'Plantão' : 'Registros sem plantão identificado na consulta',
      nivel: 1,
      texto: turno
        ? [
            `Abertura registrada: ${instanteLegivel(turno.aberto_em)}`,
            `Encerramento registrado: ${turno.encerrado_em ? instanteLegivel(turno.encerrado_em) : 'Turno aberto no corte da consulta'}`,
            `Profissional: ${turno.profissional_nome ?? `identificador do profissional persistido ${turno.profissional_usuario_id}`}`,
            `Situação: ${turno.situacao === 'aberto' ? 'Aberto' : 'Encerrado'}`,
          ].join('\n')
        : 'Os registros abaixo não indicam o plantão a que pertencem na projeção consultada.',
    });
    const porLinha = new Map<Linha | 'Aferições', Evento[]>();
    for (const evento of grupo.eventos) {
      const linha = linhaDoEvento(evento);
      if (!linha) continue;
      const lista = porLinha.get(linha) ?? [];
      lista.push(evento);
      porLinha.set(linha, lista);
    }
    for (const linha of LINHAS) {
      const eventos = porLinha.get(linha) ?? [];
      secoes.push({
        titulo: linha,
        nivel: 2,
        texto: eventos.length
          ? textoDosEventos(eventos, linha)
          : REDIGIDAS.has(linha)
            ? FORA_DA_EMISSAO
            : SEM_REGISTRO,
      });
    }
    const afericoes = porLinha.get('Aferições') ?? [];
    if (afericoes.length)
      secoes.push({
        titulo: 'Aferições registradas',
        nivel: 2,
        texto: `A ficha de papel não tem esta linha; os valores aparecem como registrados.\n\n${textoDosEventos(afericoes)}`,
      });
  }

  if (passagens.length)
    secoes.push({
      titulo: 'Passagens de turno do período',
      nivel: 1,
      texto: textoDosEventos(passagens),
    });

  secoes.push({
    titulo: 'Cobertura do período',
    nivel: 1,
    texto: relatorio.lacunas.length
      ? relatorio.lacunas
          .map(
            (lacuna) =>
              `Lacuna de cobertura: ${instanteLegivel(lacuna.inicio)} a ${instanteLegivel(lacuna.fim)}`,
          )
          .join('\n')
      : 'Nenhuma lacuna de cobertura indicada no período autorizado.',
  });
  return secoes;
}
