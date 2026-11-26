/* Anamnese de coordenação (FR-003), reconstruída em React sobre a ilha
 * (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarAnamnese(raiz, pacienteId, servico, acessoPerdido,
 * alteracaoPendente, historicoHabilitado, roteiroSugerido) => desmontar`, e
 * `lerRoteiroAnamnese` continua a mesma função pura de antes.
 *
 * O que a migração entrega:
 *
 * 1. VIS-012. A versão imperativa tinha NOVE guardas `ativa` espalhadas — no desenho, na
 *    consulta, no envio, no histórico, na disponibilidade e no roteiro — cada uma
 *    protegendo uma escrita em DOM já desmontado. Não sobrou nenhuma: `ilha()` desmonta a
 *    raiz React e os efeitos são cancelados por construção. O que ficou no lugar são
 *    guardas de GERAÇÃO dentro de cada efeito, que é coisa diferente: elas impedem a
 *    resposta de uma tentativa anterior sobrescrever a seguinte.
 * 2. A moldura deixa de sumir durante a consulta (VIS-014).
 * 3. Superfície plana do `DESIGN.md`: um assunto, uma superfície.
 *
 * O que NÃO mudou, de propósito (VIS-018):
 *
 * - **Nenhuma frase mudou de palavra.**
 * - O protocolo de gravação é idêntico: validação por `salvarAnamneseSchema`, chave de
 *   idempotência por tentativa REAPROVEITADA no "Tentar confirmar salvamento", trava do
 *   envio em conflito de versão, e recusa de salvar com "Outra seção"/"Outro campo"
 *   preenchidos mas não adicionados.
 * - `exigeNovoAcesso` continua esvaziando a raiz ANTES de chamar `acessoPerdido`: o fluxo
 *   de nova entrada nunca pode encontrar conteúdo clínico na tela por trás dele.
 * - `alteracaoPendente` continua avisada nos mesmos pontos.
 * - O histórico só aparece quando a integração está habilitada E o serviço o oferece.
 * - A ordem dos nós do formulário é a mesma: perguntas, sugeridas, "Outra seção"/"Outro
 *   campo", ações, recado, histórico.
 *
 * **O DOM continua dono do valor dos campos.** Os controles são NÃO controlados, como na
 * versão imperativa. Isso não é preguiça de migração: as provas de tela atribuem `.value`
 * direto e despacham o evento, e campo controlado as quebraria — o próximo render
 * sobrescreveria o valor e o módulo nunca o veria. Por isso o resumo de pendências é
 * recalculado LENDO O DOM, e por isso os ouvintes de `input` e `change` são NATIVOS, num
 * invólucro próprio: a delegação do React não enxerga a atribuição crua de `.value`,
 * porque o rastreador dele já considera o valor conhecido e não anuncia mudança nenhuma.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  salvarAnamneseSchema,
  type Anamnese,
  type SalvarAnamnese,
} from '../packages/contracts/src/index.js';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import { Superficie } from './componentes/ui/superficie.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import { Formulario } from './telas/formulario.js';

/** Roteiro sugerido de FR-003. Vem do banco (`ffcm.anamnese.roteiro`), editável na tela de
 *  administração pela diretriz de 11/11/2026 — a estrutura de seis seções foi aprovada pelo
 *  solicitante em 13/11/2026 e mora na migration `20261123100000`, não aqui.
 *
 *  Continua sendo sugestão, não formulário fixo: quem preencher mantém "Outra seção" e
 *  "Outro campo" livres logo abaixo. Lista vazia é estado legítimo — a tela deixa de sugerir
 *  e nada mais muda. */
type Sugestao = { secao: string; campo: string };

const SEPARADOR_ROTEIRO = '::';

/** Converte as linhas `Seção :: Pergunta` do catálogo. Linha sem separador, sem seção ou sem
 *  pergunta é ignorada em silêncio: é configuração digitada por pessoa, e uma entrada torta
 *  não pode derrubar a tela inteira da anamnese. */
export function lerRoteiroAnamnese(linhas: readonly string[]): Sugestao[] {
  const vistas = new Set<string>();
  const sugestoes: Sugestao[] = [];
  for (const linha of linhas) {
    const corte = linha.indexOf(SEPARADOR_ROTEIRO);
    if (corte < 0) continue;
    const secao = linha.slice(0, corte).trim();
    const campo = linha.slice(corte + SEPARADOR_ROTEIRO.length).trim();
    if (!secao || !campo) continue;
    const chave = `${secao}${SEPARADOR_ROTEIRO}${campo}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    sugestoes.push({ secao, campo });
  }
  return sugestoes;
}

type Servico = {
  consultarAnamnese(pacienteId: string): Promise<Anamnese | null>;
  consultarHistoricoAnamnese?(pacienteId: string, antesVersao?: number): Promise<Anamnese | null>;
  salvarAnamnese(pacienteId: string, entrada: SalvarAnamnese, chave: string): Promise<Anamnese>;
};

type SecaoServidor = NonNullable<Anamnese['secoes']>[number];
type RespostaServidor = SecaoServidor['respostas'][number];

/** Uma pergunta no rascunho. `inicial` só alimenta os `defaultValue`; o valor corrente mora
 *  no DOM, e é lido de lá pelos identificadores abaixo. */
type Entrada = {
  id: string;
  secao: string;
  campo: string;
  esperado: boolean;
  inicial?: RespostaServidor;
};

const ESTADOS = [
  ['pendente', 'Pendente'],
  ['informado', 'Informado'],
  ['desconhecido', 'Desconhecido'],
  ['nao_se_aplica', 'Não se aplica'],
] as const;

const PREFIXO_ESTADO = 'anamnese-estado-';
const ID_NOVA_SECAO = 'anamnese-nova-secao';
const ID_NOVO_CAMPO = 'anamnese-novo-campo';

/** Um controle da tela, pelo identificador.
 *
 *  A busca parte do invólucro desta tela, e NÃO de `document`: `main.ts` monta a seção da
 *  ficha numa raiz que já está no documento, mas as provas montam num `div` solto — e
 *  `document.getElementById` não enxerga árvore destacada. Procurar a partir da própria
 *  raiz funciona nos dois casos. */
function controle(raiz: HTMLElement | null, id: string): HTMLElement | null {
  return raiz?.querySelector<HTMLElement>(`[id="${id}"]`) ?? null;
}

/** O valor corrente de um controle, lido do DOM — que é quem o tem. */
function leitura(raiz: HTMLElement | null, id: string): string {
  const no = controle(raiz, id);
  return no instanceof HTMLInputElement ||
    no instanceof HTMLSelectElement ||
    no instanceof HTMLTextAreaElement
    ? no.value
    : '';
}

function entradaDe(
  secao: string,
  campo: string,
  esperado: boolean,
  inicial?: RespostaServidor,
): Entrada {
  return { id: crypto.randomUUID(), secao, campo, esperado, inicial };
}

/** O indicador de ação em curso que `iniciarAcao` acrescentava ao botão. A mensagem
 *  acessível continua no `role="status"` da tela; isto é só a pintura. */
function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

type Consulta = { fase: 'carregando' } | { fase: 'pronta' } | { fase: 'erro'; erro: unknown };
type LinhaHistorico = { chave: string; tipo: 'secao' | 'resposta'; texto: string };

function TelaAnamnese({
  pacienteId,
  servico,
  acessoPerdido,
  alteracaoPendente,
  historicoHabilitado,
  roteiroSugerido,
}: {
  pacienteId: string;
  servico: Servico;
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
  historicoHabilitado: boolean | Promise<boolean>;
  roteiroSugerido: readonly string[] | Promise<readonly string[]>;
}) {
  const [consulta, definirConsulta] = useState<Consulta>({ fase: 'carregando' });
  const [tentativaConsulta, definirTentativaConsulta] = useState(0);
  const [descartada, definirDescartada] = useState(false);

  const [secoes, definirSecoes] = useState<readonly SecaoServidor[]>([]);
  const [entradas, definirEntradas] = useState<Entrada[]>([]);
  /** Espelho do `select` de estado de cada pergunta. Governa só o que fica desabilitado;
   *  o valor continua sendo o do DOM, e o espelho é alimentado LENDO o DOM no evento. */
  const [estados, definirEstados] = useState<Record<string, string>>({});
  const [resumo, definirResumo] = useState('');
  const [aviso, definirAviso] = useState('');
  const [sugestoes, definirSugestoes] = useState<Sugestao[]>([]);
  const [historicoDisponivel, definirHistoricoDisponivel] = useState(false);

  const [enviando, definirEnviando] = useState(false);
  const [retryVisivel, definirRetryVisivel] = useState(false);
  const [conflitoVersao, definirConflitoVersao] = useState(false);

  const [historicoStatus, definirHistoricoStatus] = useState('');
  const [historicoLinhas, definirHistoricoLinhas] = useState<LinhaHistorico[]>([]);
  const [historicoRotulo, definirHistoricoRotulo] = useState('Consultar histórico');
  const [historicoTravado, definirHistoricoTravado] = useState(false);
  const [historicoOcupado, definirHistoricoOcupado] = useState(false);
  const cursorHistorico = useRef<number | undefined>(undefined);

  /* Decisões SÍNCRONAS no meio de fluxo assíncrono: lidas dentro de tratadores e de
     continuações de promessa, onde o `useState` devolveria o valor do render anterior. */
  const versaoRef = useRef(0);
  const pendenteRef = useRef<{ entrada: SalvarAnamnese; chave: string } | null>(null);
  const [temPendente, marcarPendente] = useState(false);
  const definirPendente = useCallback(
    (valor: { entrada: SalvarAnamnese; chave: string } | null) => {
      pendenteRef.current = valor;
      marcarPendente(valor !== null);
    },
    [],
  );

  /* O invólucro é a raiz de busca desta tela: tudo que lê o DOM parte daqui, nunca de
     `document`, porque a raiz pode estar destacada do documento. */
  const envelope = useRef<HTMLDivElement>(null);

  const avisarPendente = useRef(alteracaoPendente);
  avisarPendente.current = alteracaoPendente;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;
  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;

  /** Revalidação de acesso: a raiz é esvaziada ANTES de avisar. */
  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    pendenteRef.current = null;
    flushSync(() => definirDescartada(true));
    avisarPerda.current(erro);
    return true;
  }, []);

  /** A resposta corrente de uma pergunta, montada a partir do DOM. */
  const respostaDe = useCallback((entrada: Entrada) => {
    const estado = leitura(envelope.current, `${PREFIXO_ESTADO}${entrada.id}`);
    if (estado === 'pendente') return { campo: entrada.campo, estado: 'pendente' };
    return {
      campo: entrada.campo,
      estado,
      fonte: leitura(envelope.current, `anamnese-fonte-${entrada.id}`),
      data: leitura(envelope.current, `anamnese-data-${entrada.id}`),
      ...(estado === 'informado'
        ? { valor: leitura(envelope.current, `anamnese-valor-${entrada.id}`) }
        : {}),
    };
  }, []);

  /** O texto de pendências, recalculado lendo o DOM. Mantido numa referência para os
   *  ouvintes nativos sempre chamarem a versão corrente sem religar o ouvinte. */
  const calcularResumo = useCallback((): string => {
    if (!entradas.length && !secoes.length)
      return 'Escolha uma pergunta sugerida ou crie a sua para começar.';
    const secoesPendentes = [
      ...new Set(
        entradas
          .filter(
            (entrada) =>
              entrada.esperado &&
              (leitura(envelope.current, `${PREFIXO_ESTADO}${entrada.id}`) === 'pendente' ||
                !salvarAnamneseSchema.safeParse({
                  versao_esperada: versaoRef.current,
                  secoes: [
                    {
                      id: entrada.secao,
                      camposEsperados: [entrada.campo],
                      respostas: [respostaDe(entrada)],
                    },
                  ],
                }).success),
          )
          .map((entrada) => entrada.secao),
      ),
    ];
    return secoesPendentes.length
      ? `Seções com pendências: ${secoesPendentes.join(', ')}.`
      : 'Nenhuma pendência identificada nos campos informados.';
  }, [entradas, secoes, respostaDe]);

  const resumoAgora = useRef(calcularResumo);
  resumoAgora.current = calcularResumo;

  /* Depois de cada pintura em que a lista de perguntas muda, o resumo é refeito a partir
     do DOM já montado — é o equivalente das chamadas a `atualizarPendencias()` que a
     versão imperativa fazia logo depois de cada `adicionar`. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `entradas` e `secoes` não são lidas no corpo — o resumo é recalculado LENDO O DOM, por referência viva. Elas estão aqui como gatilho: depois de cada pintura em que a lista de perguntas muda, o resumo precisa ser refeito a partir dos nós recém-montados.
  useEffect(() => {
    definirResumo(resumoAgora.current());
  }, [entradas, secoes]);

  /* Os ouvintes NATIVOS. Ficam no invólucro de fora, e não no `<form>`, porque assim
     alcançam qualquer controle da tela sem depender de uma referência ao formulário; e
     são nativos porque a atribuição crua de `.value` que as provas fazem não chega à
     delegação do React. `flushSync` porque a prova afirma o resultado na linha seguinte
     ao `dispatchEvent`, e o agendador do React o deixaria para depois. */
  useEffect(() => {
    const no = envelope.current;
    if (!no) return;
    const aoDigitar = () => {
      avisarPendente.current(true);
      flushSync(() => definirResumo(resumoAgora.current()));
    };
    const aoTrocar = (evento: Event) => {
      avisarPendente.current(true);
      const alvo = evento.target;
      if (!(alvo instanceof HTMLSelectElement) || !alvo.id.startsWith(PREFIXO_ESTADO)) return;
      const id = alvo.id.slice(PREFIXO_ESTADO.length);
      const valor = alvo.value;
      flushSync(() => {
        definirEstados((atuais) => ({ ...atuais, [id]: valor }));
        definirResumo(resumoAgora.current());
      });
    };
    no.addEventListener('input', aoDigitar);
    no.addEventListener('change', aoTrocar);
    return () => {
      no.removeEventListener('input', aoDigitar);
      no.removeEventListener('change', aoTrocar);
    };
  }, []);

  /** Carrega a anamnese. Também é o redesenho depois de um salvamento confirmado. */
  const aplicar = useCallback((resultado: Anamnese | null) => {
    versaoRef.current = resultado?.versao ?? 0;
    const recebidas = resultado?.secoes ?? [];
    const novas: Entrada[] = [];
    const marcas: Record<string, string> = {};
    for (const secao of recebidas) {
      const campos = new Set([
        ...secao.camposEsperados,
        ...secao.respostas.map((resposta) => resposta.campo),
      ]);
      for (const campo of campos) {
        const inicial = secao.respostas.find((resposta) => resposta.campo === campo);
        const entrada = entradaDe(secao.id, campo, secao.camposEsperados.includes(campo), inicial);
        novas.push(entrada);
        marcas[entrada.id] = inicial?.estado ?? 'pendente';
      }
    }
    definirSecoes(recebidas);
    definirEntradas(novas);
    definirEstados(marcas);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tentativaConsulta` não é lida no corpo de propósito — é o GATILHO de recarga que o botão "Tentar novamente" incrementa. Tirá-la daqui faria a nova tentativa não acontecer.
  useEffect(() => {
    let valida = true;
    definirConsulta({ fase: 'carregando' });
    servicoAtual.current
      .consultarAnamnese(pacienteId)
      .then((resultado) => {
        if (!valida) return;
        flushSync(() => {
          aplicar(resultado);
          definirAviso('');
          definirRetryVisivel(false);
          definirConflitoVersao(false);
          definirConsulta({ fase: 'pronta' });
        });
      })
      .catch((erro: unknown) => {
        if (!valida || descartarAcesso(erro)) return;
        flushSync(() => definirConsulta({ fase: 'erro', erro }));
      });
    return () => {
      valida = false;
    };
  }, [pacienteId, tentativaConsulta, aplicar, descartarAcesso]);

  /* Disponibilidade do histórico e roteiro sugerido chegam depois do primeiro desenho, e
     cada um atualiza a sua região sem recarregar a aba nem tocar no rascunho. */
  useEffect(() => {
    let valida = true;
    void Promise.resolve(historicoHabilitado)
      .then((disponivel) => {
        if (valida) flushSync(() => definirHistoricoDisponivel(disponivel));
      })
      .catch(() => {});
    return () => {
      valida = false;
    };
  }, [historicoHabilitado]);

  useEffect(() => {
    let valida = true;
    void Promise.resolve(roteiroSugerido)
      .then((linhas) => {
        if (valida) flushSync(() => definirSugestoes(lerRoteiroAnamnese(linhas)));
      })
      .catch(() => {});
    return () => {
      valida = false;
    };
  }, [roteiroSugerido]);

  function existe(secao: string, campo: string): boolean {
    return entradas.some((entrada) => entrada.secao === secao && entrada.campo === campo);
  }

  /* `flushSync` porque a versão imperativa acrescentava a pergunta NA HORA, e quem a usa
     conta com isso: adicionar e salvar em seguida — na tela ou na prova — não pode pegar
     a lista do render anterior e gravar uma anamnese sem o campo recém-criado. */
  function acrescentar(novas: readonly { secao: string; campo: string }[]) {
    const criadas = novas.map(({ secao, campo }) => entradaDe(secao, campo, true));
    flushSync(() => {
      definirEntradas((atuais) => [...atuais, ...criadas]);
      definirEstados((atuais) => {
        const proximos = { ...atuais };
        for (const entrada of criadas) proximos[entrada.id] = 'pendente';
        return proximos;
      });
      definirAviso('');
    });
    avisarPendente.current(true);
  }

  const faltantes = sugestoes.filter(({ secao, campo }) => !existe(secao, campo));

  function adicionarDigitado() {
    const secao = leitura(envelope.current, ID_NOVA_SECAO).trim();
    const campo = leitura(envelope.current, ID_NOVO_CAMPO).trim();
    if (!secao || !campo || existe(secao, campo)) {
      definirAviso('Informe seção e campo ainda não cadastrado.');
      return;
    }
    acrescentar([{ secao, campo }]);
    const novaSecao = controle(envelope.current, ID_NOVA_SECAO);
    const novoCampo = controle(envelope.current, ID_NOVO_CAMPO);
    if (novaSecao instanceof HTMLInputElement) novaSecao.value = '';
    if (novoCampo instanceof HTMLInputElement) novoCampo.value = '';
  }

  const enviar = useCallback(async () => {
    const reservado = pendenteRef.current;
    if (!reservado) return;
    definirEnviando(true);
    definirAviso('Salvando anamnese…');
    try {
      const salvo = await servicoAtual.current.salvarAnamnese(
        pacienteId,
        reservado.entrada,
        reservado.chave,
      );
      definirPendente(null);
      avisarPendente.current(false);
      flushSync(() => {
        definirEnviando(false);
        aplicar(salvo);
        definirRetryVisivel(false);
        definirConflitoVersao(false);
        definirAviso('Anamnese salva.');
      });
    } catch (erro: unknown) {
      if (descartarAcesso(erro)) return;
      if (resultadoIncerto(erro)) {
        /* A reserva CONTINUA de pé: o envio pode ter sido gravado e a resposta se perdido.
           Salvar e Adicionar seguem travados e o rascunho inerte, para a confirmação usar
           a MESMA chave de idempotência e não duplicar versão. */
        flushSync(() => {
          definirEnviando(false);
          definirRetryVisivel(true);
          definirAviso(
            'Não foi possível confirmar o salvamento. Tente confirmar antes de editar novamente.',
          );
        });
        return;
      }
      definirPendente(null);
      const conflito = erro instanceof FalhaApi && erro.codigo === 'conflito_versao';
      flushSync(() => {
        definirEnviando(false);
        definirConflitoVersao(conflito);
        definirRetryVisivel(false);
        definirAviso(
          conflito
            ? 'A anamnese foi alterada por outra pessoa. Copie seu rascunho antes de recarregar a página para consultar a versão atual; suas alterações ainda não foram salvas.'
            : mensagemFalha(erro),
        );
      });
    }
  }, [pacienteId, definirPendente, descartarAcesso, aplicar]);

  function enviarFormulario(_formulario: HTMLFormElement) {
    if (pendenteRef.current || conflitoVersao) return;
    const novaSecao = leitura(envelope.current, ID_NOVA_SECAO).trim();
    const novoCampo = leitura(envelope.current, ID_NOVO_CAMPO).trim();
    if (novaSecao || novoCampo) {
      definirAviso('Adicione o campo preenchido ou limpe seção e campo antes de salvar.');
      controle(envelope.current, novaSecao ? ID_NOVO_CAMPO : ID_NOVA_SECAO)?.focus();
      return;
    }
    const agrupadas = new Map<
      string,
      { id: string; camposEsperados: string[]; respostas: unknown[] }
    >();
    for (const secao of secoes)
      agrupadas.set(secao.id, { id: secao.id, camposEsperados: [], respostas: [] });
    for (const entrada of entradas) {
      const secao = agrupadas.get(entrada.secao) ?? {
        id: entrada.secao,
        camposEsperados: [],
        respostas: [],
      };
      if (entrada.esperado) secao.camposEsperados.push(entrada.campo);
      secao.respostas.push(respostaDe(entrada));
      agrupadas.set(entrada.secao, secao);
    }
    const validada = salvarAnamneseSchema.safeParse({
      versao_esperada: versaoRef.current,
      secoes: [...agrupadas.values()],
    });
    if (!validada.success) {
      definirAviso('Preencha resposta, fonte e data para os estados informados; confira as datas.');
      return;
    }
    definirPendente({ entrada: validada.data, chave: crypto.randomUUID() });
    avisarPendente.current(true);
    void enviar();
  }

  function consultarHistorico() {
    const consultarPagina = servicoAtual.current.consultarHistoricoAnamnese;
    if (!consultarPagina) return;
    definirHistoricoTravado(true);
    definirHistoricoOcupado(true);
    definirHistoricoStatus('Carregando histórico…');
    void consultarPagina(pacienteId, cursorHistorico.current)
      .then((pagina) => {
        flushSync(() => {
          definirHistoricoOcupado(false);
          definirHistoricoLinhas([]);
          if (!pagina) {
            /* Sem página o botão PERMANECE travado: a navegação chegou ao fim e repetir a
               consulta devolveria o mesmo nada. Comportamento idêntico ao de antes. */
            definirHistoricoStatus('Não há outras versões.');
            return;
          }
          cursorHistorico.current = pagina.versao;
          definirHistoricoStatus(
            `Versão ${pagina.versao} — ${pagina.criado_em ?? ''} — autor ${pagina.criado_por_usuario_id ?? ''}`,
          );
          const linhas: LinhaHistorico[] = [];
          for (const secao of pagina.secoes) {
            linhas.push({ chave: `s-${secao.id}`, tipo: 'secao', texto: secao.id });
            for (const resposta of secao.respostas) {
              const detalhe =
                resposta.estado === 'pendente'
                  ? 'Pendente'
                  : `${resposta.estado}${resposta.estado === 'informado' ? `: ${resposta.valor}` : ''} — ${resposta.fonte} — ${resposta.data}`;
              linhas.push({
                chave: `r-${secao.id}-${resposta.campo}`,
                tipo: 'resposta',
                texto: `${resposta.campo}: ${detalhe}`,
              });
            }
          }
          definirHistoricoLinhas(linhas);
          definirHistoricoRotulo('Versão anterior');
          definirHistoricoTravado(false);
        });
      })
      .catch((erro: unknown) => {
        if (descartarAcesso(erro)) return;
        flushSync(() => {
          definirHistoricoOcupado(false);
          definirHistoricoStatus(mensagemFalha(erro));
          definirHistoricoTravado(false);
        });
      });
  }

  if (descartada) return null;

  const travado = temPendente || enviando;
  const oferecerHistorico = historicoDisponivel && Boolean(servico.consultarHistoricoAnamnese);

  /* Um invólucro SÓ, o mesmo nó nas três fases. Isso não é detalhe de arrumação: os
     ouvintes nativos de `input` e `change` nascem nele na montagem, e trocar o nó ao sair
     do carregamento os deixaria pendurados num elemento que saiu da árvore. */
  const conteudo = () => {
    if (consulta.fase === 'carregando')
      return (
        <div className="grid min-w-0 gap-4">
          {/* Vazio de propósito: a regra global de `web/styles.css` desenha a forma do
              que vem para a região `[aria-busy] :empty`. */}
          <Esqueleto ocupado />
          {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as telas e as provas já usam. */}
          <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
            Carregando anamnese…
          </p>
        </div>
      );

    if (consulta.fase === 'erro')
      return (
        <div className="grid min-w-0 justify-items-start gap-4">
          {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
          <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
            {mensagemFalha(consulta.erro)}
          </p>
          <Botao peso="secundario" aoAtivar={() => definirTentativaConsulta((valor) => valor + 1)}>
            Tentar novamente
          </Botao>
        </div>
      );

    return (
      <Superficie>
        <Formulario aoEnviar={enviarFormulario} noValidate className="grid min-w-0 gap-5">
          <header className="grid gap-2">
            <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
              Anamnese de coordenação
            </h2>
            <p className="m-0 text-(length:--texto-1) text-texto-suave">{resumo}</p>
            {secoes.length ? null : (
              <p className="m-0 text-texto-suave">Nenhuma pergunta registrada ainda.</p>
            )}
          </header>

          {/* `inert` enquanto há gravação reservada: o rascunho não pode mudar entre a
              reserva e a confirmação, senão a chave de idempotência deixaria de descrever
              o que foi enviado. */}
          <div className="grid min-w-0 gap-4" inert={temPendente}>
            {entradas.map((entrada) => {
              const estado = estados[entrada.id] ?? 'pendente';
              return (
                <fieldset
                  key={entrada.id}
                  data-estado={estado}
                  className="m-0 grid min-w-0 gap-4 rounded-cartao border border-borda p-4"
                >
                  <legend className="px-1">
                    <MarcaEstado tom="contorno">{`${entrada.secao} — ${entrada.campo}`}</MarcaEstado>
                  </legend>
                  <SelecaoSimples
                    id={`${PREFIXO_ESTADO}${entrada.id}`}
                    rotulo="Estado"
                    defaultValue={entrada.inicial?.estado ?? 'pendente'}
                  >
                    {ESTADOS.map(([valor, texto]) => (
                      <option key={valor} value={valor}>
                        {texto}
                      </option>
                    ))}
                  </SelecaoSimples>
                  <AreaTexto
                    id={`anamnese-valor-${entrada.id}`}
                    rotulo="Resposta"
                    linhas={3}
                    disabled={estado !== 'informado'}
                    defaultValue={
                      entrada.inicial?.estado === 'informado' ? entrada.inicial.valor : ''
                    }
                  />
                  <Campo
                    id={`anamnese-fonte-${entrada.id}`}
                    rotulo="Fonte"
                    disabled={estado === 'pendente'}
                    defaultValue={
                      entrada.inicial && entrada.inicial.estado !== 'pendente'
                        ? entrada.inicial.fonte
                        : ''
                    }
                  />
                  <Campo
                    id={`anamnese-data-${entrada.id}`}
                    rotulo="Data"
                    tipo="date"
                    disabled={estado === 'pendente'}
                    defaultValue={
                      entrada.inicial && entrada.inicial.estado !== 'pendente'
                        ? entrada.inicial.data
                        : ''
                    }
                  />
                </fieldset>
              );
            })}
          </div>

          {faltantes.length ? (
            <div className="grid min-w-0 justify-items-start gap-3">
              <SelecaoSimples
                id="anamnese-sugeridas"
                rotulo="Perguntas sugeridas"
                value=""
                disabled={travado}
                onChange={(evento) => {
                  const escolhida = faltantes[Number(evento.currentTarget.value)];
                  if (escolhida && !existe(escolhida.secao, escolhida.campo))
                    acrescentar([escolhida]);
                }}
              >
                <option value="">Escolha uma pergunta sugerida</option>
                {faltantes.map(({ secao, campo }, indice) => (
                  <option key={`${secao}::${campo}`} value={String(indice)}>
                    {`${secao} — ${campo}`}
                  </option>
                ))}
              </SelecaoSimples>
              <Botao peso="secundario" disabled={travado} aoAtivar={() => acrescentar(faltantes)}>
                Adicionar todas as sugeridas
              </Botao>
            </div>
          ) : null}

          <div className="grid min-w-0 gap-4">
            <Campo id={ID_NOVA_SECAO} rotulo="Outra seção" disabled={temPendente} />
            <Campo id={ID_NOVO_CAMPO} rotulo="Outro campo" disabled={temPendente} />
          </div>

          <div className="flex flex-wrap gap-3">
            <Botao peso="secundario" disabled={travado} aoAtivar={adicionarDigitado}>
              Adicionar campo
            </Botao>
            <Botao
              id="anamnese-salvar"
              peso="principal"
              tipo="submit"
              disabled={travado || conflitoVersao}
              aria-busy={(enviando && !retryVisivel) || undefined}
            >
              Salvar anamnese
              {enviando && !retryVisivel ? <Indicador /> : null}
            </Botao>
            {retryVisivel ? (
              <Botao
                peso="secundario"
                disabled={enviando}
                aria-busy={enviando || undefined}
                aoAtivar={() => void enviar()}
              >
                Tentar confirmar salvamento
                {enviando ? <Indicador /> : null}
              </Botao>
            ) : null}
          </div>

          {/* Um recado por vez, no mesmo nó de antes: é onde as provas e os leitores de
              tela já procuram. */}
          {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas procuram dentro do formulário. */}
          <p
            role="status"
            aria-live="polite"
            data-tone={conflitoVersao ? 'error' : undefined}
            className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave empty:hidden"
          >
            {aviso}
          </p>

          {oferecerHistorico ? (
            <section data-historico="" className="grid min-w-0 justify-items-start gap-3">
              <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
                Histórico de versões
              </h3>
              <Botao
                peso="discreto"
                disabled={historicoTravado}
                aria-busy={historicoOcupado || undefined}
                aoAtivar={consultarHistorico}
              >
                {historicoRotulo}
                {historicoOcupado ? <Indicador /> : null}
              </Botao>
              {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
              <p
                role="status"
                aria-live="polite"
                className="m-0 text-(length:--texto-1) text-texto-suave empty:hidden"
              >
                {historicoStatus}
              </p>
              <div className="grid min-w-0 gap-1">
                {historicoLinhas.map((linha) =>
                  linha.tipo === 'secao' ? (
                    <h4
                      key={linha.chave}
                      className="m-0 mt-2 text-(length:--texto-2) font-semibold first:mt-0"
                    >
                      {linha.texto}
                    </h4>
                  ) : (
                    <p key={linha.chave} className="m-0 max-w-[68ch] text-(length:--texto-2)">
                      {linha.texto}
                    </p>
                  ),
                )}
              </div>
            </section>
          ) : null}
        </Formulario>
      </Superficie>
    );
  };

  return (
    <div ref={envelope} className="min-w-0">
      {conteudo()}
    </div>
  );
}

/** Interface isolada; montagem depende da integração segura do servidor. */
export function montarAnamnese(
  raiz: HTMLElement,
  pacienteId: string,
  servico: Servico,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
  historicoHabilitado: boolean | Promise<boolean> = false,
  roteiroSugerido: readonly string[] | Promise<readonly string[]> = [],
): () => void {
  return ilha(
    raiz,
    <TelaAnamnese
      pacienteId={pacienteId}
      servico={servico}
      acessoPerdido={acessoPerdido}
      alteracaoPendente={alteracaoPendente}
      historicoHabilitado={historicoHabilitado}
      roteiroSugerido={roteiroSugerido}
    />,
  );
}
