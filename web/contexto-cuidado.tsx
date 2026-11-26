/* Contexto do cuidado (FR-005), reconstruído em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * Migrado junto com `rede-cuidado.tsx` e o hospedeiro `editor-documento-paciente.ts`: os
 * três formavam um conjunto host/corpo em DOM imperativo, e migrar um corpo sem o
 * hospedeiro deixaria o hospedeiro por baixo — trabalho negativo. O hospedeiro virou um
 * HOOK (`usarEditorDocumentoPaciente`) que concentra só a máquina de consulta/salvamento;
 * cada tela passou a ser um componente autocontido, como `anamnese.tsx` e
 * `acessos-administracao.tsx`.
 *
 * O que NÃO mudou (VIS-018): as seis categorias do requisito e seus rótulos/ajuda, o
 * vínculo opcional com objetivos do plano (sem conceder acesso), a preservação de vínculos
 * cujo objetivo não tem caixa na tela (arquivado, de outra página, ou lista não carregada),
 * a paginação de objetivos com guarda de cursor repetido, a recusa de elemento em branco,
 * e o aviso de conflito de versão sem perder o rascunho.
 *
 * Classes CSS preservadas como estavam (`contexto-cuidado`, `contexto-cuidado__item`,
 * `ui-botao`, `list-loading`, `loading-indicator`): esta tela usa o sistema visual antigo
 * de `web/ui/basicos.ts` (não o `componentes/ui` em Tailwind), e trocar o sistema seria
 * mudança de apresentação fora do pedido.
 *
 * Os campos continuam NÃO controlados — o DOM é quem tem o valor — pela mesma razão de
 * `anamnese.tsx`: `coletar()` lê o formulário no envio, e os testes atribuem `.value` e
 * `.checked` crus antes de disparar `submit`. */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  CATEGORIAS_CONTEXTO,
  type CategoriaContexto,
  type ElementoContexto,
} from '../packages/contracts/src/contexto-cuidado.js';
import { mensagemFalha } from './api.js';
import {
  type ColetaEditorDocumento,
  usarEditorDocumentoPaciente,
} from './editor-documento-paciente.js';
import { ilha } from './ponte/ilha.js';
import type { ServicoDocumentoPaciente } from './servico-documento-paciente-http.js';
import { Formulario } from './telas/formulario.js';

/** FR-005: rótulos em português do usuário, na ordem em que o requisito os lista. */
const ROTULOS: Record<CategoriaContexto, string> = {
  rotina: 'Rotina',
  recursos: 'Recursos',
  barreiras: 'Barreiras',
  preferencias: 'Preferências',
  pontos_fortes: 'Pontos fortes',
  importante_para_paciente: 'O que o paciente considera importante',
};

const AJUDA: Record<CategoriaContexto, string> = {
  rotina: 'Como são os dias do paciente: horários, hábitos e compromissos fixos.',
  recursos: 'O que já apoia o cuidado: pessoas, serviços, benefícios, equipamentos.',
  barreiras: 'O que dificulta o cuidado: distância, custo, falta de apoio, saúde.',
  preferencias: 'Como o paciente prefere ser cuidado, abordado e informado.',
  pontos_fortes: 'Capacidades e qualidades do paciente que o cuidado pode usar.',
  importante_para_paciente: 'O que o próprio paciente diz que mais importa para ele.',
};

export type ObjetivoDisponivel = { id: string; titulo: string };
export type ConsultaObjetivosContexto = (
  pacienteId: string,
  cursor?: string,
) => Promise<{ itens: ObjetivoDisponivel[]; proximo_cursor: string | null }>;
export type ServicoContextoCuidado = ServicoDocumentoPaciente<ElementoContexto[]>;

function idCampo(id: string): string {
  return `contexto-${id}`;
}

function EsqueletoCompacto() {
  return (
    <div className="list-loading" data-compacto="" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function IndicadorAcao() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

type LinhaLocal = {
  id: string;
  categoria: CategoriaContexto;
  descricaoInicial: string;
  objetivosOriginais: readonly string[];
};

function LinhaContexto({
  linha,
  disponiveis,
  aoRemover,
}: {
  linha: LinhaLocal;
  disponiveis: ReadonlyMap<string, ObjetivoDisponivel>;
  aoRemover: () => void;
}) {
  const [nomeAtual, definirNomeAtual] = useState(linha.descricaoInicial);
  const exibidos = [...disponiveis.values()];
  const preservados = linha.objetivosOriginais.filter((id) => !disponiveis.has(id));
  return (
    <li className="contexto-cuidado__item">
      <label htmlFor={idCampo(linha.id)}>Descrição</label>
      <textarea
        id={idCampo(linha.id)}
        rows={3}
        maxLength={2000}
        defaultValue={linha.descricaoInicial}
        placeholder={AJUDA[linha.categoria]}
        onInput={(evento) => definirNomeAtual(evento.currentTarget.value)}
      />
      <fieldset className="contexto-cuidado__objetivos" hidden={exibidos.length === 0}>
        <legend>Objetivos do plano relacionados</legend>
        {exibidos.map((objetivo) => (
          <label key={objetivo.id}>
            <input
              type="checkbox"
              data-linha={linha.id}
              value={objetivo.id}
              defaultChecked={linha.objetivosOriginais.includes(objetivo.id)}
            />{' '}
            {objetivo.titulo}
          </label>
        ))}
      </fieldset>
      <p hidden={preservados.length === 0}>
        {preservados.length
          ? `${preservados.length} objetivo(s) vinculado(s) fora desta lista continuam guardados.`
          : ''}
      </p>
      <button
        type="button"
        className="ui-botao"
        data-peso="discreto"
        aria-label={`Remover de ${ROTULOS[linha.categoria].toLowerCase()}: ${
          nomeAtual.trim() || 'elemento em branco'
        }`}
        onClick={aoRemover}
      >
        Remover
      </button>
    </li>
  );
}

export type RefCorpoDocumento<T> = { coletar(): ColetaEditorDocumento<T> };

type PropsCorpoContextoCuidado = {
  conteudo: ElementoContexto[] | null;
  objetivosIniciais: readonly ObjetivoDisponivel[];
  consultarObjetivos?: ConsultaObjetivosContexto;
  pacienteId: string;
  bloqueado: boolean;
  aoAlterar: () => void;
  descartarAcesso: (erro: unknown) => boolean;
};

const CorpoContextoCuidado = forwardRef<
  RefCorpoDocumento<ElementoContexto[]>,
  PropsCorpoContextoCuidado
>(function CorpoContextoCuidado(
  {
    conteudo,
    objetivosIniciais,
    consultarObjetivos,
    pacienteId,
    bloqueado,
    aoAlterar,
    descartarAcesso,
  },
  ref,
) {
  const [linhas, definirLinhas] = useState<LinhaLocal[]>(() =>
    (conteudo ?? []).map((item) => ({
      id: item.id,
      categoria: item.categoria,
      descricaoInicial: item.descricao,
      objetivosOriginais: item.objetivos,
    })),
  );
  const [disponiveis, definirDisponiveis] = useState<Map<string, ObjetivoDisponivel>>(
    () => new Map(objetivosIniciais.map((objetivo) => [objetivo.id, objetivo])),
  );
  const [avisoObjetivos, definirAvisoObjetivos] = useState('Carregando objetivos do plano…');
  const [carregarMaisVisivel, definirCarregarMaisVisivel] = useState(false);
  const [carregarMaisTexto, definirCarregarMaisTexto] = useState('Carregar mais objetivos');
  const [carregandoObjetivos, definirCarregandoObjetivos] = useState(false);
  const cursorRef = useRef<string | undefined>(undefined);
  const terminouRef = useRef(false);
  const cursoresRef = useRef<Set<string>>(new Set());
  const carregandoRef = useRef(false);
  const envelope = useRef<HTMLDivElement>(null);
  const focoPendenteRef = useRef<string | null>(null);

  const carregarObjetivos = useCallback(async () => {
    if (!consultarObjetivos || carregandoRef.current || terminouRef.current) return;
    carregandoRef.current = true;
    definirCarregandoObjetivos(true);
    definirAvisoObjetivos('Carregando objetivos do plano…');
    try {
      const pagina = await consultarObjetivos(pacienteId, cursorRef.current);
      if (
        pagina.proximo_cursor &&
        (pagina.proximo_cursor === cursorRef.current ||
          cursoresRef.current.has(pagina.proximo_cursor))
      )
        throw new Error('Cursor repetido.');
      let tamanhoFinal = 0;
      flushSync(() => {
        definirDisponiveis((atual) => {
          const proximo = new Map(atual);
          for (const item of pagina.itens) proximo.set(item.id, item);
          tamanhoFinal = proximo.size;
          return proximo;
        });
      });
      if (cursorRef.current) cursoresRef.current.add(cursorRef.current);
      cursorRef.current = pagina.proximo_cursor ?? undefined;
      terminouRef.current = !cursorRef.current;
      flushSync(() => {
        definirCarregarMaisTexto('Carregar mais objetivos');
        definirCarregarMaisVisivel(!terminouRef.current);
        definirAvisoObjetivos(
          tamanhoFinal
            ? `${tamanhoFinal} objetivo(s) do plano disponível(is) para vínculo.`
            : 'Nenhum objetivo disponível no plano deste caso.',
        );
      });
    } catch (erro) {
      if (descartarAcesso(erro)) return;
      flushSync(() => {
        definirAvisoObjetivos(
          'Não foi possível carregar os objetivos. Seus vínculos anteriores continuam guardados.',
        );
        definirCarregarMaisTexto('Tentar carregar objetivos novamente');
        definirCarregarMaisVisivel(true);
      });
    } finally {
      carregandoRef.current = false;
      flushSync(() => definirCarregandoObjetivos(false));
    }
  }, [consultarObjetivos, pacienteId, descartarAcesso]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: roda só na montagem deste corpo — cada versão nova é uma montagem nova, via `key={geracao}` no chamador.
  useEffect(() => {
    if (consultarObjetivos) void carregarObjetivos();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      coletar: (): ColetaEditorDocumento<ElementoContexto[]> => {
        const resultado: ElementoContexto[] = [];
        for (const linha of linhas) {
          const campo = envelope.current?.querySelector<HTMLTextAreaElement>(
            `[id="${idCampo(linha.id)}"]`,
          );
          const descricao = campo?.value.trim() ?? '';
          if (!descricao)
            return {
              aviso: 'Preencha ou remova os elementos em branco.',
              foco: campo ?? undefined,
            };
          const caixas = [
            ...(envelope.current?.querySelectorAll<HTMLInputElement>(
              `input[type="checkbox"][data-linha="${linha.id}"]`,
            ) ?? []),
          ];
          const marcados = caixas.filter((caixa) => caixa.checked).map((caixa) => caixa.value);
          const vistos = new Set(caixas.map((caixa) => caixa.value));
          const preservados = linha.objetivosOriginais.filter((id) => !vistos.has(id));
          resultado.push({
            id: linha.id,
            categoria: linha.categoria,
            descricao,
            objetivos: [...marcados, ...preservados],
          });
        }
        return { conteudo: resultado };
      },
    }),
    [linhas],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `linhas` não é lida no corpo — é o GATILHO: depois de cada pintura em que a lista de linhas muda, o foco pendente (se houver) é aplicado ao nó recém-montado.
  useEffect(() => {
    const pendente = focoPendenteRef.current;
    if (!pendente) return;
    focoPendenteRef.current = null;
    envelope.current?.querySelector<HTMLTextAreaElement>(`[id="${idCampo(pendente)}"]`)?.focus();
  }, [linhas]);

  const adicionar = (categoria: CategoriaContexto) => {
    const id = crypto.randomUUID();
    focoPendenteRef.current = id;
    flushSync(() => {
      definirLinhas((atuais) => [
        ...atuais,
        { id, categoria, descricaoInicial: '', objetivosOriginais: [] },
      ]);
    });
    aoAlterar();
  };

  const remover = (id: string) => {
    flushSync(() => {
      definirLinhas((atuais) => atuais.filter((linha) => linha.id !== id));
    });
    aoAlterar();
  };

  return (
    <div
      ref={envelope}
      className="contexto-cuidado"
      inert={bloqueado || undefined}
      onInput={aoAlterar}
      onChange={aoAlterar}
    >
      {consultarObjetivos ? (
        <div>
          {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` no `<p>` é o gancho que a tela já usa. */}
          <p role="status" aria-live="polite">
            {avisoObjetivos}
          </p>
          <button
            type="button"
            className="ui-botao"
            data-peso="secundario"
            hidden={!carregarMaisVisivel}
            disabled={carregandoObjetivos}
            onClick={() => void carregarObjetivos()}
          >
            {carregarMaisTexto}
          </button>
        </div>
      ) : null}
      {CATEGORIAS_CONTEXTO.map((categoria) => {
        const linhasCategoria = linhas.filter((linha) => linha.categoria === categoria);
        return (
          <fieldset key={categoria} className="contexto-cuidado__bloco">
            <legend>{ROTULOS[categoria]}</legend>
            <p>{AJUDA[categoria]}</p>
            <ul className="contexto-cuidado__lista">
              {linhasCategoria.map((linha) => (
                <LinhaContexto
                  key={linha.id}
                  linha={linha}
                  disponiveis={disponiveis}
                  aoRemover={() => remover(linha.id)}
                />
              ))}
            </ul>
            <button
              type="button"
              className="ui-botao"
              data-peso="secundario"
              disabled={bloqueado}
              onClick={() => adicionar(categoria)}
            >
              {`Adicionar em ${ROTULOS[categoria].toLowerCase()}`}
            </button>
          </fieldset>
        );
      })}
    </div>
  );
});

function TelaContextoCuidado({
  pacienteId,
  servico,
  acessoPerdido,
  alteracaoPendente,
  objetivosIniciais,
  consultarObjetivos,
}: {
  pacienteId: string;
  servico: ServicoContextoCuidado;
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
  objetivosIniciais: readonly ObjetivoDisponivel[];
  consultarObjetivos?: ConsultaObjetivosContexto;
}) {
  const editor = usarEditorDocumentoPaciente<ElementoContexto[]>(
    pacienteId,
    servico,
    acessoPerdido,
    alteracaoPendente,
    {
      carregando: 'Carregando contexto do cuidado…',
      salvando: 'Salvando contexto do cuidado…',
      salvo: 'Contexto do cuidado salvo.',
      conflito:
        'O contexto foi alterado por outra pessoa. Copie seu rascunho antes de recarregar a página para consultar a versão atual; suas alterações ainda não foram salvas.',
    },
  );
  const corpoRef = useRef<RefCorpoDocumento<ElementoContexto[]>>(null);

  if (editor.descartada) return null;

  if (editor.consulta.fase === 'carregando')
    return (
      <>
        {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
        <p role="status">Carregando contexto do cuidado…</p>
        <div aria-busy="true">
          <EsqueletoCompacto />
        </div>
      </>
    );

  if (editor.consulta.fase === 'erro')
    return (
      <>
        {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
        <p role="status">{mensagemFalha(editor.consulta.erro)}</p>
        <button
          type="button"
          className="ui-botao"
          data-peso="secundario"
          onClick={editor.tentarNovamenteConsulta}
        >
          Tentar novamente
        </button>
      </>
    );

  const travado = editor.temPendente || editor.enviando;
  const vazio = !(editor.consulta.conteudo ?? []).length;

  return (
    <Formulario
      aoEnviar={(_formulario) => {
        if (editor.temPendente || editor.conflitoVersao) return;
        const coletado = corpoRef.current?.coletar();
        if (coletado) editor.enviarColetado(coletado);
      }}
      noValidate
    >
      <h2>Contexto do cuidado</h2>
      {vazio ? <p>Nenhum elemento registrado ainda. Use “Adicionar” em cada bloco.</p> : null}
      <CorpoContextoCuidado
        key={editor.geracao}
        ref={corpoRef}
        conteudo={editor.consulta.conteudo}
        objetivosIniciais={objetivosIniciais}
        consultarObjetivos={consultarObjetivos}
        pacienteId={pacienteId}
        bloqueado={travado}
        aoAlterar={() => alteracaoPendente(true)}
        descartarAcesso={editor.descartarAcesso}
      />
      {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
      <p role="status" aria-live="polite" data-tone={editor.conflitoVersao ? 'error' : undefined}>
        {editor.aviso}
      </p>
      <button
        type="submit"
        className="ui-botao"
        data-peso="principal"
        disabled={travado || editor.conflitoVersao}
      >
        Salvar contexto
        {editor.enviando && !editor.retryVisivel ? <IndicadorAcao /> : null}
      </button>
      {editor.retryVisivel ? (
        <button
          type="button"
          className="ui-botao"
          data-peso="secundario"
          disabled={editor.enviando}
          onClick={editor.confirmarRetry}
        >
          Tentar confirmar salvamento
          {editor.enviando ? <IndicadorAcao /> : null}
        </button>
      ) : null}
    </Formulario>
  );
}

/** Interface isolada; montagem depende da integração segura do servidor. */
export function montarContextoCuidado(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoContextoCuidado,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
  objetivos: readonly ObjetivoDisponivel[] = [],
  consultarObjetivos?: ConsultaObjetivosContexto,
): () => void {
  return ilha(
    raiz,
    <TelaContextoCuidado
      pacienteId={pacienteId}
      servico={servico}
      acessoPerdido={acessoPerdido}
      alteracaoPendente={alteracaoPendente}
      objetivosIniciais={objetivos}
      consultarObjetivos={consultarObjetivos}
    />,
  );
}
