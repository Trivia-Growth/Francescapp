/* Solicitações do titular sobre dados pessoais (FR-040), reconstruído em React sobre a
 * ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarSolicitacoesTitular(raiz, servico, opcoes?) =>
 * desmontar`.
 *
 * Registrar e responder. Responder NÃO apaga dado nenhum — grava a medida adotada e o
 * fundamento. É o que o requisito pede: "revogar consentimento não significa apagar
 * automaticamente todos os registros", e uma eventual guarda precisa de fundamento
 * registrado.
 *
 * A tela mostra tipo, data, estado e medida. O texto do pedido e o da resposta ficam
 * cifrados no banco e NÃO aparecem na listagem — nem o `solicitacao_id` nem os ids de
 * paciente/usuário saem do servidor para o navegador além do necessário para desenhar a
 * tela e montar a próxima chamada.
 *
 * VIS-012: os `if (!ativa) return` da versão imperativa desapareceram — `ilha()` desmonta
 * a raiz React e os efeitos são cancelados por construção.
 *
 * O que NÃO mudou, de propósito:
 *
 * - O registro de solicitação só existe quando a tela está dentro de um caso
 *   (`opcoes.pacienteId`): escolher o paciente num campo de texto livre seria convite a
 *   registrar no caso errado.
 * - Responder grava `versao_esperada`; conflito de versão recarrega em vez de sobrescrever.
 * - `aria-busy` da lista é REMOVIDO (não posto como `"false"`) quando a consulta termina —
 *   é o gancho que a prova de leitura recusada já usa.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type {
  MedidaSolicitacaoTitular,
  SolicitacaoTitular,
  TipoSolicitacaoTitular,
} from '../packages/contracts/src/solicitacao-titular.ts';
import { Botao } from './componentes/ui/botao.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import { Formulario, valorDe } from './telas/formulario.js';
import type { ServicoSolicitacaoTitular } from './servico-solicitacao-titular-http.js';

const formatadorData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

const TIPOS: Record<TipoSolicitacaoTitular, string> = {
  acesso: 'Acesso aos próprios dados',
  correcao: 'Correção de dados',
  portabilidade: 'Portabilidade',
  exclusao: 'Exclusão',
};

const MEDIDAS: Record<MedidaSolicitacaoTitular, string> = {
  atendida: 'Atendida',
  atendida_parcialmente: 'Atendida em parte',
  recusada: 'Não atendida',
};

function dataLegivel(iso: string): string {
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? iso : formatadorData.format(instante);
}

/** O código de erro de domínio, quando houver — o mesmo padrão lido pela versão
 *  imperativa: `erro.codigo`, sem assumir que todo erro é `FalhaApi`. */
function codigoErro(erro: unknown): string {
  return erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
}

type Opcoes = {
  pacienteId?: string;
  nomeDoPaciente?: (pacienteId: string) => string | undefined;
};

function ItemSolicitacao({
  item,
  somenteDoCaso,
  nomeDoPaciente,
  servico,
  aoResponder,
}: {
  item: SolicitacaoTitular;
  somenteDoCaso: boolean;
  nomeDoPaciente?: (pacienteId: string) => string | undefined;
  servico: ServicoSolicitacaoTitular;
  aoResponder: () => void;
}) {
  const [enviando, definirEnviando] = useState(false);
  const [aviso, definirAviso] = useState('');
  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;

  function enviar(formulario: HTMLFormElement) {
    if (enviando) return;
    const resposta = valorDe(formulario, 'resposta').trim();
    if (!resposta) {
      definirAviso('Escreva a resposta antes de registrar.');
      formulario.querySelector('textarea')?.focus();
      return;
    }
    const medida = valorDe(formulario, 'medida') as MedidaSolicitacaoTitular;
    flushSync(() => {
      definirEnviando(true);
      definirAviso('Registrando…');
    });
    servicoAtual.current
      .responder({
        solicitacao_id: item.solicitacao_id,
        paciente_id: item.paciente_id,
        medida,
        resposta,
        versao_esperada: item.versao,
      })
      .then(() => aoResponder())
      .catch((erro: unknown) => {
        const codigo = codigoErro(erro);
        flushSync(() => {
          definirEnviando(false);
          definirAviso(
            codigo === 'conflito_versao'
              ? 'Alguém respondeu esta solicitação enquanto você escrevia. Recarregue para ver.'
              : codigo === 'sem_permissao'
                ? 'Sua conta não pode responder solicitações.'
                : 'Não foi possível registrar a resposta. Tente de novo.',
          );
        });
      });
  }

  const quem = nomeDoPaciente?.(item.paciente_id);
  const partes = [`Recebida em ${dataLegivel(item.recebida_em)}`];
  if (quem && !somenteDoCaso) partes.push(quem);
  if (item.estado === 'respondida' && item.medida && item.respondida_em)
    partes.push(`${MEDIDAS[item.medida]} em ${dataLegivel(item.respondida_em)}`);
  else partes.push('Sem resposta registrada');

  return (
    <article className={`solicitacoes-titular__item solicitacoes-titular__item--${item.estado}`}>
      <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
        {TIPOS[item.tipo]}
      </h3>
      <p className="solicitacoes-titular__meta m-0 text-(length:--texto-1) text-texto-suave">
        {partes.join(' · ')}
      </p>
      {item.estado === 'recebida' ? (
        <Formulario
          aoEnviar={enviar}
          noValidate
          className="solicitacoes-titular__resposta grid min-w-0 gap-3"
        >
          <SelecaoSimples
            id={`solicitacao-medida-${item.solicitacao_id}`}
            name="medida"
            rotulo="Medida adotada"
            classeEnvelope="mb-0"
          >
            {Object.entries(MEDIDAS).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </SelecaoSimples>
          <AreaTexto
            id={`solicitacao-resposta-${item.solicitacao_id}`}
            name="resposta"
            rotulo="Resposta dada e, se houver guarda, o motivo dela"
            linhas={3}
            maxLength={4_000}
            classeEnvelope="mb-0"
          />
          <div>
            <Botao
              peso="principal"
              tipo="submit"
              disabled={enviando}
              aria-busy={enviando || undefined}
            >
              Registrar resposta
            </Botao>
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já usam. */}
          <p
            role="status"
            aria-live="polite"
            className="m-0 text-(length:--texto-1) text-texto-suave empty:hidden"
          >
            {aviso}
          </p>
        </Formulario>
      ) : null}
    </article>
  );
}

function TelaSolicitacoesTitular({
  servico,
  opcoes,
}: {
  servico: ServicoSolicitacaoTitular;
  opcoes: Opcoes;
}) {
  const [status, definirStatus] = useState('Carregando solicitações…');
  const [itens, definirItens] = useState<readonly SolicitacaoTitular[]>([]);
  const [carregandoLista, definirCarregandoLista] = useState(true);
  const [temAnterior, definirTemAnterior] = useState(false);
  const [proximoCursor, definirProximoCursor] = useState<string | null>(null);
  const [registroEnviando, definirRegistroEnviando] = useState(false);
  const [registroAviso, definirRegistroAviso] = useState('');

  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;
  const cursorAtualRef = useRef<string | undefined>(undefined);
  const pilhaAnterioresRef = useRef<(string | undefined)[]>([]);

  const carregar = useCallback(
    async (cursor?: string): Promise<void> => {
      flushSync(() => {
        definirStatus('Carregando solicitações…');
        definirCarregandoLista(true);
      });
      try {
        const pagina = await servicoAtual.current.listar({
          limite: 25,
          ...(cursor ? { cursor } : {}),
          ...(opcoes.pacienteId ? { paciente_id: opcoes.pacienteId } : {}),
        });
        flushSync(() => {
          definirItens(pagina.itens);
          definirStatus(
            pagina.itens.length === 0 ? 'Nenhuma solicitação registrada até agora.' : '',
          );
          definirProximoCursor(pagina.proximo_cursor);
          definirTemAnterior(pilhaAnterioresRef.current.length > 0);
          definirCarregandoLista(false);
        });
      } catch (erro) {
        flushSync(() => {
          definirItens([]);
          definirProximoCursor(null);
          definirStatus(
            codigoErro(erro) === 'sem_permissao'
              ? 'Sua conta não pode ver as solicitações sobre dados pessoais.'
              : 'Não foi possível carregar as solicitações. Tente de novo.',
          );
          definirTemAnterior(pilhaAnterioresRef.current.length > 0);
          definirCarregandoLista(false);
        });
      }
    },
    [opcoes.pacienteId],
  );

  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  useEffect(() => {
    void carregarRef.current(undefined);
  }, []);

  function avancar() {
    if (carregandoLista || proximoCursor === null) return;
    pilhaAnterioresRef.current.push(cursorAtualRef.current);
    cursorAtualRef.current = proximoCursor;
    void carregar(proximoCursor);
  }

  function voltar() {
    if (carregandoLista || pilhaAnterioresRef.current.length === 0) return;
    cursorAtualRef.current = pilhaAnterioresRef.current.pop();
    void carregar(cursorAtualRef.current);
  }

  function enviarRegistro(formulario: HTMLFormElement) {
    const pacienteId = opcoes.pacienteId;
    if (!pacienteId || registroEnviando) return;
    const descricao = valorDe(formulario, 'descricao').trim();
    if (!descricao) {
      definirRegistroAviso('Descreva o pedido antes de registrar.');
      formulario.querySelector('textarea')?.focus();
      return;
    }
    const tipo = valorDe(formulario, 'tipo') as TipoSolicitacaoTitular;
    flushSync(() => {
      definirRegistroEnviando(true);
      definirRegistroAviso('Registrando…');
    });
    servicoAtual.current
      .registrar({
        paciente_id: pacienteId,
        tipo,
        descricao,
        recebida_em: new Date().toISOString(),
      })
      .then(() => {
        const campo = formulario.querySelector<HTMLTextAreaElement>('textarea[name="descricao"]');
        if (campo) campo.value = '';
        pilhaAnterioresRef.current = [];
        cursorAtualRef.current = undefined;
        flushSync(() => {
          definirRegistroAviso('Solicitação registrada.');
          definirRegistroEnviando(false);
          definirTemAnterior(false);
        });
        void carregarRef.current(undefined);
      })
      .catch((erro: unknown) => {
        flushSync(() => {
          definirRegistroEnviando(false);
          definirRegistroAviso(
            codigoErro(erro) === 'sem_permissao'
              ? 'Sua conta não pode registrar solicitações.'
              : 'Não foi possível registrar. Tente de novo.',
          );
        });
      });
  }

  return (
    <section className="solicitacoes-titular grid min-w-0 gap-5">
      <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
        Solicitações sobre dados pessoais
      </h2>
      <p className="solicitacoes-titular__explicacao m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
        Registre aqui quando alguém pedir acesso, correção, portabilidade ou exclusão dos próprios
        dados, e registre a resposta dada. Responder um pedido de exclusão não apaga registros: a
        resposta informa a medida adotada e, quando houver guarda necessária, o motivo dela.
      </p>

      {opcoes.pacienteId ? (
        <Formulario
          aoEnviar={enviarRegistro}
          noValidate
          className="solicitacoes-titular__registro grid min-w-0 max-w-[480px] gap-3"
        >
          <SelecaoSimples
            id="solicitacao-tipo"
            name="tipo"
            rotulo="O que foi pedido"
            classeEnvelope="mb-0"
          >
            {Object.entries(TIPOS).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </SelecaoSimples>
          <AreaTexto
            id="solicitacao-descricao"
            name="descricao"
            rotulo="Como o pedido chegou e o que foi pedido"
            linhas={3}
            maxLength={4_000}
            classeEnvelope="mb-0"
          />
          <div>
            <Botao
              peso="principal"
              tipo="submit"
              disabled={registroEnviando}
              aria-busy={registroEnviando || undefined}
            >
              Registrar solicitação
            </Botao>
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já usam. */}
          <p
            role="status"
            aria-live="polite"
            className="solicitacoes-titular__aviso m-0 text-(length:--texto-1) text-texto-suave empty:hidden"
          >
            {registroAviso}
          </p>
        </Formulario>
      ) : null}

      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as telas e as provas já usam. */}
      <p
        role="status"
        aria-live="polite"
        className="solicitacoes-titular__status m-0 text-(length:--texto-1) text-texto-suave"
      >
        {status}
      </p>

      <div
        className="solicitacoes-titular__lista grid min-w-0 gap-3"
        aria-busy={carregandoLista || undefined}
      >
        {itens.map((item) => (
          <ItemSolicitacao
            key={item.solicitacao_id}
            item={item}
            somenteDoCaso={Boolean(opcoes.pacienteId)}
            nomeDoPaciente={opcoes.nomeDoPaciente}
            servico={servico}
            aoResponder={() => void carregarRef.current(cursorAtualRef.current)}
          />
        ))}
      </div>

      <div className="solicitacoes-titular__paginacao flex gap-3">
        <Botao peso="secundario" disabled={carregandoLista || !temAnterior} aoAtivar={voltar}>
          Página anterior
        </Botao>
        <Botao
          peso="secundario"
          disabled={carregandoLista || proximoCursor === null}
          aoAtivar={avancar}
        >
          Próxima página
        </Botao>
      </div>
    </section>
  );
}

/** Solicitações do titular: acesso, correção, portabilidade e exclusão (FR-040).
 *
 * Registrar e responder. Responder NÃO apaga dado nenhum — grava a medida adotada e o
 * fundamento. É o que o requisito pede: "revogar consentimento não significa apagar
 * automaticamente todos os registros", e uma eventual guarda precisa de fundamento
 * registrado.
 *
 * A tela mostra tipo, data, estado e medida. O texto do pedido e o da resposta ficam
 * cifrados no banco e não aparecem na listagem. */
export function montarSolicitacoesTitular(
  raiz: HTMLElement,
  servico: ServicoSolicitacaoTitular,
  opcoes: Opcoes = {},
): () => void {
  return ilha(raiz, <TelaSolicitacoesTitular servico={servico} opcoes={opcoes} />);
}
