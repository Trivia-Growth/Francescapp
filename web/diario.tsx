/* Aba de Diário e evolução (FR-008, FR-009, FR-012, FR-013, FR-014), reconstruída em React
 * sobre a ilha (`web/ponte/ilha.ts`), com os três módulos do bloco já migrados por baixo:
 * `web/transcricao-audio.tsx`, `web/relato-textual.tsx` (alternativa textual — não usada
 * aqui diretamente, mas o mesmo papel é cumprido por `montarEntradaPorAudio`, que é
 * SEMPRE complementar ao campo de texto, nunca substituto dele) e `web/conversao-diario.tsx`.
 *
 * O contrato exportado não muda: `montarDiario(raiz, pacienteId, usuarioId, servico,
 * obterAreas, acessoPerdido, alteracaoPendente?, converterEmTarefa?, montarEntradaPorAudio?,
 * ehFamilia?) => desmontar`.
 *
 * O que a migração entrega (VIS-012): a versão imperativa tinha `ativa` conferida em cerca
 * de uma dezena de pontos (`descartarAcesso`, `consultar`, `desenhar`, `desenharLeituras`)
 * para proteger escritas em DOM já desmontado. Ela sai como guarda de CICLO DE VIDA —
 * `ilha()` desmonta a raiz React e os efeitos são cancelados por construção — e sobra só
 * como `ativaRef`, que continua tendo um papel: impedir que uma resposta tardia do servidor
 * (consulta ou gravação) prossiga depois que o caso saiu de cena. `geracaoConsulta` também
 * fica: não é sobre ciclo de vida, é sobre uma consulta mais nova invalidar a anterior
 * (reconsulta ao voltar de aba oculta pode se sobrepor à que já estava em voo).
 *
 * Um ponto em que o ciclo de vida do React NÃO basta, e por isso tem guarda própria: os
 * widgets de conversão (`converterEmTarefa`) e de áudio (`montarEntradaPorAudio`) são
 * raízes React PRÓPRIAS, independentes desta árvore (a mesma técnica de `ilha()`, usada de
 * fora). Esvaziar ou substituir esta árvore não as desmonta sozinho — por isso
 * `desmontarConversoes` é chamado explicitamente tanto na perda de acesso quanto na
 * desmontagem real, exatamente como a versão imperativa fazia.
 *
 * Por que o botão "Descartar campos e usar versão atual" vira IRMÃO do nó de destino da
 * conversão, e não é mais anexado DENTRO dele: a versão imperativa media `conversao.raiz`
 * como um container qualquer e podia `.append()` o botão depois. Agora que
 * `web/conversao-diario.tsx` também é uma raiz React (via `ilha()`), escrever direto nos
 * filhos desse nó por fora seria indefinido — o próximo repintura daquela raiz não sabe do
 * nó extra e pode descartá-lo. O botão sai como elemento irmão desta árvore; o efeito
 * visual (aparece logo depois do bloco de conversão) é o mesmo.
 *
 * O que NÃO mudou, de propósito:
 *
 * - **Nenhuma frase mudou de palavra.**
 * - Família só grava `relato_familiar`, audiência sempre `equipe`; nunca o vocabulário da
 *   evolução profissional.
 * - A alternativa por texto (FR-010) continua SEMPRE disponível e anunciada: o campo de
 *   texto nunca é desabilitado por causa do áudio, e funciona sozinho sem microfone.
 * - Troca de editor familiar (retomar rascunho / retificar) exige confirmação de descarte
 *   quando há alteração pendente; salvamento em curso bloqueia a troca.
 * - Conversão em tarefa é por registro publicado/retificado, nunca rascunho, nunca para
 *   família. Versão de origem alterada invalida a conversão em andamento e oferece
 *   "Descartar campos e usar versão atual", com confirmação só quando há campo preenchido.
 * - Diário oculta a lista ao ocultar a aba (família) e reconsulta ao voltar, sem perder
 *   edição em curso.
 *
 * **Os campos dos três formulários continuam elementos nativos, não os de
 * `componentes/ui`.** As provas (`diario.test.ts`) localizam o campo "Categoria" pelo
 * `<label>` que o ENVOLVE (`label.querySelector('input')`), e os componentes do design
 * system colocam o rótulo como irmão do controle. Mesma razão de `web/conversao-diario.tsx`:
 * manter o invólucro evita quebrar a prova por estrutura, não por comportamento.
 */
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type {
  AudienciaDiario,
  ConteudoEvolucaoDiario,
  ConteudoRelatoDiario,
  OrigemConteudoDiario,
  RegistroDiario,
  SalvarRegistroDiario,
} from '../packages/contracts/src/diario.ts';
import { relatoTextualSchema } from '../packages/contracts/src/relato-textual.ts';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { Botao } from './componentes/ui/botao.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { confirmar, confirmarDescarte } from './confirmacao.js';
import type { MontagemConversaoDiario } from './conversao-diario.js';
import { CamposSintese, controleSintese, lerSintese } from './modelo-sintese.js';
import { ilha } from './ponte/ilha.js';
import { Formulario } from './telas/formulario.js';

export type ServicoDiarioTela = {
  consultar(pacienteId: string): Promise<RegistroDiario[]>;
  salvar(pacienteId: string, entrada: SalvarRegistroDiario): Promise<RegistroDiario>;
};

/** Monta jornada atômica autorizada. Diário não grava tarefa nem evolução da conversão. */
export type ConversaoEmTarefa = (
  raiz: HTMLElement,
  origem: RegistroDiario,
  pendente: (valor: boolean) => void,
  aoConcluir: () => void,
) => MontagemConversaoDiario;

/** FR-010: ditar o registro em vez de digitá-lo. A gravação, o envio e a transcrição
 * pertencem à fatia de áudio; o diário só recebe o texto já revisado e confirmado pelo
 * autor. Desde 27/11/2026 a entrada chega como componente, composto na árvore do
 * formulário — antes era uma função que montava DOM numa `div` de ref. */
export type EntradaPorAudio = (aoConfirmar: (texto: string) => void) => ReactNode;

const rotuloEstado: Record<RegistroDiario['estado'], string> = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  retificado: 'Retificado',
};
const rotuloAudiencia: Record<AudienciaDiario, string> = {
  equipe: 'Equipe do caso',
  equipe_e_familia: 'Equipe do caso e família',
};

/** FR-013: envio, consulta e retorno são situações distintas, e consultar não encerra a
 * solicitação de retorno. A frase é montada só para quem enviou. */
function situacaoDoRemetente(registro: RegistroDiario, respostas: number): string {
  if (registro.estado === 'rascunho') return 'Rascunho: ainda não enviado.';
  const partes = ['Enviado'];
  partes.push(registro.consultas > 0 ? 'consultado pela equipe' : 'ainda não consultado');
  if (respostas > 0) partes.push('retorno registrado');
  else if (registro.retorno_solicitado) partes.push('retorno solicitado e ainda não registrado');
  return `${partes.join(' · ')}.`;
}

function dataLegivel(iso: string): string {
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? iso : instante.toLocaleString('pt-BR');
}

/** O indicador de ação em curso; a mensagem acessível continua no `role="status"` da
 *  tela, isto é só a pintura. Substitui `iniciarAcao` (`web/esqueleto.ts`), que mutava o
 *  nó do botão direto no DOM — um botão React reconciliaria por cima na pintura seguinte. */
function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

/** VIS-017: campo secundário de um registro publicado, em `Rótulo: valor`. */
function CamposCurtos({ itens }: { itens: readonly [string, string | undefined][] }) {
  return (
    <dl className="diario-campos">
      {itens
        .filter((item): item is [string, string] => Boolean(item[1]))
        .map(([titulo, valor]) => (
          <div key={titulo}>
            <dt>{titulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Texto livre de um registro publicado: o que a pessoa de fato escreveu, como prosa. */
function Trecho({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="diario-trecho">
      <p className="diario-trecho-rotulo">{titulo}</p>
      <p>{texto}</p>
    </div>
  );
}

/** Procedência do registro numa linha só: situação, instante e audiência. */
function Procedencia({ partes }: { partes: readonly string[] }) {
  return <p className="diario-procedencia">{partes.join(' · ')}</p>;
}

/** Entrada por áudio (FR-010), composta no formulário. `onTexto` passa por ref: a entrada
 *  recebe uma função estável e não nasce de novo a cada repintura do formulário. */
function AudioOuAtalho({
  montar,
  onTexto,
}: {
  montar?: EntradaPorAudio;
  onTexto: (texto: string) => void;
}) {
  const onTextoRef = useRef(onTexto);
  onTextoRef.current = onTexto;
  const [confirmar] = useState(() => (texto: string) => onTextoRef.current(texto));
  if (!montar) return null;
  return <div className="diario-entrada-audio">{montar(confirmar)}</div>;
}

type Gravar = (entrada: SalvarRegistroDiario) => Promise<RegistroDiario>;

/** FR-008: relato da família. Audiência é sempre "equipe" — é a coordenação/equipe que
 * decide ampliar para "equipe e família" ao responder, não quem relata. Sem atenção
 * sinalizada e sem resposta: isso é vocabulário da equipe, não da família. */
function FormularioRelatoFamiliar({
  rascunhoExistente,
  montarEntradaPorAudio,
  gravar,
  aoConcluir,
  onAlterar,
  onAlterarTopoFamiliar,
  onEstadoEnviandoMudar,
  descartarAcesso,
}: {
  rascunhoExistente?: RegistroDiario;
  montarEntradaPorAudio?: EntradaPorAudio;
  gravar: Gravar;
  aoConcluir: (aviso: string) => void;
  onAlterar: (pendente: boolean) => void;
  onAlterarTopoFamiliar: (pendente: boolean) => void;
  onEstadoEnviandoMudar: (enviando: boolean) => void;
  descartarAcesso: (erro: unknown) => boolean;
}) {
  const idBase = useId();
  const envelope = useRef<HTMLDivElement>(null);
  const origemConteudoRef = useRef<OrigemConteudoDiario>(
    rascunhoExistente?.origem_conteudo ?? 'texto',
  );
  const [aviso, definirAviso] = useState('');
  const [enviando, definirEnviando] = useState<'rascunho' | 'publicado' | null>(null);

  const idData = `${idBase}-data`;
  const idDescricao = `${idBase}-descricao`;
  const idCategoria = `${idBase}-categoria`;
  const idContexto = `${idBase}-contexto`;
  const idAcao = `${idBase}-acao`;
  const idRetorno = `${idBase}-retorno`;

  const conteudoExistente = rascunhoExistente?.conteudo as ConteudoRelatoDiario | undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `onAlterar`/`onAlterarTopoFamiliar` são callbacks fixos desta montagem.
  useEffect(() => {
    const no = envelope.current;
    if (!no) return;
    const aoEditar = () => {
      onAlterar(true);
      onAlterarTopoFamiliar(true);
      definirAviso('');
    };
    no.addEventListener('input', aoEditar);
    return () => no.removeEventListener('input', aoEditar);
  }, []);

  function aoReceberDitado(texto: string) {
    const campo = envelope.current?.querySelector<HTMLTextAreaElement>(`[id="${idDescricao}"]`);
    if (campo) campo.value = texto;
    origemConteudoRef.current = 'audio_transcrito';
    onAlterar(true);
    onAlterarTopoFamiliar(true);
    campo?.focus();
  }

  async function enviar(estado: 'rascunho' | 'publicado') {
    const no = envelope.current;
    const dataEl = no?.querySelector<HTMLInputElement>(`[id="${idData}"]`);
    const descricaoEl = no?.querySelector<HTMLTextAreaElement>(`[id="${idDescricao}"]`);
    const categoriaEl = no?.querySelector<HTMLInputElement>(`[id="${idCategoria}"]`);
    const contextoEl = no?.querySelector<HTMLTextAreaElement>(`[id="${idContexto}"]`);
    const acaoEl = no?.querySelector<HTMLTextAreaElement>(`[id="${idAcao}"]`);
    const retornoEl = no?.querySelector<HTMLInputElement>(`[id="${idRetorno}"]`);
    const resultado = relatoTextualSchema.safeParse({
      dataAcontecimento: dataEl?.value ?? '',
      descricao: descricaoEl?.value ?? '',
      ...(categoriaEl?.value.trim() ? { categoria: categoriaEl.value.trim() } : {}),
      ...(contextoEl?.value.trim() ? { contexto: contextoEl.value.trim() } : {}),
      ...(acaoEl?.value.trim() ? { acaoTomada: acaoEl.value.trim() } : {}),
    });
    if (!resultado.success) {
      definirAviso('Informe quando aconteceu e o que aconteceu.');
      (dataEl?.value ? descricaoEl : dataEl)?.focus();
      return;
    }
    definirEnviando(estado);
    onEstadoEnviandoMudar(true);
    definirAviso(estado === 'rascunho' ? 'Salvando rascunho…' : 'Publicando…');
    try {
      await gravar({
        ...(rascunhoExistente ? { diario_registro_id: rascunhoExistente.diario_registro_id } : {}),
        versao_esperada: rascunhoExistente?.versao ?? 0,
        tipo: 'relato_familiar',
        estado,
        audiencia: 'equipe',
        atencao: false,
        retorno_solicitado: retornoEl?.checked ?? false,
        origem_conteudo: origemConteudoRef.current,
        conteudo: resultado.data,
      });
      onAlterar(false);
      onAlterarTopoFamiliar(false);
      aoConcluir(estado === 'rascunho' ? 'Rascunho salvo.' : 'Relato enviado à coordenação.');
    } catch (erro) {
      if (descartarAcesso(erro)) return;
      definirAviso(mensagemFalha(erro));
      definirEnviando(null);
      onEstadoEnviandoMudar(false);
      return;
    }
    definirEnviando(null);
    onEstadoEnviandoMudar(false);
  }

  return (
    <div ref={envelope}>
      <Formulario noValidate aoEnviar={() => void enviar('publicado')}>
        <h3>Registrar no diário</h3>
        <p>Conte o que aconteceu e o que você gostaria de levar à coordenação.</p>
        <fieldset disabled={enviando !== null} className="m-0 min-w-0 border-0 p-0">
          <legend>O que aconteceu</legend>
          <label htmlFor={`${idData}-texto`}>
            Quando aconteceu? (obrigatória)
            <CampoData
              id={idData}
              aria-label="Quando aconteceu? (obrigatória)"
              required
              defaultValue={conteudoExistente?.dataAcontecimento}
            />
          </label>
          <label>
            O que aconteceu? (obrigatória)
            <textarea id={idDescricao} required defaultValue={conteudoExistente?.descricao} />
          </label>
          {montarEntradaPorAudio ? (
            <AudioOuAtalho montar={montarEntradaPorAudio} onTexto={aoReceberDitado} />
          ) : null}
        </fieldset>
        <fieldset disabled={enviando !== null} className="m-0 min-w-0 border-0 p-0">
          <legend>Detalhes, se quiser contar</legend>
          <label>
            Categoria (opcional)
            <input id={idCategoria} defaultValue={conteudoExistente?.categoria ?? ''} />
          </label>
          <label>
            O que ajudou? (opcional)
            <textarea id={idContexto} defaultValue={conteudoExistente?.contexto ?? ''} />
          </label>
          <label>
            Ação tomada (opcional)
            <textarea id={idAcao} defaultValue={conteudoExistente?.acaoTomada ?? ''} />
          </label>
        </fieldset>
        <fieldset disabled={enviando !== null} className="m-0 min-w-0 border-0 p-0">
          <legend>Retorno da coordenação</legend>
          <label>
            Gostaria de um retorno da coordenação
            <input
              id={idRetorno}
              type="checkbox"
              defaultChecked={rascunhoExistente?.retorno_solicitado}
            />
          </label>
        </fieldset>
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já usam. */}
        <p role="status" aria-live="polite">
          {aviso}
        </p>
        <div className="diario-acoes">
          <Botao
            peso="discreto"
            disabled={enviando !== null}
            aria-busy={enviando === 'rascunho' || undefined}
            aoAtivar={() => void enviar('rascunho')}
          >
            Salvar rascunho
            {enviando === 'rascunho' ? <Indicador /> : null}
          </Botao>
          <Botao
            peso="principal"
            tipo="submit"
            disabled={enviando !== null}
            aria-busy={enviando === 'publicado' || undefined}
          >
            Publicar
            {enviando === 'publicado' ? <Indicador /> : null}
          </Botao>
        </div>
      </Formulario>
    </div>
  );
}

/** FR-009: modelo curto por área. As áreas vêm da configuração da equipe; quando a leitura
 * falha, o campo continua existindo como texto livre em vez de sumir da tela — garantia de
 * `CamposSintese`. Os campos são compostos nesta árvore desde 27/11/2026; antes eram montados
 * à mão num contêiner com ref, a direção que produziu os `NotFoundError` da migração. */
function FormularioEvolucao({
  responde,
  obterAreas,
  montarEntradaPorAudio,
  gravar,
  aoConcluir,
  onAlterar,
  descartarAcesso,
}: {
  responde?: RegistroDiario;
  obterAreas: () => readonly string[];
  montarEntradaPorAudio?: EntradaPorAudio;
  gravar: Gravar;
  aoConcluir: (aviso: string) => void;
  onAlterar: (pendente: boolean) => void;
  descartarAcesso: (erro: unknown) => boolean;
}) {
  const idBase = useId();
  const envelope = useRef<HTMLDivElement>(null);
  // As áreas são lidas uma vez por formulário, como antes: trocar no meio da redação mudaria
  // as opções debaixo de quem escreve.
  const [areas] = useState(obterAreas);
  const destinatariosRef = useRef<HTMLParagraphElement>(null);
  const origemAtividadeRef = useRef<OrigemConteudoDiario>('texto');

  const audienciaForcada = responde?.tipo === 'relato_familiar';
  const audienciaInicial: AudienciaDiario = audienciaForcada ? 'equipe_e_familia' : 'equipe';

  const [aviso, definirAviso] = useState('');
  const [enviando, definirEnviando] = useState<'rascunho' | 'publicado' | null>(null);

  const idAudiencia = `${idBase}-audiencia`;
  const idAtencao = `${idBase}-atencao`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `onAlterar` é callback fixo desta montagem; `idAudiencia` é derivado de `idBase`, estável.
  useEffect(() => {
    const no = envelope.current;
    if (!no) return;
    const aoEditar = () => {
      onAlterar(true);
      definirAviso('');
    };
    const aoTrocarAudiencia = (evento: Event) => {
      const alvo = evento.target;
      if (
        !(alvo instanceof HTMLSelectElement) ||
        alvo.id !== idAudiencia ||
        !destinatariosRef.current
      )
        return;
      destinatariosRef.current.textContent = `Ao publicar, este registro ficará visível para: ${rotuloAudiencia[alvo.value as AudienciaDiario]}.`;
    };
    no.addEventListener('input', aoEditar);
    no.addEventListener('change', aoTrocarAudiencia);
    return () => {
      no.removeEventListener('input', aoEditar);
      no.removeEventListener('change', aoTrocarAudiencia);
    };
  }, []);

  function aoReceberDitado(texto: string) {
    const campo = controleSintese(envelope.current, idBase, 'atividade');
    if (campo) campo.value = texto;
    origemAtividadeRef.current = 'audio_transcrito';
    onAlterar(true);
    campo?.focus();
  }

  async function enviar(estado: 'rascunho' | 'publicado') {
    const no = envelope.current;
    const conteudo = lerSintese(no, idBase);
    if (!conteudo) {
      definirAviso('Informe a data do atendimento e a área.');
      const data = controleSintese(no, idBase, 'data');
      (data?.value ? controleSintese(no, idBase, 'area') : data)?.focus();
      return;
    }
    if (estado === 'publicado' && !conteudo.atividade) {
      definirAviso('Para publicar, descreva a atividade realizada.');
      controleSintese(no, idBase, 'atividade')?.focus();
      return;
    }
    const audienciaEl = no?.querySelector<HTMLSelectElement>(`[id="${idAudiencia}"]`);
    const atencaoEl = no?.querySelector<HTMLInputElement>(`[id="${idAtencao}"]`);
    definirEnviando(estado);
    definirAviso(estado === 'rascunho' ? 'Salvando rascunho…' : 'Publicando…');
    try {
      await gravar({
        versao_esperada: 0,
        tipo: 'evolucao_profissional',
        estado,
        audiencia: (audienciaEl?.value ?? audienciaInicial) as AudienciaDiario,
        atencao: atencaoEl?.checked ?? false,
        retorno_solicitado: false,
        origem_conteudo: origemAtividadeRef.current,
        ...(responde ? { responde_registro_id: responde.diario_registro_id } : {}),
        conteudo,
      });
      onAlterar(false);
      aoConcluir(
        estado === 'rascunho'
          ? 'Rascunho salvo.'
          : 'Evolução publicada para a audiência escolhida.',
      );
    } catch (erro) {
      if (descartarAcesso(erro)) return;
      definirAviso(mensagemFalha(erro));
      definirEnviando(null);
      return;
    }
    definirEnviando(null);
  }

  return (
    <div ref={envelope}>
      <Formulario noValidate aoEnviar={() => void enviar('publicado')}>
        <h3>{responde ? 'Responder ao relato da família' : 'Registrar evolução profissional'}</h3>
        <fieldset disabled={enviando !== null} className="m-0 min-w-0 border-0 p-0">
          <CamposSintese areas={areas} prefixo={idBase} />
          {montarEntradaPorAudio ? (
            <AudioOuAtalho montar={montarEntradaPorAudio} onTexto={aoReceberDitado} />
          ) : null}
          <label htmlFor={idAudiencia}>
            Quem verá este registro
            <SelecaoAprimorada
              id={idAudiencia}
              aria-label="Quem verá este registro"
              disabled={audienciaForcada}
              defaultValue={audienciaInicial}
            >
              <option value="equipe">{rotuloAudiencia.equipe}</option>
              <option value="equipe_e_familia">{rotuloAudiencia.equipe_e_familia}</option>
            </SelecaoAprimorada>
          </label>
          {/* FR-013: o retorno precisa alcançar quem escreveu o relato, e o banco recusa outra coisa. */}
          {audienciaForcada ? (
            <p>
              O retorno a um relato da família é sempre visto por quem o escreveu, além da equipe.
            </p>
          ) : null}
          {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já usam. */}
          <p role="status" ref={destinatariosRef}>
            {`Ao publicar, este registro ficará visível para: ${rotuloAudiencia[audienciaInicial]}.`}
          </p>
          <label>
            Indicar necessidade de atenção
            <input id={idAtencao} type="checkbox" />
          </label>
        </fieldset>
        {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
        <p role="status" aria-live="polite">
          {aviso}
        </p>
        <div className="diario-acoes">
          <Botao
            peso="discreto"
            disabled={enviando !== null}
            aria-busy={enviando === 'rascunho' || undefined}
            aoAtivar={() => void enviar('rascunho')}
          >
            Salvar rascunho
            {enviando === 'rascunho' ? <Indicador /> : null}
          </Botao>
          <Botao
            peso="principal"
            tipo="submit"
            disabled={enviando !== null}
            aria-busy={enviando === 'publicado' || undefined}
          >
            Publicar
            {enviando === 'publicado' ? <Indicador /> : null}
          </Botao>
        </div>
      </Formulario>
    </div>
  );
}

/** FR-012: retificar preserva o histórico e exige justificativa. */
function FormularioRetificacao({
  registro,
  gravar,
  aoConcluir,
  onAlterar,
  onAlterarTopoFamiliar,
  onEstadoEnviandoMudar,
  descartarAcesso,
}: {
  registro: RegistroDiario;
  gravar: Gravar;
  aoConcluir: (aviso: string) => void;
  onAlterar: (pendente: boolean) => void;
  onAlterarTopoFamiliar?: (pendente: boolean) => void;
  onEstadoEnviandoMudar?: (enviando: boolean) => void;
  descartarAcesso: (erro: unknown) => boolean;
}) {
  const idBase = useId();
  const envelope = useRef<HTMLDivElement>(null);
  const [aviso, definirAviso] = useState('');
  const [enviando, definirEnviando] = useState(false);
  const idCorrecao = `${idBase}-correcao`;
  const idMotivo = `${idBase}-motivo`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: callbacks fixos desta montagem.
  useEffect(() => {
    const no = envelope.current;
    if (!no) return;
    const aoEditar = () => {
      onAlterarTopoFamiliar?.(true);
      onAlterar(true);
      definirAviso('');
    };
    no.addEventListener('input', aoEditar);
    return () => no.removeEventListener('input', aoEditar);
  }, []);

  async function enviar() {
    const no = envelope.current;
    const correcaoEl = no?.querySelector<HTMLTextAreaElement>(`[id="${idCorrecao}"]`);
    const motivoEl = no?.querySelector<HTMLTextAreaElement>(`[id="${idMotivo}"]`);
    const texto = correcaoEl?.value.trim() ?? '';
    const justificativa = motivoEl?.value.trim() ?? '';
    if (!texto || !justificativa) {
      definirAviso('Informe o texto corrigido e o motivo da retificação.');
      (texto ? motivoEl : correcaoEl)?.focus();
      return;
    }
    const conteudo =
      registro.tipo === 'relato_familiar'
        ? ({ ...(registro.conteudo as ConteudoRelatoDiario), descricao: texto } as const)
        : ({ ...(registro.conteudo as ConteudoEvolucaoDiario), atividade: texto } as const);
    definirEnviando(true);
    onEstadoEnviandoMudar?.(true);
    definirAviso('Registrando retificação…');
    try {
      await gravar({
        diario_registro_id: registro.diario_registro_id,
        versao_esperada: registro.versao,
        tipo: registro.tipo,
        estado: 'retificado',
        audiencia: registro.audiencia,
        atencao: registro.atencao,
        retorno_solicitado: registro.retorno_solicitado,
        origem_conteudo: registro.origem_conteudo,
        conteudo,
        justificativa,
      } as SalvarRegistroDiario);
      onAlterarTopoFamiliar?.(false);
      onAlterar(false);
      aoConcluir('Retificação registrada; a versão anterior continua no histórico.');
    } catch (erro) {
      if (descartarAcesso(erro)) return;
      definirAviso(mensagemFalha(erro));
      definirEnviando(false);
      onEstadoEnviandoMudar?.(false);
      return;
    }
    onEstadoEnviandoMudar?.(false);
  }

  return (
    <div ref={envelope}>
      <Formulario noValidate aoEnviar={() => void enviar()}>
        <h4>Retificar registro publicado</h4>
        <p>
          A versão publicada continua no histórico. A correção entra como nova versão, com data,
          autoria e motivo.
        </p>
        <fieldset disabled={enviando} className="m-0 min-w-0 border-0 p-0">
          <label>
            Texto corrigido (obrigatório)
            <textarea id={idCorrecao} required />
          </label>
          <label>
            Motivo da retificação (obrigatório)
            <textarea id={idMotivo} required />
          </label>
          {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já usam. */}
          <p role="status">{aviso}</p>
          <Botao
            peso="principal"
            tipo="submit"
            disabled={enviando}
            aria-busy={enviando || undefined}
          >
            Registrar retificação
            {enviando ? <Indicador /> : null}
          </Botao>
        </fieldset>
      </Formulario>
    </div>
  );
}

type AcaoInline = 'retificar' | 'responder';

/** Um registro lido, com suas ações e o bloco de conversão (quando elegível). */
function RegistroArtigo({
  registro,
  respostas,
  usuarioId,
  ehFamilia,
  gravar,
  obterAreas,
  montarEntradaPorAudio,
  temConversao,
  precisaReabrir,
  onAoRegistrarNoConversao,
  onReabrirConversao,
  onTrocarEditorFamiliar,
  onAlterar,
  onConcluirInline,
  descartarAcesso,
}: {
  registro: RegistroDiario;
  respostas: number;
  usuarioId: string;
  ehFamilia: boolean;
  gravar: Gravar;
  obterAreas: () => readonly string[];
  montarEntradaPorAudio?: EntradaPorAudio;
  temConversao: boolean;
  precisaReabrir: boolean;
  onAoRegistrarNoConversao: (id: string, no: HTMLDivElement) => void;
  onReabrirConversao: (id: string) => void;
  onTrocarEditorFamiliar: (tipo: 'retomar' | 'retificar', registro: RegistroDiario) => void;
  onAlterar: (pendente: boolean) => void;
  onConcluirInline: (aviso: string) => void;
  descartarAcesso: (erro: unknown) => boolean;
}) {
  const [inlineAberto, definirInlineAberto] = useState<AcaoInline | null>(null);
  const conteudoRelato = registro.conteudo as ConteudoRelatoDiario;
  const conteudoEvolucao = registro.conteudo as ConteudoEvolucaoDiario;
  const ehProprio = registro.autor_usuario_id === usuarioId;

  function aoConcluirLocal(aviso: string) {
    definirInlineAberto(null);
    onConcluirInline(aviso);
  }

  return (
    <li>
      <article>
        <h3>
          {registro.tipo === 'relato_familiar' ? 'Relato da família' : 'Evolução profissional'}
        </h3>
        <Procedencia
          partes={[
            rotuloEstado[registro.estado],
            dataLegivel(registro.criado_em),
            rotuloAudiencia[registro.audiencia],
          ]}
        />
        {registro.origem_conteudo === 'audio_transcrito' ? (
          <p>Texto obtido de transcrição de áudio e revisado pelo autor.</p>
        ) : null}
        {registro.tipo === 'relato_familiar' ? (
          <>
            <Trecho titulo="O que aconteceu" texto={conteudoRelato.descricao} />
            {conteudoRelato.contexto ? (
              <Trecho titulo="O que ajudou" texto={conteudoRelato.contexto} />
            ) : null}
            {conteudoRelato.acaoTomada ? (
              <Trecho titulo="Ação tomada" texto={conteudoRelato.acaoTomada} />
            ) : null}
            <CamposCurtos
              itens={[
                ['Aconteceu em', conteudoRelato.dataAcontecimento],
                ['Categoria', conteudoRelato.categoria],
              ]}
            />
          </>
        ) : (
          <>
            {conteudoEvolucao.atividade ? (
              <Trecho titulo="Atividade" texto={conteudoEvolucao.atividade} />
            ) : null}
            {conteudoEvolucao.observacoesCompartilhaveis ? (
              <Trecho
                titulo="Observações compartilháveis"
                texto={conteudoEvolucao.observacoesCompartilhaveis}
              />
            ) : null}
            {conteudoEvolucao.progresso ? (
              <Trecho titulo="Progresso" texto={conteudoEvolucao.progresso} />
            ) : null}
            {conteudoEvolucao.orientacao ? (
              <Trecho titulo="Orientação" texto={conteudoEvolucao.orientacao} />
            ) : null}
            {conteudoEvolucao.proximoPasso ? (
              <Trecho titulo="Próximo passo" texto={conteudoEvolucao.proximoPasso} />
            ) : null}
            <CamposCurtos
              itens={[
                ['Área', conteudoEvolucao.area],
                ['Data do atendimento', conteudoEvolucao.data],
                ['Objetivo relacionado', conteudoEvolucao.objetivoRelacionado],
              ]}
            />
          </>
        )}
        {registro.justificativa ? (
          <Trecho titulo="Motivo da retificação" texto={registro.justificativa} />
        ) : null}
        {registro.atencao ? (
          <Procedencia partes={['Atenção sinalizada por quem registrou.']} />
        ) : null}
        {registro.tarefa_id ? <Procedencia partes={['Convertido em tarefa da equipe.']} /> : null}
        {ehProprio ? (
          <>
            {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já usam. */}
            <p role="status">{situacaoDoRemetente(registro, respostas)}</p>
            {ehFamilia && registro.tipo === 'relato_familiar' && registro.estado === 'rascunho' ? (
              <Botao peso="discreto" aoAtivar={() => onTrocarEditorFamiliar('retomar', registro)}>
                Retomar rascunho
              </Botao>
            ) : registro.estado !== 'rascunho' ? (
              ehFamilia ? (
                <Botao
                  peso="discreto"
                  aoAtivar={() => onTrocarEditorFamiliar('retificar', registro)}
                >
                  Retificar
                </Botao>
              ) : inlineAberto === 'retificar' ? (
                <FormularioRetificacao
                  registro={registro}
                  gravar={gravar}
                  aoConcluir={aoConcluirLocal}
                  onAlterar={onAlterar}
                  descartarAcesso={descartarAcesso}
                />
              ) : (
                <Botao peso="discreto" aoAtivar={() => definirInlineAberto('retificar')}>
                  Retificar
                </Botao>
              )
            ) : null}
          </>
        ) : !ehFamilia && registro.tipo === 'relato_familiar' && registro.estado !== 'rascunho' ? (
          inlineAberto === 'responder' ? (
            <FormularioEvolucao
              responde={registro}
              obterAreas={obterAreas}
              montarEntradaPorAudio={montarEntradaPorAudio}
              gravar={gravar}
              aoConcluir={aoConcluirLocal}
              onAlterar={onAlterar}
              descartarAcesso={descartarAcesso}
            />
          ) : (
            <Botao peso="discreto" aoAtivar={() => definirInlineAberto('responder')}>
              Responder
            </Botao>
          )
        ) : null}
        {!ehFamilia && registro.estado !== 'rascunho' && temConversao ? (
          <>
            {/* EXCEÇÃO DOCUMENTADA — NÃO "CONSERTAR" COMO AS OUTRAS COSTURAS.
                Esta `div` é SEMPRE VAZIA NO JSX; os filhos pertencem a outra raiz, a da
                conversão em tarefa (`converterEmTarefa`, montada pela gerência em
                `useEffect` mais abaixo). Não mova nem renderize nada aqui dentro.
                É o caso que a documentação do React declara seguro: "if some <div> is
                always empty in the JSX, React won't have a reason to touch its children
                list. Therefore, it is safe to manually add or remove elements there"
                (react.dev, "Manipulating the DOM with Refs", seção "Best practices for DOM
                manipulation with refs"). Decisão da coordenação em 27/11/2026: trocar por
                componente obrigaria a reescrever as provas de
                `diario-conversao-elegibilidade.test.ts`, que afirmam sobre o contrato
                posicional do callback e sobre quantas vezes ele monta — um render-prop é
                chamado a cada render, e as contagens deixariam de medir o que medem. */}
            <div
              ref={(no) => {
                if (no) onAoRegistrarNoConversao(registro.diario_registro_id, no);
              }}
            />
            {precisaReabrir ? (
              <Botao
                peso="secundario"
                aoAtivar={() => onReabrirConversao(registro.diario_registro_id)}
              >
                Descartar campos e usar versão atual
              </Botao>
            ) : null}
          </>
        ) : null}
      </article>
    </li>
  );
}

type EditorFamiliar =
  | { tipo: 'novo' }
  | { tipo: 'retomar'; registro: RegistroDiario }
  | { tipo: 'retificar'; registro: RegistroDiario };

type EstadoLeituras = 'carregando' | 'pronto' | 'erro';

/** Aba de diário e evolução da ficha, ligada ao serviço autorizado no servidor. A
 *  audiência mostrada é informativa: quem decide quem enxerga cada registro é o banco. */
function TelaDiario({
  pacienteId,
  usuarioId,
  servico,
  obterAreas,
  acessoPerdido,
  alteracaoPendente,
  converterEmTarefa,
  montarEntradaPorAudio,
  ehFamilia,
}: {
  pacienteId: string;
  usuarioId: string;
  servico: ServicoDiarioTela;
  obterAreas: () => readonly string[];
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
  converterEmTarefa?: ConversaoEmTarefa;
  montarEntradaPorAudio?: EntradaPorAudio;
  ehFamilia: boolean;
}) {
  const ativaRef = useRef(true);
  const geracaoRef = useRef(0);
  const salvosDuranteConsultaRef = useRef<Map<string, RegistroDiario> | undefined>(undefined);
  const pendenteEditorRef = useRef(false);
  const pendenciasConversaoRef = useRef(new Set<string>());
  const pendenteTopoFamiliarRef = useRef(false);
  const salvandoTopoFamiliarRef = useRef(false);
  const conversoesRef = useRef(
    new Map<string, { versao: number; montagem: MontagemConversaoDiario }>(),
  );
  const nodosConversaoRef = useRef(new Map<string, HTMLDivElement>());
  const envelopeEditorRef = useRef<HTMLDivElement>(null);
  const primeiraTrocaFamiliarRef = useRef(true);
  /* Fora da família, uma reconsulta em segundo plano (disparada por `aoConcluir` de uma
   * conversão) NÃO pode piscar a região para "carregando": isso desmontaria a lista
   * inteira — e com ela o nó que hospeda `converterEmTarefa`, uma raiz React própria cujo
   * conteúdo não sobrevive a ser desmontado e remontado por baixo. A versão imperativa
   * evitava isto porque só chamava `desenharLeituras()` (o redesenho que mostra o
   * esqueleto) para família; fora da família, o quadro só troca uma vez, no sucesso. Aqui
   * o mesmo é obtido guardando se já houve uma carga concluída. */
  const jaCarregouRef = useRef(false);

  const [descartado, definirDescartado] = useState(false);
  const [estadoLeituras, definirEstadoLeituras] = useState<EstadoLeituras>('carregando');
  const [erroInicial, definirErroInicial] = useState<unknown>(undefined);
  const [avisoLeituras, definirAvisoLeituras] = useState('Carregando o diário…');
  const [registros, definirRegistros] = useState<readonly RegistroDiario[]>([]);
  const [mensagemTopo, definirMensagemTopo] = useState<string | undefined>(undefined);
  const [chaveEditor, definirChaveEditor] = useState(0);
  const [editorFamiliar, definirEditorFamiliar] = useState<EditorFamiliar>({ tipo: 'novo' });
  const [idsPrecisandoReabrir, definirIdsPrecisandoReabrir] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [cicloConversoes, definirCicloConversoes] = useState(0);

  function registrarPendencia(valor: boolean) {
    pendenteEditorRef.current = valor;
    alteracaoPendente(valor || pendenciasConversaoRef.current.size > 0);
  }

  function descartarAcesso(erro: unknown): boolean {
    if (!exigeNovoAcesso(erro)) return false;
    ativaRef.current = false;
    geracaoRef.current++;
    for (const conversao of conversoesRef.current.values()) conversao.montagem.desmontar();
    conversoesRef.current.clear();
    flushSync(() => definirDescartado(true));
    acessoPerdido(erro);
    return true;
  }

  const gravar: Gravar = async (entrada) => {
    const salvo = await servico.salvar(pacienteId, entrada);
    salvosDuranteConsultaRef.current?.set(salvo.diario_registro_id, salvo);
    definirRegistros((atuais) => [
      salvo,
      ...atuais.filter((r) => r.diario_registro_id !== salvo.diario_registro_id),
    ]);
    return salvo;
  };

  function aoConcluirEdicaoPrincipal(aviso: string) {
    flushSync(() => {
      definirMensagemTopo(aviso);
      if (ehFamilia) definirEditorFamiliar({ tipo: 'novo' });
      definirChaveEditor((n) => n + 1);
    });
  }

  async function trocarEditorFamiliar(tipo: 'retomar' | 'retificar', registro: RegistroDiario) {
    if (salvandoTopoFamiliarRef.current) return;
    if (
      pendenteTopoFamiliarRef.current &&
      !(await confirmarDescarte('as alterações não salvas do relato atual'))
    )
      return;
    if (salvandoTopoFamiliarRef.current) return;
    pendenteTopoFamiliarRef.current = false;
    registrarPendencia(false);
    flushSync(() => {
      definirEditorFamiliar({ tipo, registro });
      definirChaveEditor((n) => n + 1);
    });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: `editorFamiliar` não é lido no corpo de propósito — é o GATILHO: a cada troca de editor familiar (retomar/retificar/novo), o primeiro campo do formulário recém-montado recebe foco.
  useEffect(() => {
    if (primeiraTrocaFamiliarRef.current) {
      primeiraTrocaFamiliarRef.current = false;
      return;
    }
    const no = envelopeEditorRef.current?.querySelector<HTMLElement>('input, textarea');
    no?.focus();
  }, [editorFamiliar]);

  const consultar = async () => {
    const geracao = ++geracaoRef.current;
    const salvos = new Map<string, RegistroDiario>();
    salvosDuranteConsultaRef.current = salvos;
    if (ehFamilia || !jaCarregouRef.current) {
      flushSync(() => {
        definirEstadoLeituras('carregando');
        definirAvisoLeituras('Carregando o diário…');
      });
    }
    try {
      const recebidos = await servico.consultar(pacienteId);
      if (!ativaRef.current || geracao !== geracaoRef.current) return;
      salvosDuranteConsultaRef.current = undefined;
      jaCarregouRef.current = true;
      flushSync(() => {
        definirRegistros([
          ...salvos.values(),
          ...recebidos.filter((r) => !salvos.has(r.diario_registro_id)),
        ]);
        definirEstadoLeituras('pronto');
        definirAvisoLeituras('');
      });
    } catch (erro) {
      if (!ativaRef.current || geracao !== geracaoRef.current || descartarAcesso(erro)) return;
      salvosDuranteConsultaRef.current = undefined;
      flushSync(() => {
        definirEstadoLeituras('erro');
        definirErroInicial(erro);
        definirAvisoLeituras(ehFamilia ? mensagemFalha(erro) : '');
      });
    }
  };

  const aoMudarVisibilidadeRef = useRef<() => void>(() => {});
  aoMudarVisibilidadeRef.current = () => {
    if (document.visibilityState === 'hidden') {
      geracaoRef.current++;
      salvosDuranteConsultaRef.current = undefined;
      flushSync(() => {
        definirRegistros([]);
        definirEstadoLeituras('carregando');
        definirAvisoLeituras('');
      });
    } else {
      void consultar();
    }
  };

  useEffect(() => {
    if (!ehFamilia) return;
    const ouvir = () => aoMudarVisibilidadeRef.current();
    document.addEventListener('visibilitychange', ouvir);
    return () => document.removeEventListener('visibilitychange', ouvir);
  }, [ehFamilia]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: consulta inicial, uma vez por montagem; `consultar`/`ehFamilia`/`registrarPendencia` são estáveis nesta montagem.
  useEffect(() => {
    if (ehFamilia) {
      if (document.visibilityState !== 'hidden') void consultar();
    } else {
      void consultar();
    }
    return () => {
      ativaRef.current = false;
      geracaoRef.current++;
      for (const conversao of conversoesRef.current.values()) conversao.montagem.desmontar();
      conversoesRef.current.clear();
      registrarPendencia(false);
    };
  }, []);

  // Gerência das conversões (`converterEmTarefa`): monta o que é elegível, invalida ao
  // trocar de versão, desmonta o que deixou de ser elegível. Reage a `registros` e ao
  // contador manual `cicloConversoes`, que o reabrir-após-descarte usa para forçar nova
  // rodada sem esperar uma nova consulta.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `converterEmTarefa`/`ehFamilia`/`alteracaoPendente`/`consultar` são estáveis nesta montagem; `cicloConversoes` não é lido no corpo de propósito — é o GATILHO manual que o reabrir-após-descarte incrementa para forçar nova rodada.
  useEffect(() => {
    if (ehFamilia || !converterEmTarefa) return;
    const elegiveis = new Set(
      registros.filter((r) => r.estado !== 'rascunho').map((r) => r.diario_registro_id),
    );
    for (const registro of registros) {
      if (registro.estado === 'rascunho') continue;
      const id = registro.diario_registro_id;
      const no = nodosConversaoRef.current.get(id);
      if (!no) continue;
      const existente = conversoesRef.current.get(id);
      if (!existente) {
        const montagem = converterEmTarefa(
          no,
          registro,
          (valor) => {
            if (valor) pendenciasConversaoRef.current.add(id);
            else pendenciasConversaoRef.current.delete(id);
            alteracaoPendente(pendenteEditorRef.current || pendenciasConversaoRef.current.size > 0);
          },
          () => void consultar(),
        );
        conversoesRef.current.set(id, { versao: registro.versao, montagem });
        continue;
      }
      if (existente.versao !== registro.versao) {
        existente.montagem.invalidarOrigem();
        existente.versao = registro.versao;
        definirIdsPrecisandoReabrir((atuais) => {
          if (atuais.has(id)) return atuais;
          return new Set(atuais).add(id);
        });
      }
    }
    for (const [id, conversao] of conversoesRef.current) {
      if (!elegiveis.has(id)) {
        conversao.montagem.desmontar();
        conversoesRef.current.delete(id);
        nodosConversaoRef.current.delete(id);
        definirIdsPrecisandoReabrir((atuais) => {
          if (!atuais.has(id)) return atuais;
          const proximas = new Set(atuais);
          proximas.delete(id);
          return proximas;
        });
      }
    }
  }, [registros, cicloConversoes]);

  async function aoReabrirConversao(id: string) {
    const temPendencia = pendenciasConversaoRef.current.has(id);
    if (
      temPendencia &&
      !(await confirmar({
        titulo: 'Descartar os campos da conversão anterior?',
        detalhe:
          'A versão atual do registro abre no lugar, e o que foi digitado na conversão anterior se perde.',
        acao: 'Descartar e abrir a versão atual',
        cancelar: 'Manter os campos',
      }))
    )
      return;
    const conversao = conversoesRef.current.get(id);
    conversao?.montagem.desmontar();
    conversoesRef.current.delete(id);
    pendenciasConversaoRef.current.delete(id);
    flushSync(() => {
      definirIdsPrecisandoReabrir((atuais) => {
        if (!atuais.has(id)) return atuais;
        const proximas = new Set(atuais);
        proximas.delete(id);
        return proximas;
      });
      definirCicloConversoes((n) => n + 1);
    });
  }

  if (descartado) return null;

  if (!ehFamilia && estadoLeituras === 'carregando') {
    return (
      <>
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já usam. */}
        <p role="status">Carregando o diário…</p>
        <div className="list-loading" data-compacto="" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </>
    );
  }
  if (!ehFamilia && estadoLeituras === 'erro') {
    // biome-ignore lint/a11y/useSemanticElements: idem.
    return <p role="status">{mensagemFalha(erroInicial)}</p>;
  }

  const carregandoLeituras = estadoLeituras === 'carregando';
  const chaveEditorTexto = `${chaveEditor}:${editorFamiliar.tipo}`;

  return (
    <div className="min-w-0">
      <h2>Diário e evolução</h2>
      <p>
        O diário registra o acompanhamento entre atendimentos. Ele não é canal de emergência e não
        garante resposta imediata.
      </p>
      {mensagemTopo ? (
        // biome-ignore lint/a11y/useSemanticElements: idem.
        <p role="status">{mensagemTopo}</p>
      ) : null}
      <div ref={envelopeEditorRef}>
        {ehFamilia ? (
          editorFamiliar.tipo === 'retificar' ? (
            <FormularioRetificacao
              key={chaveEditorTexto}
              registro={editorFamiliar.registro}
              gravar={gravar}
              aoConcluir={aoConcluirEdicaoPrincipal}
              onAlterar={registrarPendencia}
              onAlterarTopoFamiliar={(valor) => {
                pendenteTopoFamiliarRef.current = valor;
              }}
              onEstadoEnviandoMudar={(valor) => {
                salvandoTopoFamiliarRef.current = valor;
              }}
              descartarAcesso={descartarAcesso}
            />
          ) : (
            <FormularioRelatoFamiliar
              key={chaveEditorTexto}
              rascunhoExistente={
                editorFamiliar.tipo === 'retomar' ? editorFamiliar.registro : undefined
              }
              montarEntradaPorAudio={montarEntradaPorAudio}
              gravar={gravar}
              aoConcluir={aoConcluirEdicaoPrincipal}
              onAlterar={registrarPendencia}
              onAlterarTopoFamiliar={(valor) => {
                pendenteTopoFamiliarRef.current = valor;
              }}
              onEstadoEnviandoMudar={(valor) => {
                salvandoTopoFamiliarRef.current = valor;
              }}
              descartarAcesso={descartarAcesso}
            />
          )
        ) : (
          <FormularioEvolucao
            key={chaveEditorTexto}
            obterAreas={obterAreas}
            montarEntradaPorAudio={montarEntradaPorAudio}
            gravar={gravar}
            aoConcluir={aoConcluirEdicaoPrincipal}
            onAlterar={registrarPendencia}
            descartarAcesso={descartarAcesso}
          />
        )}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
      <p role="status">{avisoLeituras}</p>
      <div aria-busy={carregandoLeituras}>
        {ehFamilia && document.visibilityState === 'hidden' ? null : (
          <>
            {carregandoLeituras ? (
              <div className="list-loading" data-compacto="" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            ) : null}
            {estadoLeituras === 'pronto' && registros.length === 0 ? (
              <EstadoVazio titulo="Nenhum registro no diário deste paciente ainda." />
            ) : null}
            {estadoLeituras === 'pronto' && registros.length > 0 ? (
              <ul>
                {registros.map((registro) => (
                  <RegistroArtigo
                    key={registro.diario_registro_id}
                    registro={registro}
                    respostas={
                      registros.filter(
                        (outro) => outro.responde_registro_id === registro.diario_registro_id,
                      ).length
                    }
                    usuarioId={usuarioId}
                    ehFamilia={ehFamilia}
                    gravar={gravar}
                    obterAreas={obterAreas}
                    montarEntradaPorAudio={montarEntradaPorAudio}
                    temConversao={Boolean(converterEmTarefa)}
                    precisaReabrir={idsPrecisandoReabrir.has(registro.diario_registro_id)}
                    onAoRegistrarNoConversao={(id, no) => nodosConversaoRef.current.set(id, no)}
                    onReabrirConversao={(id) => void aoReabrirConversao(id)}
                    onTrocarEditorFamiliar={(tipo, reg) => void trocarEditorFamiliar(tipo, reg)}
                    onAlterar={registrarPendencia}
                    onConcluirInline={(aviso) => {
                      definirMensagemTopo(aviso);
                      if (!ehFamilia) definirChaveEditor((n) => n + 1);
                    }}
                    descartarAcesso={descartarAcesso}
                  />
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** Aba de diário e evolução da ficha (FR-008, FR-009, FR-012, FR-013, FR-014), ligada ao
 * serviço autorizado no servidor. A audiência mostrada aqui é informativa: quem decide quem
 * enxerga cada registro é o banco. */
export function montarDiario(
  raiz: HTMLElement,
  pacienteId: string,
  usuarioId: string,
  servico: ServicoDiarioTela,
  obterAreas: () => readonly string[],
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
  converterEmTarefa?: ConversaoEmTarefa,
  montarEntradaPorAudio?: EntradaPorAudio,
  /** FR-008: família registra relato (tipo `relato_familiar`, audiência sempre `equipe`),
   * nunca a síntese de evolução da equipe nem a resposta a um relato. */
  ehFamilia = false,
): () => void {
  return ilha(
    raiz,
    <TelaDiario
      pacienteId={pacienteId}
      usuarioId={usuarioId}
      servico={servico}
      obterAreas={obterAreas}
      acessoPerdido={acessoPerdido}
      alteracaoPendente={alteracaoPendente}
      converterEmTarefa={converterEmTarefa}
      montarEntradaPorAudio={montarEntradaPorAudio}
      ehFamilia={ehFamilia}
    />,
  );
}
