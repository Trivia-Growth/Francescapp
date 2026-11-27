/** FR-073 a FR-077, FR-081. Ficha de plantão em React (VIS-018): superfície ÚNICA de
 * registro do AT e da enfermagem, na ordem e no vocabulário da ficha de papel que a equipe
 * já usa.
 *
 * A ficha é tela de entrada, não armazenamento novo. Rotina, Alimentação, Medicação e
 * Intercorrências continuam vivendo nas tabelas canônicas de FR-059/FR-060/FR-061/FR-064 e
 * aparecem aqui como encaminhamento para o registro canônico — nunca como campo de texto
 * livre. Medicação em especial: prescrição e administração são registros distintos, com
 * executor distinto do registrador, e virar linha de texto destruiria essa separação.
 *
 * Nenhuma leitura clínica é derivada de campo nenhum: não há pontuação, escala,
 * classificação de gravidade, alerta, tendência nem sugestão de conduta.
 *
 * O protocolo não mudou com a migração: a publicação leva o retrato id->versão do modelo
 * mostrado, resultado incerto guarda a tentativa até a ficha ser conferida, e a repetição
 * envia o MESMO conteúdo com a MESMA chave. Os controles são não controlados — o DOM é
 * dono do valor — e cada recarga troca a chave do formulário para ele nascer com o que o
 * servidor devolveu, como a versão imperativa fazia ao redesenhar. */
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  CampoExtraCatalogoGeneralizado,
  VisibilidadeCampoExtra,
} from '../packages/contracts/src/campo-extra-catalogo.ts';
import type {
  ConteudoFichaPlantao,
  FonteInformacao,
  RespostaPlantao,
  SnapshotModeloFicha,
} from '../packages/contracts/src/ficha-plantao.ts';
import type {
  FichaPlantaoProjetada,
  PendenciaPlantaoHttp,
} from '../packages/contracts/src/ficha-plantao-http.ts';
import type { PapelDeclarado } from '../packages/contracts/src/papel-declarado.ts';
import type { Turno } from '../packages/contracts/src/turno.ts';
import { FalhaApi, resultadoIncerto } from './api.ts';
import { Botao } from './componentes/ui/botao.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import type {
  ServicoModeloFormulario,
  ServicoPapelDeclarado,
} from './servico-catalogo-administrado-http.ts';
import type { ServicoFichaPlantao } from './servico-ficha-plantao-http.ts';
import { Formulario, valorDe } from './telas/formulario.js';
import {
  CampoTurno,
  EstadoTurno,
  SelecaoTurno,
  dataLocalTurno,
  instanteTurno,
  usarProtocoloTurno,
} from './turno-execucao-campos.js';

/** Campos de fábrica semeados em `20261127120000_modelo_ficha_plantao_campos_fabrica.sql`.
 * O identificador é estável; o nome e a ordem são do Administrador e podem mudar. */
const CAMPOS_DE_FABRICA = {
  '7f1c0001-0000-4000-8000-000000000001': 'estado_emocional',
  '7f1c0001-0000-4000-8000-000000000002': 'rotina',
  '7f1c0001-0000-4000-8000-000000000003': 'atividades',
  '7f1c0001-0000-4000-8000-000000000004': 'alimentacao',
  '7f1c0001-0000-4000-8000-000000000005': 'medicacao',
  '7f1c0001-0000-4000-8000-000000000006': 'intercorrencias',
  '7f1c0001-0000-4000-8000-000000000007': 'observacoes',
  '7f1c0001-0000-4000-8000-000000000008': 'pendencias',
} as const;
type CampoDeFabrica = (typeof CAMPOS_DE_FABRICA)[keyof typeof CAMPOS_DE_FABRICA];

/** Onde cada campo da ficha é de fato persistido. Aparece na tela porque o AT precisa saber
 * que o que ele escreve aqui não vira um segundo registro em outro lugar. */
const ONDE_GRAVA: Readonly<Record<CampoDeFabrica, string>> = {
  estado_emocional:
    'Gravado como observação declarada do plantão, com quem observou e quando. Sem nota, escala ou classificação.',
  rotina: 'Registrado no acompanhamento de rotina do turno, evento a evento.',
  atividades: 'Gravado no registro do plantão, com quem escreveu e quando.',
  alimentacao: 'Registrado no acompanhamento de rotina do turno, refeição a refeição.',
  medicacao:
    'Registrado em prescrição e em administração, que são registros separados: quem administrou não é necessariamente quem registrou.',
  intercorrencias: 'Registrado como ocorrência do turno, uma a uma.',
  observacoes: 'Gravado no registro do plantão, com quem escreveu e quando.',
  pendencias: 'Gravada como pendência escrita do plantão, com autor, instante e situação.',
};

/** Campos cujo conteúdo é canônico: a ficha os apresenta e encaminha, nunca os redige. */
const CANONICOS: ReadonlySet<CampoDeFabrica> = new Set([
  'rotina',
  'alimentacao',
  'medicacao',
  'intercorrencias',
]);

const FONTES: readonly { valor: FonteInformacao; rotulo: string }[] = [
  { valor: 'observacao_direta', rotulo: 'Observei diretamente' },
  { valor: 'relato_paciente', rotulo: 'Relato do paciente' },
  { valor: 'relato_familiar', rotulo: 'Relato de familiar' },
  { valor: 'documento', rotulo: 'Documento' },
];

const VISIBILIDADES: readonly { valor: RespostaPlantao['visibilidade']; rotulo: string }[] = [
  { valor: 'interna', rotulo: 'Nota interna da equipe' },
  { valor: 'compartilhavel', rotulo: 'A família autorizada pode ler' },
];

const PERIODOS = [
  { valor: 'diurno', rotulo: 'Diurno' },
  { valor: 'noturno', rotulo: 'Noturno' },
] as const;

const DECLARACAO = [
  { valor: 'nao', rotulo: 'Não' },
  { valor: 'sim', rotulo: 'Sim — declarar a janela real que cumpri' },
] as const;

function rotuloVisibilidade(valor: VisibilidadeCampoExtra): string {
  return valor === 'compartilhavel'
    ? 'A família autorizada pode ler este campo.'
    : 'Nota interna da equipe. A família não lê este campo.';
}

export type ServicosFichaPlantao = {
  ficha: ServicoFichaPlantao;
  modelo: ServicoModeloFormulario;
  papeis: ServicoPapelDeclarado;
};

type Opcoes = {
  pacienteId: string;
  turno: Turno | null;
  acessoPerdido(erro: unknown): void;
  alteracaoPendente?(valor: boolean): void;
};

/** Limites do contrato, aplicados no próprio controle: a tela não pode aceitar — nem
 * oferecer — valor que ela mesma vai recusar depois, porque a recusa chegaria à pessoa como
 * um "serviço indisponível" enganoso em vez de um erro legível. */
const LIMITE_TEXTO = 4000;
const LIMITE_ROTULO = 80;

type Carregada = {
  modelo: CampoExtraCatalogoGeneralizado[];
  papeis: PapelDeclarado[];
  publicada: FichaPlantaoProjetada | null;
  pendencias: PendenciaPlantaoHttp[];
  rascunho: ConteudoFichaPlantao | null;
};
type Tentativa = { entrada: ConteudoFichaPlantao; chave: string; consultada: boolean };

const chaveDe = (campo: CampoExtraCatalogoGeneralizado): CampoDeFabrica | null =>
  CAMPOS_DE_FABRICA[campo.campo_id as keyof typeof CAMPOS_DE_FABRICA] ?? null;

/** A resposta que o formulário mostra para um campo: o rascunho do servidor, quando há, por
 *  cima do que foi publicado. */
function respostaInicial(
  campo: CampoExtraCatalogoGeneralizado,
  chave: CampoDeFabrica | null,
  dados: Carregada,
): RespostaPlantao | null {
  const { publicada, rascunho } = dados;
  if (chave === 'atividades') return rascunho?.atividades ?? publicada?.atividades ?? null;
  if (chave === 'observacoes') return rascunho?.observacoes ?? publicada?.observacoes ?? null;
  if (chave === 'pendencias') return rascunho?.pendencias?.[0]?.conteudo ?? null;
  if (chave === null)
    return (
      rascunho?.respostas?.find((item) => item.campo_id === campo.campo_id) ??
      publicada?.respostas.find((item) => item.campo_id === campo.campo_id) ??
      null
    );
  return null;
}

/** Leitura única do formulário, usada pelo rascunho e pela publicação. */
function coletar(formulario: HTMLFormElement, modelo: CampoExtraCatalogoGeneralizado[]) {
  const conteudo: ConteudoFichaPlantao = {};
  const periodo = valorDe(formulario, 'periodo');
  if (periodo === 'diurno' || periodo === 'noturno') conteudo.periodo = periodo;
  const papel = valorDe(formulario, 'papel');
  if (papel) conteudo.papel_declarado = papel;
  if (valorDe(formulario, 'declarar') === 'sim') {
    const inicio = valorDe(formulario, 'janela_inicio');
    const fim = valorDe(formulario, 'janela_fim');
    if (!inicio || !fim) throw new Error('Informe o início e o fim da janela declarada.');
    conteudo.janela_declarada = { inicio: instanteTurno(inicio), fim: instanteTurno(fim) };
  }
  const escritas: NonNullable<ConteudoFichaPlantao['pendencias']> = [];
  const acrescentadas: NonNullable<ConteudoFichaPlantao['respostas']> = [];
  for (const campo of modelo) {
    if (!campo.ativo) continue;
    const chave = chaveDe(campo);
    if (chave && CANONICOS.has(chave)) continue;
    const texto = valorDe(formulario, `texto-${campo.campo_id}`).trim();
    if (campo.obrigatorio && !texto)
      throw new Error(`Preencha o campo obrigatório: ${campo.nome}.`);
    if (!texto) continue;
    if (chave === 'estado_emocional') {
      conteudo.estado_emocional = { estado: texto, instante_ocorrencia: new Date().toISOString() };
      continue;
    }
    const detalhe = {
      texto,
      fonte: (valorDe(formulario, `fonte-${campo.campo_id}`) ||
        'observacao_direta') as FonteInformacao,
      visibilidade: (valorDe(formulario, `visibilidade-${campo.campo_id}`) ||
        campo.visibilidade) as RespostaPlantao['visibilidade'],
    };
    if (chave === 'atividades') conteudo.atividades = detalhe;
    else if (chave === 'observacoes') conteudo.observacoes = detalhe;
    else if (chave === 'pendencias')
      escritas.push({ pendencia_id: crypto.randomUUID(), conteudo: detalhe });
    else if (chave === null) acrescentadas.push({ campo_id: campo.campo_id, ...detalhe });
  }
  if (escritas.length) conteudo.pendencias = escritas;
  if (acrescentadas.length) conteudo.respostas = acrescentadas;
  return conteudo;
}

const classeGrupo = 'm-0 grid min-w-0 gap-2 rounded-cartao border border-borda p-4';
const classeLegenda = 'px-1 text-(length:--texto-2) font-semibold';
const classeTexto = 'm-0 max-w-[68ch]';

function Grupo({ legenda, children }: { legenda: string; children: ReactNode }) {
  return (
    <fieldset className={classeGrupo}>
      <legend className={classeLegenda}>{legenda}</legend>
      {children}
    </fieldset>
  );
}

function Resposta({
  campo,
  chave,
  valor,
  longo,
}: {
  campo: CampoExtraCatalogoGeneralizado;
  chave: CampoDeFabrica | null;
  valor: RespostaPlantao | null;
  longo: boolean;
}) {
  return (
    <Grupo legenda={campo.nome}>
      {chave ? <p className={classeTexto}>{ONDE_GRAVA[chave]}</p> : null}
      <p className={classeTexto}>{rotuloVisibilidade(campo.visibilidade)}</p>
      <CampoTurno
        rotulo={campo.obrigatorio ? `${campo.nome} (obrigatório)` : campo.nome}
        nome={`texto-${campo.campo_id}`}
        longo={longo}
        obrigatorio={campo.obrigatorio}
        maxLength={LIMITE_TEXTO}
        valor={valor?.texto ?? ''}
        ajuda="Registre o que foi observado ou feito. Nada aqui é interpretado pelo sistema."
      />
      <SelecaoTurno
        rotulo="De onde veio a informação"
        nome={`fonte-${campo.campo_id}`}
        opcoes={FONTES}
        valor={valor?.fonte ?? 'observacao_direta'}
      />
      <SelecaoTurno
        rotulo="Quem pode ler"
        nome={`visibilidade-${campo.campo_id}`}
        opcoes={VISIBILIDADES}
        valor={valor?.visibilidade ?? campo.visibilidade}
      />
    </Grupo>
  );
}

export function FichaPlantao({
  servicos,
  pacienteId,
  turno,
  acessoPerdido,
  alteracaoPendente,
}: Opcoes & { servicos: ServicosFichaPlantao }) {
  const { viva, ocupadaRef, ocupada, definirOcupada, perdida, falha, status, definirStatus } =
    usarProtocoloTurno('Carregando a ficha do plantão…', acessoPerdido);
  const pendente = useRef(alteracaoPendente);
  pendente.current = alteracaoPendente;
  const [dados, definirDados] = useState<Carregada | null>(null);
  const dadosRef = useRef<Carregada | null>(null);
  const [geracao, definirGeracao] = useState(0);
  const [carregando, definirCarregando] = useState(false);
  const [retro, definirRetro] = useState(false);
  const formularioRef = useRef<HTMLDivElement>(null);
  const tentativaRef = useRef<Tentativa | null>(null);
  const [tentativa, espelharTentativa] = useState<Tentativa | null>(null);
  /** Retrato id->versão do modelo que esta tela está mostrando. Vai junto da publicação e o
   * banco o revalida sob lock: se o Administrador mexeu no modelo enquanto a ficha era
   * preenchida, a publicação é recusada com conflito em vez de gravar contra outro modelo. */
  const retratoRef = useRef<SnapshotModeloFicha>({});

  const definirTentativa = useCallback((valor: Tentativa | null) => {
    tentativaRef.current = valor;
    espelharTentativa(valor ? { ...valor } : null);
  }, []);

  const carregar = useCallback(async () => {
    if (!viva() || ocupadaRef.current || !turno) return;
    definirOcupada(true);
    definirCarregando(true);
    definirStatus('Carregando a ficha do plantão…');
    try {
      const [modelo, papeis, resultado, rascunho] = await Promise.all([
        servicos.modelo.consultar(),
        servicos.papeis.consultar(),
        servicos.ficha.consultar(pacienteId, turno.turno_id),
        servicos.ficha.consultarRascunho(pacienteId, turno.turno_id),
      ]);
      if (!viva()) return;
      const atual = tentativaRef.current;
      if (atual && resultado.ficha) definirTentativa(null);
      else if (atual) definirTentativa({ ...atual, consultada: true });
      retratoRef.current = Object.fromEntries(
        modelo.map((campo) => [campo.campo_id.toLowerCase(), campo.versao]),
      );
      const carregada: Carregada = {
        modelo,
        papeis,
        publicada: resultado.ficha,
        pendencias: resultado.pendencias,
        rascunho: rascunho?.conteudo ?? null,
      };
      dadosRef.current = carregada;
      definirDados(carregada);
      definirRetro(false);
      definirGeracao((anterior) => anterior + 1);
      definirStatus(
        rascunho
          ? `Rascunho não publicado recuperado, guardado em ${new Date(rascunho.atualizado_em).toLocaleString('pt-BR')}. Nada foi publicado nesse intervalo.`
          : resultado.ficha
            ? 'Ficha publicada carregada. Qualquer correção cria uma versão nova com motivo.'
            : 'Ficha em branco. Nada foi publicado neste plantão ainda.',
      );
    } catch (erro) {
      dadosRef.current = null;
      definirDados(null);
      falha(erro);
    } finally {
      definirCarregando(false);
      definirOcupada(false);
    }
  }, [
    viva,
    ocupadaRef,
    turno,
    definirOcupada,
    definirStatus,
    servicos,
    pacienteId,
    definirTentativa,
    falha,
  ]);

  const formulario = () => formularioRef.current?.querySelector('form') ?? null;

  async function salvarRascunho() {
    const atuais = dadosRef.current;
    const alvo = formulario();
    if (!viva() || ocupadaRef.current || !turno || !atuais || !alvo) return;
    let conteudo: ConteudoFichaPlantao;
    try {
      conteudo = coletar(alvo, atuais.modelo);
    } catch (erro) {
      definirStatus(erro instanceof Error ? erro.message : 'Confira os campos da ficha.');
      return;
    }
    definirOcupada(true);
    definirStatus('Guardando o rascunho no servidor…');
    try {
      const salvo = await servicos.ficha.salvarRascunho(pacienteId, turno.turno_id, conteudo);
      if (!viva()) return;
      pendente.current?.(false);
      definirStatus(
        salvo
          ? `Rascunho guardado em ${new Date(salvo.atualizado_em).toLocaleString('pt-BR')}. Ele é só seu e não aparece em relatório nenhum.`
          : 'Rascunho guardado.',
      );
    } catch (erro) {
      falha(erro);
    } finally {
      definirOcupada(false);
    }
  }

  async function publicarFicha(alvo: HTMLFormElement | null, repetindo = false) {
    const atuais = dadosRef.current;
    if (!viva() || ocupadaRef.current || !turno || !atuais) return;
    if (!repetindo && tentativaRef.current) return;
    let conteudo: ConteudoFichaPlantao;
    const anterior = tentativaRef.current;
    if (repetindo && anterior) conteudo = anterior.entrada;
    else {
      if (!alvo) return;
      try {
        conteudo = coletar(alvo, atuais.modelo);
      } catch (erro) {
        definirStatus(erro instanceof Error ? erro.message : 'Confira os campos da ficha.');
        return;
      }
    }
    const retrato: SnapshotModeloFicha = {};
    for (const { campo_id } of conteudo.respostas ?? []) {
      const versaoCampo = retratoRef.current[campo_id.toLowerCase()];
      if (versaoCampo === undefined) {
        definirStatus(
          'O modelo da ficha mudou desde que esta tela carregou. Recarregue a ficha antes de publicar; nada foi alterado.',
        );
        return;
      }
      retrato[campo_id.toLowerCase()] = versaoCampo;
    }
    const versaoEsperada = atuais.publicada?.versao ?? 0;
    const motivo = alvo && !repetindo ? valorDe(alvo, 'motivo').trim() : '';
    if (versaoEsperada > 0 && !motivo && !repetindo) {
      definirStatus('A correção de ficha publicada exige motivo. Nada foi alterado.');
      return;
    }
    const enviada: Tentativa =
      repetindo && anterior
        ? { ...anterior, consultada: false }
        : { entrada: conteudo, chave: crypto.randomUUID(), consultada: false };
    definirTentativa(enviada);
    definirOcupada(true);
    definirStatus('Publicando a ficha…');
    try {
      await servicos.ficha.publicar(
        pacienteId,
        {
          turno_id: turno.turno_id,
          registro_id: turno.turno_id,
          versao_esperada: versaoEsperada,
          conteudo,
          ...(conteudo.respostas?.length ? { campos_extras_catalogo: retrato } : {}),
          ...(versaoEsperada > 0 ? { motivo } : {}),
        },
        enviada.chave,
      );
      if (!viva()) return;
      definirTentativa(null);
      pendente.current?.(false);
      definirStatus('Ficha publicada. Cada conteúdo foi gravado no seu lugar próprio.');
      definirOcupada(false);
      await carregar();
      return;
    } catch (erro) {
      if (!resultadoIncerto(erro)) definirTentativa(null);
      falha(erro);
      // A submissão é atômica: ou toda a ficha grava, ou nada grava. Quando o servidor
      // recusa, dizer o que provavelmente causou a recusa vale mais do que repetir o
      // código — e o texto não afirma o que a tela não tem como conferir sozinha.
      if (viva() && erro instanceof FalhaApi) {
        if (erro.codigo === 'conflito_versao')
          definirStatus(
            (atual) =>
              `${atual} O modelo da ficha ou a versão publicada mudou desde que esta tela carregou. Recarregue a ficha: nada foi gravado.`,
          );
        else if (erro.codigo === 'entrada_invalida')
          definirStatus(
            (atual) =>
              `${atual} Nada foi gravado. Confira o estado emocional — ele precisa ser um termo do catálogo administrado — e os campos obrigatórios do modelo.`,
          );
      }
    } finally {
      definirOcupada(false);
    }
  }

  async function resolverPendencia(item: PendenciaPlantaoHttp, alvo: HTMLFormElement) {
    if (!viva() || ocupadaRef.current) return;
    const texto = valorDe(alvo, 'motivo').trim();
    if (!texto) {
      definirStatus('Descreva o que foi feito. Sem isso a resolução é recusada.');
      return;
    }
    definirOcupada(true);
    definirStatus('Registrando a resolução…');
    try {
      await servicos.ficha.resolverPendencia(
        pacienteId,
        { pendencia_id: item.pendencia_id, versao_esperada: item.versao, motivo: texto },
        crypto.randomUUID(),
      );
      if (!viva()) return;
      definirOcupada(false);
      await carregar();
      if (viva()) definirStatus('Resolução registrada com autor e instante.');
    } catch (erro) {
      falha(erro);
    } finally {
      definirOcupada(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: a primeira consulta é só na montagem.
  useEffect(() => {
    // Fora do efeito: `carregar` trava os controles com `flushSync`, que não roda dentro
    // de um ciclo de vida do React.
    if (turno) queueMicrotask(() => void carregar());
  }, []);

  if (perdida) return null;

  return (
    <section className="turno-execucao grid min-w-0 gap-4">
      <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
        Ficha do plantão
      </h3>
      <p className={classeTexto}>
        Mesma ficha que a equipe preenche no papel. O que você escreve aqui é gravado uma vez só, no
        lugar próprio de cada conteúdo. O sistema não interpreta nada do que você registra.
      </p>
      <EstadoTurno>{turno ? status : 'Nenhum turno aberto para este caso.'}</EstadoTurno>
      <div>
        <Botao disabled={ocupada} aoAtivar={() => void carregar()}>
          Recarregar a ficha
        </Botao>
      </div>
      {tentativa ? (
        <div className="grid min-w-0 gap-2">
          <p className={classeTexto}>
            O resultado da publicação anterior não foi confirmado. Consulte a ficha e, se precisar,
            repita exatamente o mesmo envio.
          </p>
          <div className="flex min-w-0 flex-wrap gap-3">
            <Botao aoAtivar={() => void carregar()}>Conferir a ficha publicada</Botao>
            <Botao
              disabled={ocupada || !tentativa.consultada}
              aoAtivar={() => {
                if (tentativaRef.current?.consultada) void publicarFicha(null, true);
              }}
            >
              Repetir exatamente o mesmo envio
            </Botao>
          </div>
        </div>
      ) : null}
      {/* Sem `aria-busy` o corpo ficava em branco até a consulta responder, sem aviso. */}
      <div ref={formularioRef} aria-busy={carregando || undefined} className="grid min-w-0 gap-4">
        {!turno ? (
          <>
            <p className={classeTexto}>
              A ficha pertence a um plantão aberto: sem turno não há janela, nem vínculo conferido
              no momento do registro, nem a quem atribuir o plantão.
            </p>
            <p className={classeTexto}>
              Se o turno ficou sem abrir, abra-o na tela do turno e declare a janela real que você
              cumpriu. O instante do servidor fica gravado ao lado do que você declarar, e quem ler
              o relatório vê que a abertura foi retroativa.
            </p>
          </>
        ) : dados ? (
          <CorpoFicha
            key={geracao}
            turno={turno}
            dados={dados}
            retro={retro}
            aoMudarRetro={definirRetro}
            aoPublicar={(alvo) => void publicarFicha(alvo)}
            aoGuardar={() => void salvarRascunho()}
            aoResolver={(item, alvo) => void resolverPendencia(item, alvo)}
            aoDigitar={() => pendente.current?.(true)}
          />
        ) : null}
      </div>
    </section>
  );
}

function CorpoFicha({
  turno,
  dados,
  retro,
  aoMudarRetro,
  aoPublicar,
  aoGuardar,
  aoResolver,
  aoDigitar,
}: {
  turno: Turno;
  dados: Carregada;
  retro: boolean;
  aoMudarRetro(valor: boolean): void;
  aoPublicar(alvo: HTMLFormElement): void;
  aoGuardar(): void;
  aoResolver(item: PendenciaPlantaoHttp, alvo: HTMLFormElement): void;
  aoDigitar(): void;
}) {
  const { modelo, papeis, publicada, pendencias } = dados;
  // O catálogo e a ficha já estão alinhados no mesmo limite; o filtro aqui é a garantia de
  // que um rótulo longo herdado nunca seja oferecido só para ser recusado na publicação.
  const papeisOferecidos = papeis.filter(
    (item) => item.ativo && item.nome.trim().length <= LIMITE_ROTULO,
  );
  const papeisLongos = papeis.filter(
    (item) => item.ativo && item.nome.trim().length > LIMITE_ROTULO,
  );
  const ativos = modelo.filter((campo) => campo.ativo);
  const desativados = modelo.filter((campo) => !campo.ativo);
  const orfas = (publicada?.respostas ?? []).filter(
    (antiga) =>
      !antiga.campo_ativo && !desativados.some((campo) => campo.campo_id === antiga.campo_id),
  );

  return (
    <>
      <Formulario className="grid min-w-0 gap-4" aoEnviar={aoPublicar} onInput={aoDigitar}>
        <Grupo legenda="Plantão">
          <p className={classeTexto}>
            {`Turno aberto em ${new Date(turno.aberto_em).toLocaleString('pt-BR')}.`}
          </p>
          <SelecaoOpcional
            rotulo="Plantão"
            nome="periodo"
            opcoes={PERIODOS}
            valor={publicada?.periodo ?? undefined}
          />
          <SelecaoOpcional
            rotulo="Seu papel neste plantão"
            nome="papel"
            opcoes={papeisOferecidos.map((item) => ({ valor: item.nome, rotulo: item.nome }))}
            valor={publicada?.papel_declarado ?? undefined}
          />
          <p className={classeTexto}>
            O papel é rótulo do registro e aparece impresso na ficha. Ele não dá, não tira e não
            amplia acesso nenhum.
          </p>
          {papeis.some((item) => item.ativo) ? null : (
            <p className={classeTexto}>
              Nenhum papel no catálogo. O Administrador precisa cadastrá-los primeiro.
            </p>
          )}
          {papeisLongos.length ? (
            <p className={classeTexto}>
              {`${papeisLongos.length} papel(éis) do catálogo passam de ${LIMITE_ROTULO} caracteres e não cabem no registro da ficha. O Administrador precisa encurtá-los para que apareçam aqui.`}
            </p>
          ) : null}
        </Grupo>
        <Grupo legenda="Preenchimento fora do horário">
          {/* Seleção em vez de caixa de marcação: a caixa nativa fica em 24px e não alcança o
              alvo de toque de 44px do projeto, medido em navegador real na prova de celular. */}
          <SelecaoOpcional
            rotulo="Preenchi fora do horário do plantão"
            nome="declarar"
            opcoes={DECLARACAO}
            valor="nao"
            aoMudar={(valor) => aoMudarRetro(valor === 'sim')}
          />
          <CampoTurno
            rotulo="Início real do plantão"
            nome="janela_inicio"
            tipo="datetime-local"
            obrigatorio={false}
            disabled={!retro}
            valor={dataLocalTurno(turno.aberto_em)}
          />
          <CampoTurno
            rotulo="Fim real do plantão"
            nome="janela_fim"
            tipo="datetime-local"
            obrigatorio={false}
            disabled={!retro}
          />
          <p className={classeTexto}>
            O instante registrado pelo servidor continua gravado ao lado do que você declarar, e o
            relatório mostra que a ficha foi retroativa. A tolerância é a administrada do turno.
          </p>
        </Grupo>
        {ativos.map((campo) => {
          const chave = chaveDe(campo);
          if (chave && CANONICOS.has(chave))
            return (
              <Grupo key={campo.campo_id} legenda={campo.nome}>
                <p className={classeTexto}>{ONDE_GRAVA[chave]}</p>
                <p className={classeTexto}>{rotuloVisibilidade(campo.visibilidade)}</p>
                <p className={classeTexto}>
                  Registre no acompanhamento do turno. A ficha reúne o que já foi registrado; ela
                  não guarda uma segunda cópia.
                </p>
              </Grupo>
            );
          if (chave === 'estado_emocional')
            return (
              <Grupo key={campo.campo_id} legenda={campo.nome}>
                <p className={classeTexto}>{ONDE_GRAVA[chave]}</p>
                <p className={classeTexto}>{rotuloVisibilidade(campo.visibilidade)}</p>
                <CampoTurno
                  rotulo={campo.nome}
                  nome={`texto-${campo.campo_id}`}
                  obrigatorio={campo.obrigatorio}
                  maxLength={LIMITE_ROTULO}
                  valor={dados.rascunho?.estado_emocional?.estado ?? ''}
                  ajuda="Use um termo do catálogo administrado. Observação declarada, sem nota e sem escala."
                />
              </Grupo>
            );
          return (
            <Resposta
              key={campo.campo_id}
              campo={campo}
              chave={chave}
              valor={respostaInicial(campo, chave, dados)}
              longo={chave !== null || campo.tipo === 'texto_longo'}
            />
          );
        })}
        {desativados.length ? (
          <Grupo legenda="Campos desativados">
            <p className={classeTexto}>
              Não são oferecidos em ficha nova. As respostas já gravadas continuam legíveis nas
              fichas antigas.
            </p>
            {desativados.map((campo) => {
              const antiga = publicada?.respostas.find((item) => item.campo_id === campo.campo_id);
              return (
                <div key={campo.campo_id} className="grid min-w-0 gap-1">
                  <p className={classeTexto}>{campo.nome}</p>
                  {antiga ? (
                    <>
                      <p className={classeTexto}>{antiga.texto}</p>
                      <p className={classeTexto}>{rotuloVisibilidade(antiga.visibilidade)}</p>
                    </>
                  ) : null}
                </div>
              );
            })}
            {/* Resposta de campo que saiu do modelo continua legível mesmo quando o catálogo
                já não devolve a definição: ela não depende do estado corrente do modelo. */}
            {orfas.map((antiga) => (
              <p key={antiga.campo_id} className={classeTexto}>
                {`${antiga.campo_nome ?? 'Campo removido do modelo'}: ${antiga.texto}`}
              </p>
            ))}
          </Grupo>
        ) : null}
        {publicada ? (
          <Grupo legenda="Correção de ficha já publicada">
            <p className={classeTexto}>
              {`Versão vigente: ${publicada.versao}. A correção cria uma versão nova e preserva a anterior.`}
            </p>
            <CampoTurno
              rotulo="Motivo da correção"
              nome="motivo"
              longo
              ajuda="Sem motivo a correção é recusada e nada muda."
            />
          </Grupo>
        ) : null}
        <div className="turno-execucao__acoes flex min-w-0 flex-wrap gap-3">
          <Botao aoAtivar={aoGuardar}>Guardar rascunho</Botao>
          <Botao tipo="submit" peso="principal">
            {publicada ? 'Publicar correção' : 'Publicar ficha do plantão'}
          </Botao>
        </div>
      </Formulario>
      {modelo.length ? null : (
        <p className={classeTexto}>
          O modelo da ficha está vazio. O Administrador precisa montá-lo.
        </p>
      )}
      <div className="grid min-w-0 gap-3">
        <h4 className="m-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
          Pendências escritas do plantão
        </h4>
        {pendencias.length ? null : (
          <p className={classeTexto}>Nenhuma pendência escrita neste plantão até agora.</p>
        )}
        {pendencias.map((item) => (
          <article key={item.pendencia_id} className="turno-execucao__registro grid min-w-0 gap-1">
            <h4 className="m-0 text-(length:--texto-2) font-semibold">
              {item.situacao === 'aberta' ? 'Pendência aberta' : 'Pendência resolvida'}
            </h4>
            <p className={classeTexto}>Origem: escrita por pessoa, não deduzida pelo sistema.</p>
            <p className={classeTexto}>{item.texto}</p>
            <p className={classeTexto}>
              {`Registrada em ${new Date(item.registrado_em).toLocaleString('pt-BR')}.`}
            </p>
            <p className={classeTexto}>{rotuloVisibilidade(item.visibilidade)}</p>
            {item.situacao === 'aberta' ? (
              <Formulario
                className="grid min-w-0 gap-2"
                aoEnviar={(alvo) => aoResolver(item, alvo)}
              >
                <Grupo legenda="Resolver esta pendência">
                  <CampoTurno rotulo="O que foi feito" nome="motivo" longo />
                  <div>
                    <Botao tipo="submit">Registrar a resolução</Botao>
                  </div>
                </Grupo>
              </Formulario>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}

/** Seleção cujo valor vazio é aceito: período, papel e declaração não são obrigatórios. */
function SelecaoOpcional({
  rotulo,
  nome,
  opcoes,
  valor,
  aoMudar,
}: {
  rotulo: string;
  nome: string;
  opcoes: readonly { valor: string; rotulo: string }[];
  valor?: string;
  aoMudar?(valor: string): void;
}) {
  const id = `ficha-plantao-${nome}-${useId()}`;
  return (
    <SelecaoAprimorada
      id={id}
      name={nome}
      rotulo={rotulo}
      defaultValue={valor ?? ''}
      onChange={aoMudar ? (evento) => aoMudar(evento.currentTarget.value) : undefined}
    >
      <option value="">Selecione</option>
      {opcoes.map((item) => (
        <option key={item.valor} value={item.valor}>
          {item.rotulo}
        </option>
      ))}
    </SelecaoAprimorada>
  );
}

export function montarFichaPlantao(
  raiz: HTMLElement,
  servicos: ServicosFichaPlantao,
  opcoes: Opcoes,
): () => void {
  return ilha(raiz, <FichaPlantao servicos={servicos} {...opcoes} />);
}
