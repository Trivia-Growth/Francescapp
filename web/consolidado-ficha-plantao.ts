import type { RelatorioTurnoPublico } from '../packages/contracts/src/turno-execucao-http.ts';
import type {
  FichaPlantaoProjetada,
  PendenciaPlantaoHttp,
} from '../packages/contracts/src/ficha-plantao-http.ts';
import { elementoTurno as el } from './turno-execucao-campos.ts';
import { apresentarRegistroTurno, dataTurno } from './turno-execucao-leitura.ts';

/** FR-080. Consolidado diário no formato da ficha de plantão.
 *
 * Reusa a projeção autorizada de FR-062 exatamente como ela chega: o que muda aqui é
 * agrupamento e rotulagem, nunca a audiência. Não há consulta própria, não há regra de
 * acesso nova e nenhum conteúdo é inferido — se a projeção omitiu algo por audiência, a
 * ficha mostra o campo como não disponível sem revelar o teor, e a ficha impressa de um
 * familiar não é igual à da equipe. Isso é a regra vigente, não um efeito colateral.
 *
 * Nenhuma pontuação, classificação de gravidade, alerta, tendência ou sugestão de conduta é
 * produzida a partir de campo nenhum. */

export type FichaDoPlantao = {
  ficha: FichaPlantaoProjetada | null;
  pendencias: readonly PendenciaPlantaoHttp[];
};

type Evento = RelatorioTurnoPublico['itens'][number];

/** Ordem da ficha de papel. Os campos estruturais (plantão, papel, autores) saem no
 * cabeçalho de cada plantão; estes são as linhas redigidas e registradas. */
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

const PERIODOS: Record<string, string> = { diurno: 'Diurno', noturno: 'Noturno' };

const VAZIO: Readonly<Record<Linha, string>> = {
  'Estado emocional': 'Nada registrado neste plantão.',
  Rotina: 'Nada registrado neste plantão.',
  Atividades: 'Nada registrado neste plantão.',
  Alimentação: 'Nada registrado neste plantão.',
  Medicação: 'Nada registrado neste plantão.',
  Intercorrências: 'Nada registrado neste plantão.',
  Observações: 'Nada registrado neste plantão.',
  Pendências: 'Nenhuma pendência escrita neste plantão.',
};

function textoResposta(
  resposta: FichaPlantaoProjetada['atividades'],
): { texto: string; marca: string } | null {
  if (!resposta) return null;
  const fontes: Record<string, string> = {
    observacao_direta: 'observação direta do profissional',
    relato_paciente: 'relato do paciente',
    relato_familiar: 'relato de familiar',
    documento: 'documento',
  };
  return {
    texto: resposta.texto,
    marca: `Fonte: ${fontes[resposta.fonte] ?? resposta.fonte}. ${
      resposta.visibilidade === 'compartilhavel'
        ? 'Conteúdo compartilhável com a família autorizada.'
        : 'Nota interna da equipe.'
    }`,
  };
}

export function apresentarConsolidadoFicha(
  relatorio: RelatorioTurnoPublico,
  fichas?: ReadonlyMap<string, FichaDoPlantao>,
): HTMLElement {
  const secao = el('section');
  secao.append(el('h3', 'Consolidado diário no formato da ficha'));
  secao.append(
    el(
      'p',
      `${dataTurno(relatorio.inicio)} a ${dataTurno(relatorio.fim)}. Reunido a partir dos registros persistidos, conforme a sua autorização. Os registros continuam guardados evento a evento; aqui eles são apenas reunidos por plantão.`,
    ),
  );

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

  if (!ordem.length && !passagens.length) {
    secao.append(
      el(
        'p',
        'Nenhum registro neste período: nenhum plantão foi registrado neste dia. A consulta foi concluída e nada foi encontrado — não é falha, e não há dado de exemplo.',
      ),
    );
  }

  for (const chave of ordem) {
    const grupo = plantoes.get(chave);
    if (!grupo) continue;
    const artigo = el('article');
    artigo.className = 'turno-execucao__registro';
    const turno = grupo.turno;
    artigo.append(el('h4', turno ? 'Plantão' : 'Registros sem plantão identificado na consulta'));
    if (turno) {
      artigo.append(
        el('p', `Abertura registrada: ${dataTurno(turno.aberto_em)}`),
        el(
          'p',
          `Encerramento registrado: ${turno.encerrado_em ? dataTurno(turno.encerrado_em) : 'Turno aberto no corte da consulta'}`,
        ),
        el(
          'p',
          `Profissional: ${turno.profissional_nome ?? `identificador do profissional persistido ${turno.profissional_usuario_id}`}`,
        ),
      );
    }
    const dados = fichas?.get(chave);
    artigo.append(
      el(
        'p',
        `Plantão: ${
          dados?.ficha?.periodo
            ? (PERIODOS[dados.ficha.periodo] ?? dados.ficha.periodo)
            : 'Não informado'
        }`,
      ),
      el('p', `Papel declarado: ${dados?.ficha?.papel_declarado ?? 'Não informado'}`),
    );
    if (dados?.ficha?.retroativo)
      artigo.append(
        el(
          'p',
          'Abertura retroativa declarada: a janela informada pelo profissional e o instante do servidor estão ambos gravados.',
        ),
      );
    if (fichas && !dados)
      artigo.append(
        el('p', 'Ficha do plantão não disponível para a sua audiência nesta consulta.'),
      );

    const porLinha = new Map<Linha | 'Aferições', Evento[]>();
    for (const evento of grupo.eventos) {
      const linha = linhaDoEvento(evento);
      if (!linha) continue;
      const lista = porLinha.get(linha) ?? [];
      lista.push(evento);
      porLinha.set(linha, lista);
    }
    for (const linha of LINHAS) {
      const bloco = el('section');
      bloco.append(el('h4', linha));
      let vazio = true;
      if (linha === 'Estado emocional' || linha === 'Atividades' || linha === 'Observações') {
        const resposta =
          linha === 'Atividades'
            ? textoResposta(dados?.ficha?.atividades ?? null)
            : linha === 'Observações'
              ? textoResposta(dados?.ficha?.observacoes ?? null)
              : null;
        if (resposta) {
          bloco.append(el('p', resposta.texto), el('p', resposta.marca));
          vazio = false;
        }
      }
      if (linha === 'Pendências') {
        for (const pendencia of dados?.pendencias ?? []) {
          bloco.append(
            el('p', pendencia.texto),
            el(
              'p',
              `Origem: escrita por pessoa. Situação: ${pendencia.situacao === 'aberta' ? 'aberta' : 'resolvida'}. Registrada em ${dataTurno(pendencia.registrado_em)}.`,
            ),
          );
          vazio = false;
        }
      }
      for (const evento of porLinha.get(linha) ?? []) {
        const registro = evento.dados;
        if ('registrador_usuario_id' in registro) {
          bloco.append(apresentarRegistroTurno(registro));
          vazio = false;
        }
      }
      if (vazio) bloco.append(el('p', VAZIO[linha]));
      artigo.append(bloco);
    }
    const afericoes = porLinha.get('Aferições') ?? [];
    if (afericoes.length) {
      const bloco = el('section');
      bloco.append(
        el('h4', 'Aferições registradas'),
        el('p', 'A ficha de papel não tem esta linha; os valores aparecem como registrados.'),
      );
      for (const evento of afericoes) {
        const registro = evento.dados;
        if ('registrador_usuario_id' in registro) bloco.append(apresentarRegistroTurno(registro));
      }
      artigo.append(bloco);
    }
    secao.append(artigo);
  }

  if (passagens.length) {
    const artigo = el('article');
    artigo.className = 'turno-execucao__registro';
    artigo.append(el('h4', 'Passagens de turno do período'));
    for (const evento of passagens) {
      const dados = evento.dados;
      if (!('publicado_em' in dados)) continue;
      artigo.append(
        el(
          'p',
          `Autor: ${dados.autor_nome ?? `identificador do autor persistido ${dados.autor_usuario_id}`}`,
        ),
        el('p', `Publicada em ${dataTurno(dados.publicado_em)}`),
        el('p', dados.audiencia === 'equipe' ? 'Audiência: equipe' : 'Audiência: equipe e família'),
        el('p', dados.conteudo),
      );
    }
    secao.append(artigo);
  }

  for (const lacuna of relatorio.lacunas)
    secao.append(
      el('p', `Lacuna de cobertura: ${dataTurno(lacuna.inicio)} a ${dataTurno(lacuna.fim)}.`),
    );
  secao.append(
    el(
      'p',
      'Conteúdo apresentado como registrado, sem interpretação clínica automática e sem sugestão de conduta.',
    ),
  );
  return secao;
}
