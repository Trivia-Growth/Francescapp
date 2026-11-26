/* Conversão de registro do Diário em tarefa + evolução interna, reconstruída em React
 * sobre a ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarConversaoDiario(raiz, pacienteId, origem, portas,
 * pendente, aoConcluir) => { desmontar, invalidarOrigem }`. Quem chama — `web/diario.ts` —
 * continua recebendo as duas funções; não precisou mudar nada para isso.
 *
 * `invalidarOrigem` não é parte do contrato de `ilha()` (que só devolve `desmontar`), então
 * a ponte aqui é a mesma técnica de "handle imperativo sem `forwardRef`": o componente
 * publica sua própria função de invalidação através de uma prop (`expoeInvalidar`), que
 * `montarConversaoDiario` guarda numa referência externa e expõe como `invalidarOrigem`.
 *
 * O que a migração entrega (VIS-012): a versão imperativa tinha uma flag `ativa` conferida
 * em sete pontos (`atual()` e as checagens dentro de `verificar`/`falhou`/`executar`) para
 * proteger escritas em DOM já desmontado. A checagem de MONTAGEM (`ativa`) sai: vira
 * `ativaRef`, só setada uma vez no cleanup da desmontagem, e seu papel continua o mesmo —
 * barrar que uma resposta tardia do servidor prossiga depois que o caso saiu de cena. As
 * outras duas metades de `atual()` — `origemAlterada` e `portas.atual()` — não eram sobre
 * ciclo de vida nenhum: são regra de negócio (versão trocou; conta trocou), e continuam
 * exatamente como eram.
 *
 * O indicador de ação em curso que `iniciarAcao` (`web/esqueleto.ts`) acrescentava ao botão
 * foi trocado pelo mesmo par `aria-busy` + `<Indicador/>` que as demais telas já migradas
 * usam: `iniciarAcao` mutava o nó do botão direto no DOM, e um botão React reconcilia seus
 * próprios filhos a cada render — a mutação direta seria apagada na pintura seguinte.
 *
 * O que NÃO mudou, de propósito:
 *
 * - **Nenhuma frase mudou de palavra.**
 * - Conversão é só pela porta atômica (`criarCiclo`/`converter`); nunca duas chamadas
 *   separadas de tarefa + diário.
 * - Rascunho nunca oferece conversão (`origem.estado === 'rascunho'` continua sem montar
 *   nada).
 * - Recibo existente nunca é sobrescrito; resposta tardia de outra conta nunca é aplicada.
 * - Fechar com campos preenchidos e sem recibo confirmado exige confirmação explícita.
 * - A barreira (reservar/consultar/encerrar/reconhecer) é consumida exatamente como antes.
 *
 * **Os campos do formulário continuam elementos nativos, não os de `componentes/ui`.**
 * As provas (`conversao-diario.test.ts`) localizam cada campo pelo `<label>` que o
 * ENVOLVE (`label.querySelector('input,textarea,select')`), e os componentes do design
 * system colocam o rótulo como IRMÃO do controle, não como invólucro. Trocar a estrutura
 * quebraria a prova por causa de uma diferença de estrutura, não de comportamento — por
 * isso aqui o `<label>` nativo continua envolvendo o controle, como na versão imperativa.
 */
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  converterDiarioTarefaSchema,
  type ConverterDiarioTarefa,
  type ReciboConversaoDiarioTarefa,
} from '../packages/contracts/src/conversao-diario-tarefa.ts';
import type { RegistroDiario } from '../packages/contracts/src/diario.ts';
import { exigeNovoAcesso, mensagemFalha } from './api.ts';
import type { criarCicloTarefaCuidado } from './ciclo-tarefa-cuidado.ts';
import { confirmarDescarte } from './confirmacao.js';
import { Botao } from './componentes/ui/botao.js';
import { ilha } from './ponte/ilha.js';
import { Formulario } from './telas/formulario.js';

type Ciclo = ReturnType<typeof criarCicloTarefaCuidado>;
type Conteudo = Omit<
  ConverterDiarioTarefa,
  'origem_versao' | 'tarefa_id' | 'reserva_id' | 'geracao_reserva'
>;
const conteudoSchema = converterDiarioTarefaSchema.omit({
  origem_versao: true,
  tarefa_id: true,
  reserva_id: true,
  geracao_reserva: true,
});
type Gravar = Parameters<typeof criarCicloTarefaCuidado>[0]['gravar'];
export type PortasConversaoDiario = {
  consultar(): Promise<ReciboConversaoDiarioTarefa | null>;
  converter(entrada: ConverterDiarioTarefa, chave: string): Promise<ReciboConversaoDiarioTarefa>;
  criarCiclo(gravar: Gravar): Ciclo;
  contexto(): Promise<{ escrita_disponivel: boolean; areas: readonly string[] }>;
  atual(): boolean;
  acessoPerdido(erro: unknown): void;
  desmontar(): void;
};
export type MontagemConversaoDiario = { desmontar(): void; invalidarOrigem(): void };

const ID_MOTIVO = 'conversao-motivo';
const ID_DATA = 'conversao-data';
const ID_ENCAMINHAMENTO = 'conversao-encaminhamento';
const ID_RESPONSAVEL = 'conversao-responsavel';
const ID_PRAZO = 'conversao-prazo';
const ID_PRIORIDADE = 'conversao-prioridade';
const ID_AREA = 'conversao-area';
const ID_ABRIR = 'conversao-abrir';
const IDS_CAMPOS = [
  ID_MOTIVO,
  ID_DATA,
  ID_ENCAMINHAMENTO,
  ID_RESPONSAVEL,
  ID_PRAZO,
  ID_PRIORIDADE,
  ID_AREA,
] as const;

type ControleCampo = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Um controle do formulário, pelo invólucro desta tela — e não `document`, pela mesma
 *  razão de `web/anamnese.tsx`: as provas montam num `div` solto, que `document.getElementById`
 *  não enxerga. */
function controle(raiz: HTMLElement | null, id: string): HTMLElement | null {
  return raiz?.querySelector<HTMLElement>(`[id="${id}"]`) ?? null;
}

/** O indicador de ação em curso; a mensagem acessível continua no `role="status"` da
 *  tela, isto é só a pintura. */
function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

function TelaConversaoDiario({
  pacienteId,
  origem,
  portas,
  pendente,
  aoConcluir,
  expoeInvalidar,
}: {
  pacienteId: string;
  origem: RegistroDiario;
  portas: PortasConversaoDiario;
  pendente: (valor: boolean) => void;
  aoConcluir: () => void;
  expoeInvalidar: (fn: () => void) => void;
}) {
  const envelope = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  /* Guarda de desmontagem (VIS-012, ver cabeçalho): falsa a partir do momento em que a
   * ilha é desfeita. As demais referências abaixo são estado de NEGÓCIO lido de forma
   * síncrona por dentro de fluxos assíncronos — não são sobre ciclo de vida. */
  const ativaRef = useRef(true);
  const origemAlteradaRef = useRef(false);
  const ocupadaRef = useRef(false);
  const liberadaRef = useRef(false);
  const cercadaRef = useRef(false);
  const houveEnvioRef = useRef(false);
  const reconhecerRef = useRef(false);
  const pedidoRef = useRef<Conteudo | null>(null);
  const reciboConfirmadoRef = useRef<ReciboConversaoDiarioTarefa | null>(null);
  const areasRef = useRef<readonly string[]>([]);
  const cicloRef = useRef<Ciclo | null>(null);

  const atual = () => ativaRef.current && !origemAlteradaRef.current && portas.atual();

  const [painelAberto, definirPainelAberto] = useState(false);
  const [formVisivel, definirFormVisivel] = useState(false);
  const [conferirVisivel, definirConferirVisivel] = useState(true);
  const [conferirRotulo, definirConferirRotulo] = useState('Conferir e liberar conversão');
  const [conferirDesabilitado, definirConferirDesabilitado] = useState(false);
  const [salvarDesabilitado, definirSalvarDesabilitado] = useState(false);
  const [fecharDesabilitado, definirFecharDesabilitado] = useState(false);
  const [acaoEmCurso, definirAcaoEmCurso] = useState<'conferir' | 'salvar' | null>(null);
  const [avisoTexto, definirAvisoTexto] = useState('');
  const [areas, definirAreas] = useState<readonly string[]>([]);

  useEffect(() => {
    return () => {
      ativaRef.current = false;
    };
  }, []);

  /* O valor do `<select>` de área é preservado quando a lista muda, só se a área antes
   * escolhida ainda existir na lista nova — do contrário volta para "Selecione a área". */
  useEffect(() => {
    const el = controle(envelope.current, ID_AREA) as HTMLSelectElement | null;
    if (el && !areas.includes(el.value)) el.value = '';
  }, [areas]);

  /* Ouvinte NATIVO, no invólucro de fora: qualquer edição em qualquer campo avisa que há
   * alteração pendente — a mesma regra que `form.addEventListener('input'|'change', …)`
   * aplicava. */
  useEffect(() => {
    const no = envelope.current;
    if (!no) return;
    const aoEditar = () => pendente(true);
    no.addEventListener('input', aoEditar);
    no.addEventListener('change', aoEditar);
    return () => {
      no.removeEventListener('input', aoEditar);
      no.removeEventListener('change', aoEditar);
    };
  }, [pendente]);

  /** Revalidação de versão: a limpeza e o esvaziamento vêm ANTES de a origem contar como
   *  alterada para o resto da tela — e são feitos uma única vez (idempotente). */
  // biome-ignore lint/correctness/useExhaustiveDependencies: registra uma única função estável; `portas`/`expoeInvalidar` são props fixas desta montagem e não devem reexecutar a cada render.
  useEffect(() => {
    expoeInvalidar(() => {
      if (origemAlteradaRef.current) return;
      origemAlteradaRef.current = true;
      liberadaRef.current = false;
      pedidoRef.current = null;
      portas.desmontar();
      flushSync(() => {
        bloquear(true);
        definirConferirVisivel(false);
        definirAvisoTexto(
          'O registro de origem mudou. Os campos abaixo foram preservados para conferência, mas esta versão não pode mais ser enviada.',
        );
      });
    });
  }, []);

  function bloquear(valor: boolean) {
    for (const id of IDS_CAMPOS) {
      const el = controle(envelope.current, id) as ControleCampo | null;
      if (el) el.disabled = valor;
    }
    definirSalvarDesabilitado(valor);
  }

  function mostrarRecibo(recibo: ReciboConversaoDiarioTarefa) {
    reciboConfirmadoRef.current = recibo;
    pedidoRef.current = null;
    envelope.current?.querySelector('form')?.reset();
    liberadaRef.current = false;
    flushSync(() => {
      definirFormVisivel(false);
      definirConferirVisivel(false);
      definirAvisoTexto(
        `Este registro já foi convertido em ação da equipe em ${new Date(recibo.registrado_em).toLocaleString('pt-BR')}. Consulte a tarefa ${recibo.tarefa_id} na aba Tarefas. A evolução interna preserva a proveniência do registro original.`,
      );
    });
    pendente(false);
  }

  function falhou(erro: unknown) {
    if (!atual()) return;
    if (exigeNovoAcesso(erro)) {
      portas.acessoPerdido(erro);
      return;
    }
    liberadaRef.current = false;
    flushSync(() => {
      bloquear(true);
      definirConferirVisivel(true);
      definirConferirRotulo(
        houveEnvioRef.current ? 'Conferir envio anterior' : 'Tentar conferir novamente',
      );
      definirAvisoTexto(
        houveEnvioRef.current
          ? `${mensagemFalha(erro)} Não repita a conversão sem conferir o envio anterior.`
          : `${mensagemFalha(erro)} Confira novamente quando o serviço estiver disponível.`,
      );
    });
  }

  cicloRef.current ??= portas.criarCiclo(async (entrada) => {
    if (!atual() || !pedidoRef.current) throw new Error('Conversão indisponível');
    const recibo = await portas.converter(
      {
        ...pedidoRef.current,
        origem_versao: origem.versao,
        tarefa_id: entrada.tarefa_id,
        reserva_id: entrada.reserva_id,
        geracao_reserva: entrada.epoca,
      },
      entrada.chave,
    );
    reciboConfirmadoRef.current = recibo;
    if (!atual()) throw new Error('Sessão alterada');
  });
  const ciclo = cicloRef.current;

  async function verificar() {
    liberadaRef.current = false;
    flushSync(() => bloquear(true));
    const contexto = await portas.contexto();
    if (!atual()) return;
    if (!contexto.escrita_disponivel || !contexto.areas.length) {
      definirAvisoTexto(
        !contexto.escrita_disponivel
          ? 'Conversão indisponível para este acesso ou configuração. Diário continua disponível.'
          : 'Áreas do diário indisponíveis. Confira a configuração antes de converter.',
      );
      return;
    }
    if (areasRef.current.join('\n') !== contexto.areas.join('\n')) {
      areasRef.current = contexto.areas;
      flushSync(() => definirAreas(contexto.areas));
    }
    let recibo = await portas.consultar();
    if (!atual()) return;
    if (recibo) {
      mostrarRecibo(recibo);
      return;
    }
    if (reconhecerRef.current) {
      await ciclo.reconhecer();
      cercadaRef.current = true;
      reconhecerRef.current = false;
    }
    let situacao = await ciclo.consultar();
    if (!situacao.resultado_pendente && (!cercadaRef.current || situacao.reserva)) {
      await ciclo.encerrar();
      cercadaRef.current = true;
      situacao = await ciclo.consultar();
    }
    if (!atual()) return;
    if (situacao.resultado_pendente) {
      const pendenteAnterior = situacao.resultado_pendente;
      flushSync(() => {
        definirAvisoTexto(
          `Um envio anterior ${pendenteAnterior.resultado === 'confirmada' ? 'foi salvo' : 'não foi salvo'}. Confira a aba Tarefas antes de liberar outra conversão.`,
        );
        definirConferirRotulo('Entendi, conferir e liberar');
      });
      reconhecerRef.current = true;
      return;
    }
    if (situacao.reserva) throw new Error('Outro envio começou');
    // Ausência antes do encerramento não era prova. Consultar novamente após cercar.
    recibo = await portas.consultar();
    if (!atual()) return;
    if (recibo) {
      mostrarRecibo(recibo);
      return;
    }
    ciclo.liberar();
    liberadaRef.current = true;
    flushSync(() => {
      definirFormVisivel(true);
      bloquear(false);
      definirConferirVisivel(false);
      definirAvisoTexto('Informe todos os campos para registrar a ação e a atenção humana.');
    });
  }

  async function executar(botaoNome: 'conferir' | 'salvar', acao: () => Promise<void>) {
    if (ocupadaRef.current || !atual()) return;
    ocupadaRef.current = true;
    flushSync(() => {
      definirAcaoEmCurso(botaoNome);
      if (botaoNome === 'conferir') definirConferirDesabilitado(true);
      else definirSalvarDesabilitado(true);
      definirFecharDesabilitado(true);
    });
    try {
      await acao();
    } catch (erro) {
      falhou(erro);
    } finally {
      ocupadaRef.current = false;
      flushSync(() => {
        definirAcaoEmCurso(null);
        if (atual()) {
          if (botaoNome === 'conferir') definirConferirDesabilitado(false);
          else definirSalvarDesabilitado(!liberadaRef.current);
          definirFecharDesabilitado(false);
        }
      });
    }
  }

  function aoClicarAbrir() {
    flushSync(() => definirPainelAberto(true));
    tituloRef.current?.focus();
    void executar('conferir', verificar);
  }

  function aoEnviarFormulario() {
    if (!liberadaRef.current || ocupadaRef.current || !atual()) return;
    const motivoEl = controle(envelope.current, ID_MOTIVO) as HTMLTextAreaElement | null;
    const dataEl = controle(envelope.current, ID_DATA) as HTMLInputElement | null;
    const encaminhamentoEl = controle(
      envelope.current,
      ID_ENCAMINHAMENTO,
    ) as HTMLTextAreaElement | null;
    const responsavelEl = controle(envelope.current, ID_RESPONSAVEL) as HTMLInputElement | null;
    const prazoEl = controle(envelope.current, ID_PRAZO) as HTMLInputElement | null;
    const prioridadeEl = controle(envelope.current, ID_PRIORIDADE) as HTMLSelectElement | null;
    const areaEl = controle(envelope.current, ID_AREA) as HTMLSelectElement | null;
    const entrada = conteudoSchema.safeParse({
      motivo: motivoEl?.value.trim() ?? '',
      data_atencao: dataEl?.value ?? '',
      encaminhamento: encaminhamentoEl?.value.trim() ?? '',
      responsavel: responsavelEl?.value.trim() ?? '',
      prazo: prazoEl?.value ?? '',
      prioridade: prioridadeEl?.value ?? '',
      area: areaEl?.value ?? '',
    });
    if (!entrada.success || !areasRef.current.includes(areaEl?.value ?? '')) {
      definirAvisoTexto(
        'Informe motivo, data da atenção, encaminhamento, responsável, prazo, prioridade e área configurada.',
      );
      motivoEl?.focus();
      return;
    }
    const {
      motivo: texto,
      data_atencao,
      encaminhamento: acao,
      responsavel: quem,
      prazo: quando,
      prioridade: peso,
      area: rotulo,
    } = entrada.data;
    pedidoRef.current = {
      motivo: texto,
      data_atencao,
      encaminhamento: acao,
      responsavel: quem,
      prazo: quando,
      prioridade: peso,
      area: rotulo,
    };
    void executar('salvar', async () => {
      // Última consulta antes de reservar: recibo existente impede nova criação.
      const existente = await portas.consultar();
      if (!atual()) return;
      if (existente) {
        mostrarRecibo(existente);
        return;
      }
      liberadaRef.current = false;
      cercadaRef.current = false;
      houveEnvioRef.current = true;
      flushSync(() => {
        bloquear(true);
        definirAvisoTexto('Aguardando confirmação da conversão…');
      });
      await ciclo.gravar(pacienteId, crypto.randomUUID(), 0, {
        descricao: acao,
        responsavel: quem,
        prazo: quando,
        prioridade: peso,
        estado: 'pendente',
      });
      if (!atual()) return;
      if (!reciboConfirmadoRef.current) throw new Error('Confirmação ausente');
      mostrarRecibo(reciboConfirmadoRef.current);
      pedidoRef.current = null;
      aoConcluir();
    });
  }

  async function aoClicarFechar() {
    if (ocupadaRef.current) return;
    const algumPreenchido = IDS_CAMPOS.some(
      (id) => (controle(envelope.current, id) as ControleCampo | null)?.value,
    );
    if (
      algumPreenchido &&
      !reciboConfirmadoRef.current &&
      !(await confirmarDescarte('os campos não enviados desta conversão'))
    )
      return;
    envelope.current?.querySelector('form')?.reset();
    pedidoRef.current = null;
    pendente(false);
    flushSync(() => definirPainelAberto(false));
    controle(envelope.current, ID_ABRIR)?.focus();
  }

  return (
    <div ref={envelope} className="min-w-0">
      <Botao id={ID_ABRIR} peso="secundario" hidden={painelAberto} aoAtivar={aoClicarAbrir}>
        Sinalizar atenção e converter em tarefa
      </Botao>
      <section hidden={!painelAberto}>
        <h4 ref={tituloRef} tabIndex={-1}>
          Converter registro em ação da equipe
        </h4>
        <p>
          A conversão cria uma tarefa e uma evolução interna da equipe. O registro original
          permanece intacto. Isto não envia retorno à família. Só é permitida uma conversão por
          registro.
        </p>
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já usam. */}
        <p role="status" aria-live="polite">
          {avisoTexto}
        </p>
        <Botao
          peso="secundario"
          hidden={!conferirVisivel}
          disabled={conferirDesabilitado}
          aria-busy={acaoEmCurso === 'conferir' || undefined}
          aoAtivar={() => void executar('conferir', verificar)}
        >
          {conferirRotulo}
          {acaoEmCurso === 'conferir' ? <Indicador /> : null}
        </Botao>
        <Formulario aoEnviar={aoEnviarFormulario} noValidate hidden={!formVisivel}>
          <label>
            Motivo da atenção
            <textarea id={ID_MOTIVO} required maxLength={2000} />
          </label>
          <label>
            Data da atenção
            <input id={ID_DATA} type="date" required />
          </label>
          <label>
            Encaminhamento / descrição da ação
            <textarea id={ID_ENCAMINHAMENTO} required maxLength={2000} />
          </label>
          <label>
            Responsável pela ação
            <input id={ID_RESPONSAVEL} required maxLength={2000} />
          </label>
          <label>
            Prazo da ação
            <input id={ID_PRAZO} type="date" required />
          </label>
          <label>
            Prioridade
            <select id={ID_PRIORIDADE} required>
              <option value="">Selecione a prioridade</option>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
            </select>
          </label>
          <label>
            Área da evolução
            <select id={ID_AREA} required>
              <option value="">Selecione a área</option>
              {areas.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
          <Botao
            peso="principal"
            tipo="submit"
            disabled={salvarDesabilitado}
            aria-busy={acaoEmCurso === 'salvar' || undefined}
          >
            Criar ação e evolução interna
            {acaoEmCurso === 'salvar' ? <Indicador /> : null}
          </Botao>
        </Formulario>
        <Botao
          peso="secundario"
          disabled={fecharDesabilitado}
          aoAtivar={() => void aoClicarFechar()}
        >
          Fechar conversão
        </Botao>
      </section>
    </div>
  );
}

/** A porta de gravação do ciclo executa toda a conversão. Nunca encadeia tarefa + diário. */
export function montarConversaoDiario(
  raiz: HTMLElement,
  pacienteId: string,
  origem: RegistroDiario,
  portas: PortasConversaoDiario,
  pendente: (valor: boolean) => void,
  aoConcluir: () => void,
): MontagemConversaoDiario {
  if (origem.estado === 'rascunho') {
    raiz.replaceChildren();
    return { desmontar: () => portas.desmontar(), invalidarOrigem: () => {} };
  }
  const invalidarRef: { current: () => void } = { current: () => {} };
  const desmontarIlha = ilha(
    raiz,
    <TelaConversaoDiario
      pacienteId={pacienteId}
      origem={origem}
      portas={portas}
      pendente={pendente}
      aoConcluir={aoConcluir}
      expoeInvalidar={(fn) => {
        invalidarRef.current = fn;
      }}
    />,
  );
  return {
    desmontar: () => {
      portas.desmontar();
      pendente(false);
      desmontarIlha();
    },
    invalidarOrigem: () => invalidarRef.current(),
  };
}
