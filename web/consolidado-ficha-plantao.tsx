import type { RelatorioTurnoPublico } from '../packages/contracts/src/turno-execucao-http.ts';
import type {
  FichaPlantaoProjetada,
  PendenciaPlantaoHttp,
} from '../packages/contracts/src/ficha-plantao-http.ts';
import './estilos/tema.css';
import { nodeDe } from './ponte/ilha.js';
import { LinhaRegistro, RegistroTurno, dataTurno } from './turno-execucao-leitura.js';

/** FR-080. Consolidado diário no formato da ficha de plantão.
 *
 * Reusa a projeção autorizada de FR-062 exatamente como ela chega: o que muda aqui é
 * agrupamento e rotulagem, nunca a audiência. Não há consulta própria, não há regra de
 * acesso nova e nenhum conteúdo é inferido — se a projeção omitiu algo por audiência, a
 * ficha mostra o campo como não disponível sem revelar o teor, e a ficha impressa de um
 * familiar não é igual à da equipe. Isso é a regra vigente, não um efeito colateral.
 *
 * Nenhuma pontuação, classificação de gravidade, alerta, tendência ou sugestão de conduta é
 * produzida a partir de campo nenhum.
 *
 * Reconstruído em React sobre a ilha (VIS-018). Como `turno-execucao-leitura`, é
 * apresentação pura e sem tratador de evento: `apresentarConsolidadoFicha` segue
 * devolvendo `HTMLElement` por `nodeDe`, porque `-relatorios` ainda monta DOM à mão e um
 * nó inerte é exatamente o que ele anexa. */

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

type Plantao = { turno?: Extract<Evento['dados'], { aberto_em: string }>; eventos: Evento[] };

/** Agrupa o relatório por plantão preservando a ordem de chegada. Sem esta separação, a
 *  montagem e o agrupamento ficariam na mesma função e a ordem viraria efeito colateral
 *  da renderização. */
function agrupar(relatorio: RelatorioTurnoPublico) {
  const plantoes = new Map<string, Plantao>();
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
  return { plantoes, passagens, ordem };
}

/* A moldura do plantão continua sendo `article` filho direto da seção, e cada linha da
   ficha continua sendo uma `section` com `h4`: é o que as provas de FR-080 procuram, e é
   também a estrutura da ficha de papel que o documento imita. */
const classePlantao =
  'turno-execucao__registro grid min-w-0 gap-3 rounded-cartao border border-borda bg-superficie p-4';
const classeTituloPlantao = 'm-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]';
const classeLinha = 'grid min-w-0 gap-1';
const classeTituloLinha = 'm-0 text-(length:--texto-2) font-semibold leading-[1.4]';
const classeTexto = 'm-0 max-w-[68ch] text-(length:--texto-2) leading-[1.5]';
const classeNota = 'm-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave';

function LinhaDaFicha({
  nome,
  dados,
  eventos,
}: {
  nome: Linha;
  dados: FichaDoPlantao | undefined;
  eventos: readonly Evento[];
}) {
  const resposta =
    nome === 'Atividades'
      ? textoResposta(dados?.ficha?.atividades ?? null)
      : nome === 'Observações'
        ? textoResposta(dados?.ficha?.observacoes ?? null)
        : null;
  const pendencias = nome === 'Pendências' ? (dados?.pendencias ?? []) : [];
  const registros = eventos.filter((evento) => 'registrador_usuario_id' in evento.dados);
  const vazio = !resposta && !pendencias.length && !registros.length;
  return (
    <section className={classeLinha}>
      <h4 className={classeTituloLinha}>{nome}</h4>
      {resposta ? (
        <>
          <p className={`${classeTexto} whitespace-pre-wrap`}>{resposta.texto}</p>
          <p className={classeNota}>{resposta.marca}</p>
        </>
      ) : null}
      {pendencias.map((pendencia) => (
        <div key={pendencia.pendencia_id} className="grid min-w-0 gap-1">
          <p className={`${classeTexto} whitespace-pre-wrap`}>{pendencia.texto}</p>
          <p className={classeNota}>
            {`Origem: escrita por pessoa. Situação: ${
              pendencia.situacao === 'aberta' ? 'aberta' : 'resolvida'
            }. Registrada em ${dataTurno(pendencia.registrado_em)}.`}
          </p>
        </div>
      ))}
      {registros.map((evento) => {
        const registro = evento.dados;
        return 'registrador_usuario_id' in registro ? (
          <RegistroTurno key={evento.id} registro={registro} />
        ) : null;
      })}
      {vazio ? <p className={classeNota}>{VAZIO[nome]}</p> : null}
    </section>
  );
}

function BlocoPlantao({
  grupo,
  dados,
  temFichas,
}: {
  grupo: Plantao;
  dados: FichaDoPlantao | undefined;
  temFichas: boolean;
}) {
  const turno = grupo.turno;
  const porLinha = new Map<Linha | 'Aferições', Evento[]>();
  for (const evento of grupo.eventos) {
    const linha = linhaDoEvento(evento);
    if (!linha) continue;
    porLinha.set(linha, [...(porLinha.get(linha) ?? []), evento]);
  }
  const afericoes = porLinha.get('Aferições') ?? [];
  return (
    <article className={classePlantao}>
      <h4 className={classeTituloPlantao}>
        {turno ? 'Plantão' : 'Registros sem plantão identificado na consulta'}
      </h4>
      <div className="grid min-w-0 gap-1">
        {turno ? (
          <>
            <LinhaRegistro rotulo="Abertura registrada" valor={dataTurno(turno.aberto_em)} />
            <LinhaRegistro
              rotulo="Encerramento registrado"
              valor={
                turno.encerrado_em
                  ? dataTurno(turno.encerrado_em)
                  : 'Turno aberto no corte da consulta'
              }
            />
            <LinhaRegistro
              rotulo="Profissional"
              valor={
                turno.profissional_nome ??
                `identificador do profissional persistido ${turno.profissional_usuario_id}`
              }
            />
          </>
        ) : null}
        <LinhaRegistro
          rotulo="Plantão"
          valor={
            dados?.ficha?.periodo
              ? (PERIODOS[dados.ficha.periodo] ?? dados.ficha.periodo)
              : 'Não informado'
          }
        />
        <LinhaRegistro
          rotulo="Papel declarado"
          valor={dados?.ficha?.papel_declarado ?? 'Não informado'}
        />
        {dados?.ficha?.retroativo ? (
          <p className={classeNota}>
            Abertura retroativa declarada: a janela informada pelo profissional e o instante do
            servidor estão ambos gravados.
          </p>
        ) : null}
        {temFichas && !dados ? (
          <p className={classeNota}>
            Ficha do plantão não disponível para a sua audiência nesta consulta.
          </p>
        ) : null}
      </div>
      {LINHAS.map((nome) => (
        <LinhaDaFicha key={nome} nome={nome} dados={dados} eventos={porLinha.get(nome) ?? []} />
      ))}
      {afericoes.length ? (
        <section className={classeLinha}>
          <h4 className={classeTituloLinha}>Aferições registradas</h4>
          <p className={classeNota}>
            A ficha de papel não tem esta linha; os valores aparecem como registrados.
          </p>
          {afericoes.map((evento) => {
            const registro = evento.dados;
            return 'registrador_usuario_id' in registro ? (
              <RegistroTurno key={evento.id} registro={registro} />
            ) : null;
          })}
        </section>
      ) : null}
    </article>
  );
}

export function ConsolidadoFicha({
  relatorio,
  fichas,
}: {
  relatorio: RelatorioTurnoPublico;
  fichas?: ReadonlyMap<string, FichaDoPlantao>;
}) {
  const { plantoes, passagens, ordem } = agrupar(relatorio);
  return (
    <section className="grid min-w-0 gap-3">
      <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
        Consolidado diário no formato da ficha
      </h3>
      <p className={classeTexto}>
        {`${dataTurno(relatorio.inicio)} a ${dataTurno(relatorio.fim)}. Reunido a partir dos registros persistidos, conforme a sua autorização. Os registros continuam guardados evento a evento; aqui eles são apenas reunidos por plantão.`}
      </p>
      {!ordem.length && !passagens.length ? (
        <p className={classeTexto}>
          Nenhum registro neste período: nenhum plantão foi registrado neste dia. A consulta foi
          concluída e nada foi encontrado — não é falha, e não há dado de exemplo.
        </p>
      ) : null}
      {ordem.map((chave) => {
        const grupo = plantoes.get(chave);
        return grupo ? (
          <BlocoPlantao
            key={chave}
            grupo={grupo}
            dados={fichas?.get(chave)}
            temFichas={Boolean(fichas)}
          />
        ) : null;
      })}
      {passagens.length ? (
        <article className={classePlantao}>
          <h4 className={classeTituloPlantao}>Passagens de turno do período</h4>
          {passagens.map((evento) => {
            const dados = evento.dados;
            if (!('publicado_em' in dados)) return null;
            return (
              <div key={evento.id} className="grid min-w-0 gap-1">
                <LinhaRegistro
                  rotulo="Autor"
                  valor={
                    dados.autor_nome ??
                    `identificador do autor persistido ${dados.autor_usuario_id}`
                  }
                />
                <p className={classeTexto}>{`Publicada em ${dataTurno(dados.publicado_em)}`}</p>
                <p className={classeTexto}>
                  {dados.audiencia === 'equipe'
                    ? 'Audiência: equipe'
                    : 'Audiência: equipe e família'}
                </p>
                <p className={`${classeTexto} whitespace-pre-wrap`}>{dados.conteudo}</p>
              </div>
            );
          })}
        </article>
      ) : null}
      {relatorio.lacunas.map((lacuna) => (
        <p key={`${lacuna.inicio}-${lacuna.fim}`} className={classeNota}>
          {`Lacuna de cobertura: ${dataTurno(lacuna.inicio)} a ${dataTurno(lacuna.fim)}.`}
        </p>
      ))}
      <p className={classeNota}>
        Conteúdo apresentado como registrado, sem interpretação clínica automática e sem sugestão de
        conduta.
      </p>
    </section>
  );
}

/** Nó inerte do consolidado, usado pelas provas que leem o documento fora de uma ilha. */
export function apresentarConsolidadoFicha(
  relatorio: RelatorioTurnoPublico,
  fichas?: ReadonlyMap<string, FichaDoPlantao>,
): HTMLElement {
  return nodeDe(<ConsolidadoFicha relatorio={relatorio} fichas={fichas} />);
}
