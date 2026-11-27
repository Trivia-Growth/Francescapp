/* FR-037 / DF-024: seção administrativa da substituição temporária da case manager,
 * reconstruída em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarSubstituicaoCaseManager(raiz, servicoOuNulo,
 * opcoes) => desmontar`. Sem `acessoPerdido`: esta seção nunca teve guarda de
 * revalidação de sessão própria — uma recusa de permissão aparece como mensagem, igual a
 * qualquer outra falha de domínio (`mensagemDeErro`). Isso não muda na migração.
 *
 * A tela diz as três coisas que o requisito exige mostrar — quem é o titular, quem
 * substitui e até quando — e repete em texto que substituir não concede acesso ao caso
 * nem alcança a carteira. Esconder controle não é autorização: o botão aparece e a recusa
 * do servidor é explicada.
 *
 * VIS-012: os `if (!ativa) return` da versão imperativa desapareceram — `ilha()` desmonta
 * a raiz React e os efeitos são cancelados por construção.
 *
 * O que NÃO mudou, de propósito:
 *
 * - `.list-loading` continua sendo o marcador do esqueleto de carregamento do histórico —
 *   NÃO trocado pelo componente `Esqueleto` do design system, porque é o gancho exato que
 *   a prova de tela já verifica (`esqueletoCarregando` original). Reescrita documentada:
 *   DOM equivalente composto em JSX, mesma classe, mesmo `aria-hidden`, mesma contagem de
 *   linhas.
 * - Encerrar uma substituição não trava nenhum controle (nem o próprio formulário de
 *   encerramento): preservado tal como estava, para não mudar o comportamento sob
 *   concorrência sem um motivo novo.
 * - Nenhuma frase mudou de palavra, incluindo as quatro de `mensagemDeErro`.
 */
import { useCallback, useRef, useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import type {
  PainelSubstituicao,
  SubstituicaoCaseManager,
} from '../packages/contracts/src/substituicao-case-manager.ts';
import type { ResponsavelOpcao } from './acompanhamento-caso.ts';
import { Botao } from './componentes/ui/botao.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import type { ServicoSubstituicaoCaseManager } from './servico-substituicao-cm-http.ts';
import { Formulario, valorDe } from './telas/formulario.js';

const formato = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function quando(valor: string): string {
  const instante = new Date(valor);
  return Number.isNaN(instante.getTime()) ? valor : formato.format(instante);
}

/** Campo datetime-local produz hora sem fuso; o contrato pede instante com deslocamento. */
function paraInstante(valor: string): string | null {
  if (!valor) return null;
  const instante = new Date(valor);
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}

function mensagemDeErro(erro: unknown): string {
  const codigo = erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
  if (codigo === 'responsavel_invalido')
    return 'Período ou pessoa indisponível. A substituta precisa ter acesso ativo, ser diferente do titular e o período precisa terminar no futuro.';
  if (codigo === 'conflito')
    return 'Já existe substituição registrada para parte desse período. Encerre a atual ou escolha outro período.';
  if (codigo === 'sem_permissao') return 'Sua conta não pode registrar substituição neste caso.';
  return 'Não foi possível concluir. Tente de novo.';
}

/** Esqueleto de carregamento do histórico — ver nota de cabeçalho: gancho `.list-loading`
 *  preservado literalmente porque a prova de tela depende dele. */
function EsqueletoHistorico() {
  return (
    <div className="list-loading" data-compacto="" aria-hidden="true">
      <span />
      <span />
    </div>
  );
}

function textoStatus(painel: PainelSubstituicao, nomear: (id: string | null) => string): string {
  if (painel.titular_usuario_id === null)
    return 'Este caso ainda não tem case manager titular. Indique o responsável antes de registrar substituição.';
  if (painel.vigente)
    return `${nomear(painel.vigente.substituto_usuario_id)} responde até ${quando(painel.vigente.fim)}.`;
  return 'Sem substituição vigente.';
}

/** `nomear` é derivado da equipe: titular/substituto aparecem pelo rótulo cadastrado, e
 *  um vínculo ainda não escolhido aparece como "a completar". */
function montarNomeador(equipe: readonly ResponsavelOpcao[]) {
  return (id: string | null): string =>
    id === null
      ? 'a completar'
      : (equipe.find((pessoa) => pessoa.usuario_id === id)?.rotulo ?? 'Pessoa da equipe');
}

function ItemHistorico({
  item,
  painel,
  nomear,
  aoEncerrar,
}: {
  item: SubstituicaoCaseManager;
  painel: PainelSubstituicao;
  nomear: (id: string | null) => string;
  aoEncerrar: (item: SubstituicaoCaseManager, motivo: string) => void;
}) {
  async function enviarEncerramento(formulario: HTMLFormElement) {
    const motivo = valorDe(formulario, 'motivo-encerramento').trim();
    if (motivo.length === 0) {
      formulario.querySelector('textarea')?.focus();
      aoEncerrar(item, '');
      return;
    }
    aoEncerrar(item, motivo);
  }

  const situacao = item.encerrada_em
    ? `Encerrada em ${quando(item.encerrada_em)}`
    : painel.vigente?.id === item.id
      ? 'Vigente agora'
      : 'Programada';

  return (
    <li className="substituicao-cm__item" data-substituicao={item.id}>
      <p className="m-0">{`${nomear(item.substituto_usuario_id)} — de ${quando(item.inicio)} até ${quando(item.fim)}`}</p>
      <p className="substituicao-cm__situacao m-0">{situacao}</p>
      <p className="substituicao-cm__motivo m-0">{`Motivo: ${item.motivo}`}</p>
      {item.motivo_encerramento ? (
        <p className="substituicao-cm__motivo m-0">{`Motivo do encerramento: ${item.motivo_encerramento}`}</p>
      ) : null}
      {item.encerrada_em ? null : (
        <Formulario
          aoEnviar={enviarEncerramento}
          noValidate
          className="substituicao-cm__encerramento grid min-w-0 gap-2"
        >
          <label className="grid min-w-0 gap-1">
            <span>Motivo do encerramento</span>
            <textarea name="motivo-encerramento" required maxLength={500} rows={2} />
          </label>
          <div>
            <Botao peso="secundario" tipo="submit">
              Encerrar agora
            </Botao>
          </div>
        </Formulario>
      )}
    </li>
  );
}

function TelaSubstituicaoCaseManager({
  pacienteId,
  servico,
  equipe,
}: {
  pacienteId: string;
  servico: ServicoSubstituicaoCaseManager;
  equipe: readonly ResponsavelOpcao[];
}) {
  const [status, definirStatus] = useState('Carregando substituição…');
  const [aviso, definirAviso] = useState('');
  const [painel, definirPainel] = useState<PainelSubstituicao | null>(null);
  const [carregandoHistorico, definirCarregandoHistorico] = useState(true);
  const [recarregarDesabilitado, definirRecarregarDesabilitado] = useState(true);
  const [registrando, definirRegistrando] = useState(false);
  const [tentativa, definirTentativa] = useState(0);

  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;
  const nomear = useRef(montarNomeador(equipe));
  nomear.current = montarNomeador(equipe);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tentativa` não é lida no corpo de propósito — é o GATILHO de recarga que o botão "Recarregar" incrementa. Tirá-la daqui faria a nova tentativa não acontecer.
  useEffect(() => {
    let valida = true;
    flushSync(() => {
      definirStatus('Carregando substituição…');
      definirCarregandoHistorico(true);
      definirRecarregarDesabilitado(true);
    });
    servicoAtual.current
      .consultar(pacienteId)
      .then((recebido) => {
        if (!valida) return;
        flushSync(() => {
          definirPainel(recebido);
          definirCarregandoHistorico(false);
          definirRecarregarDesabilitado(false);
          definirStatus(textoStatus(recebido, nomear.current));
        });
      })
      .catch((erro: unknown) => {
        if (!valida) return;
        flushSync(() => {
          definirCarregandoHistorico(false);
          definirRecarregarDesabilitado(false);
          definirStatus('Não foi possível carregar a substituição deste caso. Tente recarregar.');
          definirAviso(mensagemDeErro(erro));
        });
      });
    return () => {
      valida = false;
    };
  }, [pacienteId, tentativa]);

  async function enviarRegistro(formulario: HTMLFormElement) {
    if (registrando) return;
    const substitutoId = valorDe(formulario, 'pessoa');
    const de = paraInstante(valorDe(formulario, 'inicio'));
    const ate = paraInstante(valorDe(formulario, 'fim'));
    const porque = valorDe(formulario, 'motivo').trim();
    if (!substitutoId || !de || !ate || porque.length === 0) {
      definirAviso('Escolha a pessoa, informe início e fim e explique o motivo.');
      return;
    }
    if (Date.parse(ate) <= Date.parse(de)) {
      definirAviso('O fim precisa ser depois do início.');
      return;
    }
    definirRegistrando(true);
    definirAviso('Registrando…');
    try {
      const recebido = await servicoAtual.current.registrar(pacienteId, {
        substituto_usuario_id: substitutoId,
        inicio: de,
        fim: ate,
        motivo: porque,
      });
      flushSync(() => {
        definirPainel(recebido);
        definirStatus(textoStatus(recebido, nomear.current));
        definirAviso('Substituição registrada.');
      });
      formulario.reset();
    } catch (erro) {
      flushSync(() => definirAviso(mensagemDeErro(erro)));
    } finally {
      definirRegistrando(false);
    }
  }

  const aoEncerrar = useCallback(
    (item: SubstituicaoCaseManager, motivo: string) => {
      if (motivo.length === 0) {
        definirAviso('Informe o motivo do encerramento.');
        return;
      }
      definirAviso('Encerrando…');
      void servicoAtual.current
        .encerrar(pacienteId, { substituicao_id: item.id, motivo })
        .then((recebido) => {
          flushSync(() => {
            definirPainel(recebido);
            definirStatus(textoStatus(recebido, nomear.current));
            definirAviso('Substituição encerrada. O titular volta a responder.');
          });
        })
        .catch((erro: unknown) => {
          flushSync(() => definirAviso(mensagemDeErro(erro)));
        });
    },
    [pacienteId],
  );

  const registrarDesabilitado = painel ? painel.titular_usuario_id === null : false;
  const opcoesEquipe = painel
    ? equipe.filter((pessoa) => pessoa.ativo && pessoa.usuario_id !== painel.titular_usuario_id)
    : [];

  return (
    <section className="substituicao-cm grid min-w-0 gap-4">
      <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
        Substituição temporária da case manager
      </h2>
      <p className="substituicao-cm__explicacao m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
        Durante o período registrado, a substituta responde como case manager atual deste caso. A
        substituição não vale para outros casos nem para a carteira, e não concede acesso ao
        conteúdo do caso.
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as telas e as provas já usam. */}
      <p
        role="status"
        aria-live="polite"
        className="substituicao-cm__status m-0 text-(length:--texto-1) text-texto-suave"
      >
        {status}
      </p>
      <dl className="substituicao-cm__resumo m-0 grid min-w-0 gap-1">
        {painel ? (
          <>
            <dt>Case manager titular</dt>
            <dd>{nomear.current(painel.titular_usuario_id)}</dd>
            <dt>Responde agora</dt>
            <dd>{nomear.current(painel.case_manager_atual_id)}</dd>
            <dt>Substituição vigente</dt>
            <dd>
              {painel.vigente
                ? `${nomear.current(painel.vigente.substituto_usuario_id)} até ${quando(painel.vigente.fim)}`
                : 'Nenhuma. O titular responde pelo caso.'}
            </dd>
          </>
        ) : null}
      </dl>

      <Formulario
        aoEnviar={enviarRegistro}
        noValidate
        className="substituicao-cm__formulario grid min-w-0 max-w-[480px] gap-3"
      >
        <label className="grid min-w-0 gap-1">
          <span>Quem substitui</span>
          <select name="pessoa" required disabled={registrando}>
            <option value="">Escolha a pessoa</option>
            {opcoesEquipe.map((pessoa) => (
              <option key={pessoa.usuario_id} value={pessoa.usuario_id}>
                {pessoa.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1">
          <span>Início</span>
          <input type="datetime-local" name="inicio" required disabled={registrando} />
        </label>
        <label className="grid min-w-0 gap-1">
          <span>Fim</span>
          <input type="datetime-local" name="fim" required disabled={registrando} />
        </label>
        <label className="grid min-w-0 gap-1">
          <span>Motivo da substituição</span>
          <textarea
            name="motivo"
            required
            maxLength={500}
            rows={3}
            disabled={registrando}
            aria-describedby="substituicao-cm-motivo-ajuda"
          />
        </label>
        <p
          id="substituicao-cm-motivo-ajuda"
          className="m-0 text-(length:--texto-1) text-texto-suave"
        >
          Obrigatório: toda alteração de acesso registra data, responsável e motivo. O texto é
          guardado cifrado.
        </p>
        <div>
          <Botao peso="principal" tipo="submit" disabled={registrarDesabilitado || registrando}>
            Registrar substituição
          </Botao>
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
        <p
          role="status"
          aria-live="polite"
          className="substituicao-cm__aviso m-0 text-(length:--texto-1) text-texto-suave empty:hidden"
        >
          {aviso}
        </p>
      </Formulario>

      <div
        className="substituicao-cm__historico grid min-w-0 gap-3"
        aria-busy={carregandoHistorico || undefined}
      >
        {carregandoHistorico ? (
          <EsqueletoHistorico />
        ) : painel === null ? null : painel.substituicoes.length === 0 ? (
          <p className="substituicao-cm__vazio m-0 text-(length:--texto-1) text-texto-suave">
            Nenhuma substituição registrada neste caso.
          </p>
        ) : (
          <ul className="substituicao-cm__lista m-0 grid min-w-0 list-none gap-3 p-0">
            {painel.substituicoes.map((item) => (
              <ItemHistorico
                key={item.id}
                item={item}
                painel={painel}
                nomear={nomear.current}
                aoEncerrar={aoEncerrar}
              />
            ))}
          </ul>
        )}
      </div>

      <div>
        <Botao
          peso="secundario"
          disabled={recarregarDesabilitado}
          aoAtivar={() => definirTentativa((valor) => valor + 1)}
        >
          Recarregar
        </Botao>
      </div>
    </section>
  );
}

/** Estado honesto de fatia desligada: a seção aparece, diz o que é e diz que ainda não está
 * disponível neste ambiente. Sem formulário, sem botão que falharia e sem mensagem de erro —
 * não houve falha, a funcionalidade é que não está ligada. */
function TelaIndisponivel() {
  return (
    <section className="substituicao-cm substituicao-cm--indisponivel grid min-w-0 gap-4">
      <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
        Substituição temporária da case manager
      </h2>
      <p className="substituicao-cm__explicacao m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
        Durante o período registrado, a substituta responde como case manager atual deste caso. A
        substituição não vale para outros casos nem para a carteira, e não concede acesso ao
        conteúdo do caso.
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
      <p
        role="status"
        aria-live="polite"
        className="substituicao-cm__status m-0 text-(length:--texto-1) text-texto-suave"
      >
        A substituição temporária ainda não está disponível neste ambiente. Quem lidera o caso
        continua sendo o responsável registrado no cadastro.
      </p>
    </section>
  );
}

/** FR-037 / DF-024: seção administrativa da substituição temporária da case manager.
 *
 * A tela diz as três coisas que o requisito exige mostrar — quem é o titular, quem
 * substitui e até quando — e repete em texto que substituir não concede acesso ao caso
 * nem alcança a carteira. Esconder controle não é autorização: o botão aparece e a recusa
 * do servidor é explicada. */
/** A seção composta por quem já está em React: `null` é a fatia desligada, e a tela diz
 *  isso em vez de oferecer um formulário que responderia 503. */
export function SecaoSubstituicaoCaseManager({
  servico,
  pacienteId,
  equipe = [],
}: {
  servico: ServicoSubstituicaoCaseManager | null;
  pacienteId: string;
  equipe?: readonly ResponsavelOpcao[];
}) {
  if (servico === null) return <TelaIndisponivel />;
  return <TelaSubstituicaoCaseManager pacienteId={pacienteId} servico={servico} equipe={equipe} />;
}

export function montarSubstituicaoCaseManager(
  raiz: HTMLElement,
  servicoOuNulo: ServicoSubstituicaoCaseManager | null,
  opcoes: { paciente_id: string; equipe?: readonly ResponsavelOpcao[] },
): () => void {
  // Fatia desligada: a tela diz isso com todas as letras em vez de oferecer um formulário que
  // responderia 503, e em vez de alegar falha de carregamento. Esconder não seria honesto, e
  // mostrar um erro mentiria sobre a causa.
  if (servicoOuNulo === null) return ilha(raiz, <TelaIndisponivel />);
  return ilha(
    raiz,
    <TelaSubstituicaoCaseManager
      pacienteId={opcoes.paciente_id}
      servico={servicoOuNulo}
      equipe={opcoes.equipe ?? []}
    />,
  );
}
