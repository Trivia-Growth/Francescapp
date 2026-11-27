/* Visão do caso, reconstruída em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarVisaoCaso(raiz, paciente, fontes, acessoPerdido)`
 * devolve a desmontagem. `web/main.ts` não sabe que aqui dentro é React.
 *
 * O que a migração entrega:
 *
 * 1. VIS-012. A versão imperativa carregava uma bandeira `ativa` conferida em dois pontos
 *    e um mapa `geracoes` de números de montagem, incrementado à mão na desmontagem para
 *    invalidar resposta atrasada. Os dois sumiram: `ilha()` desmonta a raiz React e os
 *    efeitos são cancelados por construção. Sobrou só a guarda de GERAÇÃO dentro do
 *    efeito de cada bloco — que não é guarda de vida, e sim o que impede a resposta de
 *    uma tentativa anterior sobrescrever a tentativa seguinte do mesmo bloco.
 * 2. Barreira por bloco. Um bloco que falha continua falhando sozinho, com "Tentar
 *    novamente" próprio, e os demais permanecem legíveis — o mesmo que já valia, agora
 *    com o estado desenhado por `EstadoErro` em vez de `<p data-tone="error">` à mão.
 * 3. Superfície plana do `DESIGN.md`: uma superfície por assunto, filete e espaço, sem
 *    caixa dentro de caixa.
 *
 * O que NÃO mudou, de propósito (VIS-018):
 *
 * - **Nenhuma frase mudou de palavra.** Nem rótulo, nem aviso, nem estado vazio.
 * - A revalidação de acesso esvazia o conteúdo antes de chamar `acessoPerdido`.
 *   A recusa de Anamnese para o administrador da carteira integral fica no próprio bloco.
 * - **Fonte ausente e fonte que falhou continuam estados DIFERENTES.** Bloco sem fonte não
 *   é montado: a visão mostra o que o perfil lê, e nunca anuncia o que falta nem inventa
 *   valor de exemplo. Bloco com fonte que falhou mostra a causa e a recuperação.
 * - **Zero confirmado continua distinto de indisponível** (VIS-014): sem data conhecida o
 *   bloco cala, em vez de repetir "indisponível" em cada seção.
 *
 * Por que a listagem dos blocos NÃO virou `Lista` (VIS-016): os blocos da visão não são
 * conjunto comparável. "Pendências" mistura próxima revisão com motivos de tipos
 * diferentes, "Situação e responsável" é par rótulo/valor, e "Anamnese" é coluna única. O
 * conjunto comparável mora na tela de origem, alcançada pelo link "Ver em …" de cada
 * bloco. Forçar colunas aqui também quebraria a leitura contígua que as provas afirmam
 * ("Revisão prevista: 01/12/2026" é uma frase, não duas células).
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Anamnese, PacienteEdicao } from '../packages/contracts/src/index.js';
import {
  avisoSinalOperacional,
  rotulosEstadoSinal,
  rotulosTipoPendencia,
  type SinalOperacional,
} from '../packages/contracts/src/pendencia.js';
import type { RegistroTarefaCuidado as RegistroTarefa } from '../packages/contracts/src/tarefa-cuidado.js';
import {
  descreverResponsavel,
  rotulosSituacao,
  type ResponsavelOpcao,
} from './acompanhamento-caso.js';
import { exigeNovoAcesso, mensagemFalha, semPermissao } from './api.js';
import { Botao } from './componentes/ui/botao.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { EstadoErro } from './componentes/ui/estado-erro.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { Superficie } from './componentes/ui/superficie.js';
import { dataDeInstante } from './datas.js';
import './estilos/tema.css';
import { hashFicha, type PacienteFicha } from './ficha-paciente.js';
import type { ObjetivoAtual, Pagina, ServicoPlanoCuidado } from './plano-cuidado.js';
import { ilha } from './ponte/ilha.js';
import type { ServicoTarefasCuidado } from './tarefas-cuidado.js';

/** Fontes consultadas pela visão. Fonte ausente significa que o perfil não a lê: o bloco nem aparece. */
export type FontesVisaoCaso = {
  objetivos?: Pick<ServicoPlanoCuidado, 'consultarObjetivos'>;
  tarefas?: Pick<ServicoTarefasCuidado, 'consultarTarefas'>;
  anamnese?: {
    consultarAnamnese(pacienteId: string): Promise<Anamnese | null>;
    confirmarRecusaIsolada?: () => Promise<boolean>;
  };
  /** Só o Administrador: situação e responsável vêm da leitura de edição, que o servidor nega aos demais. */
  situacao?: {
    consultarPaciente(pacienteId: string): Promise<PacienteEdicao>;
    listarResponsaveis?: () => Promise<ResponsavelOpcao[]>;
  };
  /** FR-006: pendências, próxima revisão e data da última mudança do caso. As três vinham
   * anunciadas como indisponíveis; agora têm fonte real no sinal operacional do caso. */
  pendencias?: { consultar(pacienteId: string): Promise<SinalOperacional> };
};

const LIMITE_TAREFAS = 8;
const OBJETIVOS_ENCERRADOS = new Set(['atingido', 'encerrado']);

function dataCivil(valor: string): string {
  const [ano, mes, dia] = valor.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function maisRecente(instantes: (string | undefined)[]): string | undefined {
  return instantes
    .filter((valor): valor is string => Boolean(dataDeInstante(valor)))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

/** O que `desenhar` devolve: o conteúdo do bloco e, quando existem, o aviso e a data. */
type Corpo = { conteudo: ReactNode; aviso?: string; atualizadoEm?: string };

/** Seção da ficha onde o bloco tem a leitura completa (decisão de design 4: toda leitura
 *  de FR-006 oferece acesso à origem). `rotulo` repete o texto do `SecaoFicha`
 *  correspondente em `secoesDaFicha` (`web/main.ts`); os dois não são o mesmo módulo de
 *  propósito, então renomear uma aba lá exige atualizar o rótulo aqui também. */
type Origem = { secao: string; rotulo: string };

/** Lista de leitura do bloco. Cada item é UMA frase, não uma linha de colunas: as provas
 *  afirmam a frase inteira contígua, e quem lê também a lê assim. */
function ListaDeLeitura({ itens }: { itens: readonly string[] }) {
  return (
    <ul className="m-0 grid min-w-0 list-disc gap-1 pl-5">
      {itens.map((item) => (
        <li key={item} className="min-w-0 text-(length:--texto-2) leading-[1.5]">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A moldura de um bloco: título, acesso à origem e a região que carrega.
 *
 *  `Superficie` entra SEM `titulo` de propósito. O cabeçalho dela monta um `<h2>`, e a
 *  visão já tem um `<h2>` próprio — o título do bloco é `<h3>`, como na versão imperativa.
 *  Rebaixar a hierarquia de cabeçalho seria regressão de acessibilidade, e VIS-018 não
 *  permite trocar comportamento por conveniência de componente. */
function MolduraBloco({
  id,
  titulo,
  origem,
  pacienteId,
  children,
}: {
  id: string;
  titulo: string;
  origem?: Origem;
  pacienteId: string;
  children: ReactNode;
}) {
  return (
    <div data-bloco={id} className="min-w-0">
      <Superficie>
        <div className="grid min-w-0 gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
              {titulo}
            </h3>
            {origem === undefined ? null : (
              <a
                href={hashFicha(pacienteId, origem.secao)}
                className="text-(length:--texto-1) font-semibold text-primaria underline-offset-4 hover:underline"
              >
                Ver em {origem.rotulo}
              </a>
            )}
          </div>
          <div className="grid min-w-0 gap-3">{children}</div>
        </div>
      </Superficie>
    </div>
  );
}

type Fase<T> =
  | { fase: 'carregando' }
  | { fase: 'pronto'; dados: T }
  | { fase: 'erro'; erro: unknown };

/** Um bloco que consulta, falha e tenta de novo SOZINHO.
 *
 *  A guarda `valida` do efeito não é a antiga bandeira `ativa`: a vida do bloco quem
 *  governa é a desmontagem da ilha. Ela só impede que a resposta da tentativa anterior
 *  chegue depois da seguinte e sobrescreva o que está na tela — o papel que o mapa
 *  `geracoes` cumpria antes, agora delimitado pelo próprio efeito. */
function Bloco<T>({
  id,
  titulo,
  origem,
  pacienteId,
  consultar,
  desenhar,
  aoPerderAcesso,
  confirmarRecusaIsolada,
}: {
  id: string;
  titulo: string;
  origem?: Origem;
  pacienteId: string;
  consultar: () => Promise<T>;
  desenhar: (dados: T) => Corpo;
  aoPerderAcesso: (erro: unknown) => void;
  confirmarRecusaIsolada?: () => Promise<boolean>;
}) {
  const [tentativa, definirTentativa] = useState(0);
  const [estado, definirEstado] = useState<Fase<T>>({ fase: 'carregando' });

  /* As três funções mudam de identidade a cada render do pai; guardá-las em referência
     mantém o efeito preso à TENTATIVA, que é o que de fato deve recarregar o bloco. */
  const consultarAgora = useRef(consultar);
  consultarAgora.current = consultar;
  const perderAcesso = useRef(aoPerderAcesso);
  perderAcesso.current = aoPerderAcesso;
  const confirmarAgora = useRef(confirmarRecusaIsolada);
  confirmarAgora.current = confirmarRecusaIsolada;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tentativa` não é lida no corpo de propósito — é o GATILHO de recarga do bloco, o que o botão "Tentar novamente" incrementa. Tirá-la daqui faria a nova tentativa não acontecer.
  useEffect(() => {
    let valida = true;
    definirEstado({ fase: 'carregando' });
    consultarAgora.current().then(
      (dados) => {
        if (!valida) return;
        // `flushSync` porque o contrato que estamos preservando é síncrono: quem monta a
        // visão e lê a raiz logo depois — `main.ts` e as provas de tela — não espera o
        // agendador do React. Sem isto a pintura cairia numa macrotarefa posterior.
        flushSync(() => definirEstado({ fase: 'pronto', dados }));
      },
      async (erro: unknown) => {
        if (!valida) return;
        if (exigeNovoAcesso(erro)) {
          let preservaBloco = false;
          let recusa = erro;
          if (semPermissao(erro) && confirmarAgora.current) {
            try {
              preservaBloco = await confirmarAgora.current();
            } catch (falha) {
              if (exigeNovoAcesso(falha)) recusa = falha;
            }
          }
          if (!valida) return;
          if (!preservaBloco) {
            perderAcesso.current(recusa);
            return;
          }
        }
        flushSync(() => definirEstado({ fase: 'erro', erro }));
      },
    );
    return () => {
      valida = false;
    };
  }, [tentativa]);

  function corpo(): ReactNode {
    if (estado.fase === 'carregando')
      return (
        <>
          {/* Vazio de propósito: a regra global de `web/styles.css` desenha a forma do que
              vem para a região `[aria-busy] :empty`, com o atraso que impede o piscar. */}
          <Esqueleto ocupado />
          <p className="sr-only">Carregando…</p>
        </>
      );
    if (estado.fase === 'erro')
      return (
        <EstadoErro
          titulo={mensagemFalha(estado.erro)}
          texto="Este bloco não foi carregado."
          acao={
            <Botao peso="secundario" aoAtivar={() => definirTentativa((valor) => valor + 1)}>
              Tentar novamente
            </Botao>
          }
        />
      );
    const { conteudo, aviso, atualizadoEm } = desenhar(estado.dados);
    // Sem data conhecida o bloco não diz nada: repetir "indisponível" em cada bloco faz a
    // tela principal do caso parecer um relatório de falhas.
    const data = dataDeInstante(atualizadoEm);
    return (
      <>
        {conteudo}
        {aviso === undefined ? null : (
          <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">{aviso}</p>
        )}
        {data === undefined || data === null || data === '' ? null : (
          <p className="m-0 text-(length:--texto-1) text-texto-suave">{`Atualizado em ${data}.`}</p>
        )}
      </>
    );
  }

  return (
    <MolduraBloco id={id} titulo={titulo} origem={origem} pacienteId={pacienteId}>
      {corpo()}
    </MolduraBloco>
  );
}

function TelaVisaoCaso({
  paciente,
  fontes,
  acessoPerdido,
}: {
  paciente: PacienteFicha;
  fontes: FontesVisaoCaso;
  acessoPerdido: (erro: unknown) => boolean;
}) {
  const [descartada, definirDescartada] = useState(false);
  /* Uma vez só: dois blocos podem receber 403 no mesmo instante, e o fluxo de nova entrada
     não pode ser disparado duas vezes. Era o que a bandeira `ativa` garantia de carona. */
  const jaPerdeu = useRef(false);
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;

  const aoPerderAcesso = useCallback((erro: unknown) => {
    if (jaPerdeu.current) return;
    jaPerdeu.current = true;
    // A raiz é esvaziada ANTES de avisar: o fluxo de nova entrada nunca pode encontrar
    // conteúdo de caso na tela por trás dele.
    flushSync(() => definirDescartada(true));
    avisarPerda.current(erro);
  }, []);

  if (descartada) return null;

  const { objetivos, tarefas, anamnese, situacao, pendencias } = fontes;
  const comum = { pacienteId: paciente.id, aoPerderAcesso };

  return (
    <div className="grid min-w-0 gap-5">
      <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
        Visão do caso
      </h2>

      <MolduraBloco id="identificacao" titulo="Identificação" pacienteId={paciente.id}>
        {/* Nome é dado que se PROCURA, não prosa: Raleway, nunca a serifa. */}
        <p className="m-0 text-(length:--texto-3) font-semibold">{paciente.nome}</p>
        <p className="m-0 text-texto-suave">
          {paciente.nome_preferencia
            ? `Nome de preferência: ${paciente.nome_preferencia}`
            : 'Nome de preferência não informado.'}
        </p>
      </MolduraBloco>

      {pendencias === undefined ? null : (
        <Bloco<SinalOperacional>
          {...comum}
          id="pendencias"
          titulo="Pendências e próxima revisão"
          origem={{ secao: 'pendencias', rotulo: 'Pendências' }}
          consultar={() => pendencias.consultar(paciente.id)}
          desenhar={(sinal) => {
            const abertas = sinal.pendencias.filter((item) => item.estado !== 'resolvida');
            const linhas = [
              ...(sinal.acordo?.proxima_revisao_em
                ? [`Próxima revisão: ${dataCivil(sinal.acordo.proxima_revisao_em)}`]
                : []),
              ...abertas.map(
                (item) =>
                  `${rotulosTipoPendencia[item.tipo]}: ${item.motivo}${
                    item.estado === 'aberta' ? '' : ` (${item.estado})`
                  }`,
              ),
            ];
            return {
              conteudo: (
                <>
                  <MarcaEstado data-estado={sinal.estado}>
                    {rotulosEstadoSinal[sinal.estado]}
                  </MarcaEstado>
                  <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
                    {avisoSinalOperacional}
                  </p>
                  {linhas.length ? (
                    <ListaDeLeitura itens={linhas} />
                  ) : (
                    <EstadoVazio
                      titulo={
                        sinal.estado === 'informacao_insuficiente'
                          ? 'Periodicidade do acompanhamento ainda não acordada: não há como apurar pendências.'
                          : 'Nenhuma pendência operacional em aberto.'
                      }
                    />
                  )}
                </>
              ),
              // "Mudanças recentes" de FR-006: a data da última gravação em qualquer fatia
              // do caso. Mostra quando o caso mudou, sem repetir o conteúdo que já tem
              // tela própria.
              ...(sinal.ultima_atualizacao_em ? { atualizadoEm: sinal.ultima_atualizacao_em } : {}),
            };
          }}
        />
      )}

      {situacao === undefined ? null : (
        <Bloco<{ edicao: PacienteEdicao; opcoes: ResponsavelOpcao[] }>
          {...comum}
          id="situacao"
          titulo="Situação e responsável"
          origem={{ secao: 'cadastro', rotulo: 'Cadastro' }}
          consultar={async () => {
            const edicao = await situacao.consultarPaciente(paciente.id);
            if (edicao.id.toLowerCase() !== paciente.id.toLowerCase()) throw new Error();
            let opcoes: ResponsavelOpcao[] = [];
            if (situacao.listarResponsaveis)
              try {
                opcoes = await situacao.listarResponsaveis();
              } catch (erro) {
                // Sem a lista da equipe o responsável aparece sem identificação, mas a
                // situação não se perde.
                if (exigeNovoAcesso(erro)) throw erro;
              }
            return { edicao, opcoes };
          }}
          desenhar={({ edicao, opcoes }) => {
            const atual = edicao.acompanhamento[0];
            if (!atual)
              return {
                conteudo: (
                  <EstadoVazio titulo="A completar: situação do caso e responsável ainda não indicados." />
                ),
              };
            return {
              conteudo: (
                <ListaDeLeitura
                  itens={[
                    `Situação: ${atual.situacao ? rotulosSituacao[atual.situacao] : 'a completar'}`,
                    `Responsável: ${descreverResponsavel(atual, opcoes)}`,
                  ]}
                />
              ),
              atualizadoEm: atual.criado_em,
            };
          }}
        />
      )}

      {objetivos === undefined ? null : (
        <Bloco<Pagina<ObjetivoAtual & { data?: string }>>
          {...comum}
          id="objetivos"
          titulo="Objetivos ativos"
          origem={{ secao: 'plano', rotulo: 'Plano de cuidado' }}
          consultar={() => objetivos.consultarObjetivos(paciente.id)}
          desenhar={(pagina) => {
            const ativos = pagina.itens.filter(
              ({ objetivo }) => !OBJETIVOS_ENCERRADOS.has(objetivo.estado),
            );
            const recente = maisRecente(pagina.itens.map((item) => item.data));
            return {
              conteudo: ativos.length ? (
                <ListaDeLeitura
                  itens={ativos.map(
                    ({ objetivo }) =>
                      `${objetivo.descricao} · ${objetivo.estado} · Revisão prevista: ${dataCivil(objetivo.dataRevisao)}`,
                  )}
                />
              ) : (
                <EstadoVazio titulo="Nenhum objetivo ativo nesta consulta." />
              ),
              ...(pagina.proximo_cursor
                ? {
                    aviso:
                      'Há mais objetivos no Plano de cuidado; esta visão mostra só os primeiros.',
                  }
                : {}),
              ...(recente ? { atualizadoEm: recente } : {}),
            };
          }}
        />
      )}

      {tarefas === undefined ? null : (
        <Bloco<RegistroTarefa[]>
          {...comum}
          id="tarefas"
          titulo="Tarefas pendentes"
          origem={{ secao: 'tarefas', rotulo: 'Tarefas' }}
          consultar={() => tarefas.consultarTarefas(paciente.id)}
          desenhar={(registros) => {
            const abertas = registros
              .filter(
                ({ tarefa }) => tarefa.estado === 'pendente' || tarefa.estado === 'em_andamento',
              )
              .sort((a, b) => a.tarefa.prazo.localeCompare(b.tarefa.prazo));
            const recente = maisRecente(registros.map((registro) => registro.data));
            return {
              conteudo: abertas.length ? (
                <ListaDeLeitura
                  itens={abertas
                    .slice(0, LIMITE_TAREFAS)
                    .map(
                      ({ tarefa }) =>
                        `${tarefa.descricao} · ${tarefa.responsavel} · Prazo: ${dataCivil(tarefa.prazo)}`,
                    )}
                />
              ) : (
                <EstadoVazio titulo="Nenhuma tarefa em aberto." />
              ),
              ...(abertas.length > LIMITE_TAREFAS
                ? { aviso: `Há mais ${abertas.length - LIMITE_TAREFAS} tarefas na seção Tarefas.` }
                : {}),
              ...(recente ? { atualizadoEm: recente } : {}),
            };
          }}
        />
      )}

      {anamnese === undefined ? null : (
        <Bloco<Anamnese | null>
          {...comum}
          id="anamnese"
          titulo="Anamnese"
          origem={{ secao: 'anamnese', rotulo: 'Anamnese' }}
          confirmarRecusaIsolada={anamnese.confirmarRecusaIsolada}
          consultar={() => anamnese.consultarAnamnese(paciente.id)}
          desenhar={(registro) => {
            if (!registro)
              return { conteudo: <EstadoVazio titulo="Nenhuma anamnese registrada ainda." /> };
            const incompletas = registro.secoes
              .filter((secao) =>
                secao.camposEsperados.some((campo) => {
                  const resposta = secao.respostas.find((item) => item.campo === campo);
                  return !resposta || resposta.estado === 'pendente';
                }),
              )
              .map((secao) => secao.id);
            return {
              conteudo: (
                <>
                  <p className="m-0 max-w-[68ch]">
                    {incompletas.length
                      ? 'Seções com pendências:'
                      : 'Nenhuma pendência identificada nos campos informados.'}
                  </p>
                  {incompletas.length ? <ListaDeLeitura itens={incompletas} /> : null}
                </>
              ),
              ...(registro.criado_em ? { atualizadoEm: registro.criado_em } : {}),
            };
          }}
        />
      )}
    </div>
  );
}

/** Compõe o caso a partir dos serviços que já existem; cada bloco carrega, falha e tenta de novo sozinho. */
export function montarVisaoCaso(
  raiz: HTMLElement,
  paciente: PacienteFicha,
  fontes: FontesVisaoCaso,
  acessoPerdido: (erro: unknown) => boolean,
): () => void {
  return ilha(
    raiz,
    <TelaVisaoCaso paciente={paciente} fontes={fontes} acessoPerdido={acessoPerdido} />,
  );
}
