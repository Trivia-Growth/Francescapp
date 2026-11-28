/** Editor de execução do cuidado (VIS-018). O turno recebe os comandos por
 *  `registrar`. Os seletores atualizam somente os campos dependentes, e o valor
 *  preenchido é lido do próprio formulário. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import {
  conteudoExecucaoPublicoSchema,
  type CatalogoTurnoPublico,
  type ConteudoExecucaoPublico,
  type RegistroExecucaoPublico,
} from '../packages/contracts/src/turno-execucao-http.ts';
import { Botao } from './componentes/ui/botao.js';
import './estilos/tema.css';
import { Formulario, valorDe } from './telas/formulario.js';
import {
  CampoTurno,
  EstadoTurno,
  SelecaoTurno,
  dataLocalTurno,
  instanteTurno,
  numeroTurno,
  type OpcaoTurno,
} from './turno-execucao-campos.js';

export type ClasseExecucao = ConteudoExecucaoPublico['classe'];
export const rotulosClasse: Record<ClasseExecucao, string> = {
  afericao: 'Aferição',
  prescricao: 'Medicação prescrita',
  administracao: 'Administração de medicação',
  ocorrencia: 'Ocorrência',
  rotina: 'Rotina',
};
const rotulosSinais: Record<string, string> = {
  pressao_sistolica: 'Pressão arterial sistólica',
  pressao_diastolica: 'Pressão arterial diastólica',
  frequencia_cardiaca: 'Frequência cardíaca',
  frequencia_respiratoria: 'Frequência respiratória',
  temperatura: 'Temperatura',
  saturacao_oxigenio: 'Saturação de oxigênio',
  glicemia_capilar: 'Glicemia capilar',
  dor: 'Dor (escala 0 a 10)',
};
export function rotuloSinal(tipo: string) {
  return rotulosSinais[tipo] ?? tipo;
}

const OPCOES_PRIORIDADE_MOMENTO: readonly OpcaoTurno[] = [
  { valor: 'cafe', rotulo: 'Café' },
  { valor: 'almoco', rotulo: 'Almoço' },
  { valor: 'lanche', rotulo: 'Lanche' },
  { valor: 'jantar', rotulo: 'Jantar' },
  { valor: 'ceia', rotulo: 'Ceia' },
];
const OPCOES_ACEITACAO: readonly OpcaoTurno[] = [
  { valor: 'total', rotulo: 'Total' },
  { valor: 'parcial', rotulo: 'Parcial' },
  { valor: 'minima', rotulo: 'Mínima' },
  { valor: 'recusou', rotulo: 'Recusou' },
];
const OPCOES_QUALIDADE_SONO: readonly OpcaoTurno[] = [
  { valor: 'tranquilo', rotulo: 'Tranquilo' },
  { valor: 'agitado', rotulo: 'Agitado' },
  { valor: 'nao_dormiu', rotulo: 'Não dormiu' },
];
const OPCOES_ELIMINACAO: readonly OpcaoTurno[] = [
  { valor: 'urina', rotulo: 'Urina' },
  { valor: 'fezes', rotulo: 'Fezes' },
];
const OPCOES_TIPO_ROTINA: readonly OpcaoTurno[] = [
  { valor: 'refeicao', rotulo: 'Refeição' },
  { valor: 'hidratacao', rotulo: 'Hidratação' },
  { valor: 'sono', rotulo: 'Sono' },
  { valor: 'eliminacao', rotulo: 'Eliminação' },
];
/* Ressalvas clínicas obrigatórias (FR-084): ficam em constante de uma linha só porque
 * `web/textos-obrigatorios-nao-configuraveis.test.ts` lê este arquivo por texto literal
 * via `readFileSync`, e o formatador quebra texto de JSX em várias linhas. */
const RESSALVA_AFERICAO =
  'O sistema registra o valor informado, sem interpretar gravidade ou recomendar conduta.';
const RESSALVA_PRESCRICAO =
  'Transcreva uma prescrição externa já existente. Nenhuma dose, via ou decisão clínica é sugerida pelo sistema.';
const RESSALVA_ROTINA =
  'Observações registradas sem avaliação automática de adequação, gravidade ou recomendação.';

const OPCOES_SITUACAO_ADMINISTRACAO: readonly OpcaoTurno[] = [
  { valor: 'administrado', rotulo: 'Administrado' },
  { valor: 'recusado', rotulo: 'Recusado' },
  { valor: 'adiado', rotulo: 'Adiado' },
  { valor: 'nao_administrado', rotulo: 'Não administrado' },
];

type Contexto = {
  turnoId: string | null;
  catalogo: readonly CatalogoTurnoPublico[];
  prescricoes: readonly RegistroExecucaoPublico[];
  atual?: RegistroExecucaoPublico;
};
type OpcoesEditor = {
  enviar(conteudo: ConteudoExecucaoPublico, motivo?: string): void;
  cancelar(): void;
  alteracaoPendente(valor: boolean): void;
};
/** Comandos que a execução usa enquanto o editor está aberto. */
export type PunhoEditor = {
  bloquear(valor: boolean): void;
  informar(mensagem: string): void;
  focar(): void;
};

/** Ouve `change` diretamente no nó com este `id`, dentro do invólucro do editor — não pela
 *  delegação do React, que as provas desta tela não alcançam ao disparar o evento sem
 *  `bubbles`. `flushSync` porque quem chama costuma conferir o efeito na linha seguinte,
 *  sem esperar repintura agendada. */
function useAoMudarCampo(
  envolucroRef: RefObject<HTMLDivElement | null>,
  id: string,
  aoMudar: (valor: string) => void,
) {
  useEffect(() => {
    const no = envolucroRef.current?.querySelector<HTMLSelectElement>(`#${id}`);
    if (!no) return;
    const ouvir = () => flushSync(() => aoMudar(no.value));
    no.addEventListener('change', ouvir);
    return () => no.removeEventListener('change', ouvir);
  }, [envolucroRef, id, aoMudar]);
}

function controleDe(
  formulario: HTMLFormElement,
  nome: string,
): HTMLInputElement | HTMLTextAreaElement {
  const achado = formulario.elements.namedItem(nome);
  if (achado instanceof HTMLInputElement || achado instanceof HTMLTextAreaElement) return achado;
  throw new Error(`Campo ausente: ${nome}`);
}

export function EditorExecucao({
  classe,
  contexto,
  opcoes,
  registrar,
  travado = false,
}: {
  classe: ClasseExecucao;
  contexto: Contexto;
  opcoes: OpcoesEditor;
  registrar: (punho: PunhoEditor) => void;
  /** Trava vinda de quem conduz o editor (barreira, envio em curso), somada à própria. */
  travado?: boolean;
}) {
  const envolucroRef = useRef<HTMLDivElement>(null);
  const [status, definirStatus] = useState('');
  const [bloqueado, definirBloqueado] = useState(false);

  const atual = contexto.atual?.conteudo;
  const turnoId = contexto.atual?.turno_id ?? contexto.turnoId;
  const legenda = contexto.atual
    ? `Retificar ${rotulosClasse[classe].toLocaleLowerCase('pt-BR')}`
    : rotulosClasse[classe];

  // — aferição —
  const dadosAfericao = atual?.classe === 'afericao' ? atual.dados : undefined;
  const tiposAfericao = contexto.catalogo.filter((item) => !item.observacao && item.ativo);
  const [tipoAfericaoAtual, definirTipoAfericaoAtual] = useState(dadosAfericao?.tipo ?? '');
  useAoMudarCampo(envolucroRef, 'turno-editor-afericao-tipo', definirTipoAfericaoAtual);
  const catalogoSelecionado = tiposAfericao.find((item) => item.tipo === tipoAfericaoAtual);
  const unidadeTexto = catalogoSelecionado?.unidade
    ? `Unidade: ${catalogoSelecionado.unidade}`
    : 'Selecione o tipo para conferir a unidade.';
  const referenciaTexto = catalogoSelecionado?.referencia_informativa
    ? `Referência informativa: ${catalogoSelecionado.referencia_informativa}`
    : 'Nenhuma referência informativa configurada para este tipo.';

  // — administração —
  const dadosAdministracao = atual?.classe === 'administracao' ? atual.dados : undefined;
  const prescricoesAdministracao = contexto.prescricoes.filter(
    (item) => item.conteudo.classe === 'prescricao',
  );
  const opcoesItemAdministracao: OpcaoTurno[] = prescricoesAdministracao.map((item) => ({
    valor: `${item.registro_id}:${item.versao}`,
    rotulo:
      item.conteudo.classe === 'prescricao'
        ? `${item.conteudo.dados.nome} · ${item.conteudo.dados.dose} · ${item.conteudo.dados.via} · versão ${item.versao}`
        : '',
  }));
  const itemHistorico =
    dadosAdministracao &&
    !prescricoesAdministracao.some(
      (item) =>
        item.registro_id === dadosAdministracao.item_id &&
        item.versao === dadosAdministracao.versao,
    )
      ? `${dadosAdministracao.item_id}:${dadosAdministracao.versao}`
      : null;
  if (itemHistorico)
    opcoesItemAdministracao.push({
      valor: itemHistorico,
      rotulo: `Prescrição histórica, versão ${dadosAdministracao?.versao} — identificação indisponível`,
    });
  const [itemAdministracaoAtual, definirItemAdministracaoAtual] = useState(
    dadosAdministracao ? `${dadosAdministracao.item_id}:${dadosAdministracao.versao}` : '',
  );
  useAoMudarCampo(envolucroRef, 'turno-editor-administracao-item', definirItemAdministracaoAtual);
  const itemAdministracaoSelecionado = prescricoesAdministracao.find(
    (item) => `${item.registro_id}:${item.versao}` === itemAdministracaoAtual,
  );
  const detalheItemAdministracao =
    itemAdministracaoSelecionado?.conteudo.classe === 'prescricao'
      ? `Horários prescritos: ${itemAdministracaoSelecionado.conteudo.dados.horarios.join(', ')}. Fonte: ${itemAdministracaoSelecionado.conteudo.dados.fonte_documental}`
      : '';
  const [situacaoAdministracaoAtual, definirSituacaoAdministracaoAtual] = useState(
    dadosAdministracao?.situacao ?? '',
  );
  useAoMudarCampo(
    envolucroRef,
    'turno-editor-administracao-situacao',
    definirSituacaoAdministracaoAtual,
  );

  // — ocorrência —
  const dadosOcorrencia = atual?.classe === 'ocorrencia' ? atual.dados : undefined;

  // — rotina —
  const dadosRotina = atual?.classe === 'rotina' ? atual.dados : undefined;
  const [tipoRotinaAtual, definirTipoRotinaAtual] = useState(dadosRotina?.tipo ?? '');
  useAoMudarCampo(envolucroRef, 'turno-editor-rotina-tipo', definirTipoRotinaAtual);

  // — prescrição —
  const dadosPrescricao = atual?.classe === 'prescricao' ? atual.dados : undefined;

  const bloquear = useCallback((valor: boolean) => flushSync(() => definirBloqueado(valor)), []);
  const informar = useCallback((mensagem: string) => flushSync(() => definirStatus(mensagem)), []);
  const focar = useCallback(() => {
    envolucroRef.current?.querySelector<HTMLElement>('input,select,textarea')?.focus();
  }, []);
  useLayoutEffect(() => {
    registrar({ bloquear, informar, focar });
  }, [registrar, bloquear, informar, focar]);

  function lerConteudo(formulario: HTMLFormElement): unknown {
    if (classe === 'afericao') {
      const tipo = valorDe(formulario, 'tipo');
      return {
        classe,
        dados: {
          turno_id: turnoId,
          tipo,
          valor: numeroTurno(controleDe(formulario, 'valor')),
          unidade: tiposAfericao.find((item) => item.tipo === tipo)?.unidade,
          instante_afericao: instanteTurno(valorDe(formulario, 'instante')),
        },
      };
    }
    if (classe === 'prescricao') {
      return {
        classe,
        dados: {
          nome: valorDe(formulario, 'nome'),
          dose: valorDe(formulario, 'dose'),
          via: valorDe(formulario, 'via'),
          horarios: valorDe(formulario, 'horarios')
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean),
          vigencia_inicio: instanteTurno(valorDe(formulario, 'inicio')),
          vigencia_fim: valorDe(formulario, 'fim')
            ? instanteTurno(valorDe(formulario, 'fim'))
            : null,
          fonte_documental: valorDe(formulario, 'fonte'),
        },
      };
    }
    if (classe === 'administracao') {
      const [item_id, versao] = valorDe(formulario, 'item').split(':');
      const motivoSituacao = valorDe(formulario, 'motivo_situacao').trim();
      return {
        classe,
        dados: {
          turno_id: turnoId,
          item_id,
          versao: Number(versao),
          executor: {
            nome: valorDe(formulario, 'executor'),
            vinculo: valorDe(formulario, 'vinculo'),
          },
          situacao: valorDe(formulario, 'situacao'),
          ...(motivoSituacao ? { motivo: motivoSituacao } : {}),
        },
      };
    }
    if (classe === 'ocorrencia') {
      return {
        classe,
        dados: {
          turno_id: turnoId,
          descricao: valorDe(formulario, 'descricao'),
          instante_ocorrencia: instanteTurno(valorDe(formulario, 'instante')),
          providencia: valorDe(formulario, 'providencia'),
          ...(dadosOcorrencia?.anexo_documento_id
            ? { anexo_documento_id: dadosOcorrencia.anexo_documento_id }
            : {}),
        },
      };
    }
    const tipoRotina = valorDe(formulario, 'tipo');
    let especificos: Record<string, unknown> = {};
    if (tipoRotina === 'refeicao')
      especificos = {
        momento: valorDe(formulario, 'momento'),
        aceitacao: valorDe(formulario, 'aceitacao'),
      };
    else if (tipoRotina === 'hidratacao')
      especificos = { mililitros: numeroTurno(controleDe(formulario, 'mililitros')) };
    else if (tipoRotina === 'sono')
      especificos = {
        inicio: instanteTurno(valorDe(formulario, 'inicio')),
        fim: instanteTurno(valorDe(formulario, 'fim')),
        qualidade: valorDe(formulario, 'qualidade'),
      };
    else if (tipoRotina === 'eliminacao')
      especificos = {
        eliminacao: valorDe(formulario, 'eliminacao'),
        contagem: numeroTurno(controleDe(formulario, 'contagem')),
      };
    const observacao = valorDe(formulario, 'observacao').trim();
    return {
      classe,
      dados: {
        turno_id: turnoId,
        tipo: tipoRotina,
        instante_ocorrencia: instanteTurno(valorDe(formulario, 'instante')),
        ...especificos,
        ...(observacao ? { observacao } : {}),
      },
    };
  }

  function enviarFormulario(formulario: HTMLFormElement) {
    const motivo = contexto.atual ? valorDe(formulario, 'motivo').trim() : undefined;
    try {
      const resultado = conteudoExecucaoPublicoSchema.safeParse(lerConteudo(formulario));
      if (!resultado.success || (contexto.atual && !motivo)) {
        definirStatus(
          'Confira os campos, data, horário e motivo obrigatório. Nenhum registro foi enviado.',
        );
        return;
      }
      opcoes.enviar(resultado.data, motivo);
    } catch (erro) {
      definirStatus(erro instanceof Error ? erro.message : 'Confira os dados informados.');
    }
  }

  return (
    <div ref={envolucroRef}>
      <Formulario
        className="turno-execucao__editor grid min-w-0 gap-4"
        aoEnviar={enviarFormulario}
        onInput={() => opcoes.alteracaoPendente(true)}
        onChange={() => opcoes.alteracaoPendente(true)}
      >
        <fieldset
          disabled={bloqueado || travado}
          className="m-0 grid min-w-0 gap-2 rounded-cartao border border-borda p-4"
        >
          <legend className="px-1 text-(length:--texto-2) font-semibold">{legenda}</legend>
          {classe === 'afericao' ? (
            <>
              <SelecaoTurno
                id="turno-editor-afericao-tipo"
                rotulo="Tipo de aferição"
                nome="tipo"
                opcoes={tiposAfericao.map((item) => ({
                  valor: item.tipo,
                  rotulo: rotuloSinal(item.tipo),
                }))}
                valor={dadosAfericao?.tipo}
              />
              <p className="m-0 text-(length:--texto-1) text-texto-suave">{unidadeTexto}</p>
              <p className="m-0 text-(length:--texto-1) text-texto-suave">{referenciaTexto}</p>
              <CampoTurno
                rotulo="Valor aferido"
                nome="valor"
                tipo="number"
                step="any"
                valor={dadosAfericao ? String(dadosAfericao.valor) : ''}
              />
              <CampoTurno
                rotulo="Data e horário da aferição"
                nome="instante"
                tipo="datetime-local"
                valor={dataLocalTurno(dadosAfericao?.instante_afericao)}
              />
              <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
                {RESSALVA_AFERICAO}
              </p>
            </>
          ) : null}
          {classe === 'prescricao' ? (
            <>
              <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
                {RESSALVA_PRESCRICAO}
              </p>
              <CampoTurno
                rotulo="Medicamento conforme prescrição"
                nome="nome"
                valor={dadosPrescricao?.nome}
              />
              <CampoTurno rotulo="Dose prescrita" nome="dose" valor={dadosPrescricao?.dose} />
              <CampoTurno rotulo="Via prescrita" nome="via" valor={dadosPrescricao?.via} />
              <CampoTurno
                rotulo="Horários previstos"
                nome="horarios"
                longo
                valor={dadosPrescricao?.horarios.join('\n')}
                ajuda="Um horário por linha, no formato HH:MM:SS (até 48). Copie da prescrição."
              />
              <CampoTurno
                rotulo="Início da vigência"
                nome="inicio"
                tipo="datetime-local"
                valor={dataLocalTurno(dadosPrescricao?.vigencia_inicio)}
              />
              <CampoTurno
                rotulo="Fim da vigência (se informado na fonte)"
                nome="fim"
                tipo="datetime-local"
                valor={dataLocalTurno(dadosPrescricao?.vigencia_fim ?? undefined)}
                obrigatorio={false}
              />
              <CampoTurno
                rotulo="Fonte documental da prescrição"
                nome="fonte"
                longo
                valor={dadosPrescricao?.fonte_documental}
              />
            </>
          ) : null}
          {classe === 'administracao' ? (
            <>
              <SelecaoTurno
                id="turno-editor-administracao-item"
                rotulo="Item prescrito e versão"
                nome="item"
                opcoes={opcoesItemAdministracao}
                valor={
                  dadosAdministracao
                    ? `${dadosAdministracao.item_id}:${dadosAdministracao.versao}`
                    : undefined
                }
                disabled={Boolean(dadosAdministracao)}
              />
              <p className="m-0 text-(length:--texto-1) text-texto-suave">
                {detalheItemAdministracao}
              </p>
              <CampoTurno
                rotulo="Quem administrou — nome declarado"
                nome="executor"
                valor={dadosAdministracao?.executor.nome}
              />
              <CampoTurno
                rotulo="Vínculo do executor declarado"
                nome="vinculo"
                valor={dadosAdministracao?.executor.vinculo}
                ajuda="Pode ser profissional externo sem conta. O registrador é identificado pelo acesso autenticado."
              />
              <SelecaoTurno
                id="turno-editor-administracao-situacao"
                rotulo="Situação da administração"
                nome="situacao"
                opcoes={OPCOES_SITUACAO_ADMINISTRACAO}
                valor={dadosAdministracao?.situacao}
              />
              <CampoTurno
                rotulo="Motivo da situação"
                nome="motivo_situacao"
                longo
                valor={dadosAdministracao?.motivo}
                obrigatorio={situacaoAdministracaoAtual !== 'administrado'}
              />
            </>
          ) : null}
          {classe === 'ocorrencia' ? (
            <>
              <CampoTurno
                rotulo="Descrição da ocorrência"
                nome="descricao"
                longo
                valor={dadosOcorrencia?.descricao}
              />
              <CampoTurno
                rotulo="Data e horário da ocorrência"
                nome="instante"
                tipo="datetime-local"
                valor={dataLocalTurno(dadosOcorrencia?.instante_ocorrencia)}
              />
              <CampoTurno
                rotulo="Providência tomada"
                nome="providencia"
                longo
                valor={dadosOcorrencia?.providencia}
              />
              <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
                Após confirmar o registro, você poderá anexar uma foto privada ou converter a
                ocorrência em ação.
              </p>
            </>
          ) : null}
          {classe === 'rotina' ? (
            <>
              <SelecaoTurno
                id="turno-editor-rotina-tipo"
                rotulo="Observação de rotina"
                nome="tipo"
                opcoes={OPCOES_TIPO_ROTINA}
                valor={dadosRotina?.tipo}
              />
              <CampoTurno
                rotulo="Data e horário da observação"
                nome="instante"
                tipo="datetime-local"
                valor={dataLocalTurno(dadosRotina?.instante_ocorrencia)}
              />
              {tipoRotinaAtual === 'refeicao' ? (
                <>
                  <SelecaoTurno
                    rotulo="Momento da refeição"
                    nome="momento"
                    opcoes={OPCOES_PRIORIDADE_MOMENTO}
                    valor={dadosRotina?.tipo === 'refeicao' ? dadosRotina.momento : undefined}
                  />
                  <SelecaoTurno
                    rotulo="Aceitação observada"
                    nome="aceitacao"
                    opcoes={OPCOES_ACEITACAO}
                    valor={dadosRotina?.tipo === 'refeicao' ? dadosRotina.aceitacao : undefined}
                  />
                </>
              ) : null}
              {tipoRotinaAtual === 'hidratacao' ? (
                <CampoTurno
                  rotulo="Volume informado (mL)"
                  nome="mililitros"
                  tipo="number"
                  min="0"
                  step="any"
                  valor={dadosRotina?.tipo === 'hidratacao' ? String(dadosRotina.mililitros) : ''}
                />
              ) : null}
              {tipoRotinaAtual === 'sono' ? (
                <>
                  <CampoTurno
                    rotulo="Início do sono"
                    nome="inicio"
                    tipo="datetime-local"
                    valor={dadosRotina?.tipo === 'sono' ? dataLocalTurno(dadosRotina.inicio) : ''}
                  />
                  <CampoTurno
                    rotulo="Fim do sono"
                    nome="fim"
                    tipo="datetime-local"
                    valor={dadosRotina?.tipo === 'sono' ? dataLocalTurno(dadosRotina.fim) : ''}
                  />
                  <SelecaoTurno
                    rotulo="Qualidade observada"
                    nome="qualidade"
                    opcoes={OPCOES_QUALIDADE_SONO}
                    valor={dadosRotina?.tipo === 'sono' ? dadosRotina.qualidade : undefined}
                  />
                </>
              ) : null}
              {tipoRotinaAtual === 'eliminacao' ? (
                <>
                  <SelecaoTurno
                    rotulo="Tipo de eliminação"
                    nome="eliminacao"
                    opcoes={OPCOES_ELIMINACAO}
                    valor={dadosRotina?.tipo === 'eliminacao' ? dadosRotina.eliminacao : undefined}
                  />
                  <CampoTurno
                    rotulo="Contagem observada"
                    nome="contagem"
                    tipo="number"
                    min="0"
                    step="1"
                    valor={dadosRotina?.tipo === 'eliminacao' ? String(dadosRotina.contagem) : ''}
                  />
                </>
              ) : null}
              <CampoTurno
                rotulo="Observações adicionais (opcional)"
                nome="observacao"
                longo
                obrigatorio={false}
                valor={dadosRotina?.observacao}
              />
              <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
                {RESSALVA_ROTINA}
              </p>
            </>
          ) : null}
          {contexto.atual ? (
            <CampoTurno rotulo="Motivo da retificação" nome="motivo" longo />
          ) : null}
          <div className="flex min-w-0 flex-wrap gap-3">
            <Botao tipo="submit" peso="principal">
              {contexto.atual ? 'Salvar retificação' : 'Registrar'}
            </Botao>
            <Botao peso="secundario" aoAtivar={opcoes.cancelar}>
              Cancelar edição
            </Botao>
          </div>
        </fieldset>
        <EstadoTurno>{status}</EstadoTurno>
      </Formulario>
    </div>
  );
}
