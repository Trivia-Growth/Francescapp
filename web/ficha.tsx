import { ArrowLeft, ChevronDown } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactElement,
  type Ref,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { rotulosSituacao } from './acompanhamento-caso.js';
import { CLASSES_ABA } from './componentes/ui/abas.js';
import { Botao, classesBotao } from './componentes/ui/botao.js';
import { juntar } from './componentes/ui/juntar.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { iniciais, type Ficha, type OpcoesFicha, type SecaoFicha } from './ficha-paciente.js';
import { LimiteErroPainel } from './limite-erro-painel.js';

const classeAbaFicha = juntar(
  CLASSES_ABA,
  'max-w-full min-h-alvo-toque gap-sistema-2 px-sistema-3 py-sistema-2 whitespace-normal wrap-anywhere text-controle',
);

const rotulosAtalhos: Readonly<Record<string, string>> = {
  diario: 'Novo relato',
  tarefas: 'Nova tarefa',
  plano: 'Novo objetivo',
};
const descartePadrao =
  'Há alterações não confirmadas. Ao sair, elas serão descartadas. Deseja continuar?';

type Conteudo = {
  secao: SecaoFicha;
  geracao: number;
  fase: 'pronta' | 'carregando' | 'falha';
  tela?: ReactElement;
};

const disponivel = (secao: SecaoFicha) => Boolean(secao.compor);
type EstadoFicha = {
  ativa: boolean;
  atual: SecaoFicha | null;
  pendente: boolean;
  geracao: number;
  vazia: boolean;
};

export function secaoInicialDaFicha(
  secoes: readonly SecaoFicha[],
  preferida?: string,
): string | undefined {
  return (secoes.find((secao) => secao.id === preferida) ?? secoes[0])?.id;
}

export function TelaFicha({
  paciente,
  secoes,
  primarias,
  nivelTitulo = 1,
  confirmar,
  aoSelecionar,
  aoVoltar,
  comando,
}: OpcoesFicha & { comando: Ref<Ficha> }) {
  const [selecionada, definirSelecionada] = useState('');
  const [abaFocavel, definirAbaFocavel] = useState('');
  const [conteudo, definirConteudo] = useState<Conteudo | null>(null);
  const estado = useRef<EstadoFicha>({
    ativa: true,
    atual: null,
    pendente: false,
    geracao: 0,
    vazia: true,
  }).current;
  const titulo = useRef<HTMLHeadingElement>(null);
  const mais = useRef<HTMLDetailsElement>(null);
  const botoes = useRef(new Map<string, HTMLButtonElement>()).current;
  const porId = new Map(secoes.map((secao) => [secao.id, secao]));
  const primariosEncontrados = (primarias ?? [])
    .map((id) => porId.get(id))
    .filter((secao): secao is SecaoFicha => secao !== undefined);
  const grupoPrimario = primariosEncontrados.length ? primariosEncontrados : secoes;
  const secundarias = secoes.filter((secao) => !grupoPrimario.includes(secao));
  const atalhos = secoes
    .filter((secao) => rotulosAtalhos[secao.id] && disponivel(secao))
    .slice(0, 2);
  const Titulo = nivelTitulo === 2 ? 'h2' : 'h1';
  const mensagemAtual = () => estado.atual?.descarte ?? descartePadrao;

  const descartar = useCallback(() => {
    estado.geracao += 1;
    estado.pendente = false;
    estado.vazia = true;
  }, [estado]);

  useLayoutEffect(() => {
    estado.ativa = true;
    return () => {
      estado.ativa = false;
      descartar();
    };
  }, [estado, descartar]);

  function montarConteudo(secao: SecaoFicha) {
    const geracao = ++estado.geracao;
    estado.vazia = false;
    const mostrar = (fase: Conteudo['fase'], geracaoDoNo = geracao, tela?: ReactElement) => {
      flushSync(() =>
        definirConteudo({ secao, geracao: geracaoDoNo, fase, ...(tela ? { tela } : {}) }),
      );
    };
    mostrar(secao.compor ? 'carregando' : 'pronta');
    const estaAtiva = () => estado.ativa && estado.geracao === geracao;
    const falhar = () => {
      if (estaAtiva()) mostrar('falha', ++estado.geracao);
    };
    const aoAlterarPendencia = (pendente: boolean) => {
      if (estaAtiva()) estado.pendente = pendente;
    };
    if (!secao.compor) return;
    try {
      void secao.compor(aoAlterarPendencia).then((tela) => {
        if (estaAtiva()) mostrar('pronta', geracao, tela);
      }, falhar);
    } catch {
      falhar();
    }
  }

  async function selecionar(id: string, { confirmar: perguntar = true } = {}) {
    const secao = porId.get(id);
    if (!estado.ativa || !secao) return false;
    if (estado.atual?.id === id) return true;
    if (perguntar && estado.pendente && !(await confirmar(mensagemAtual()))) return false;
    if (!estado.ativa || estado.atual?.id === id) return false;
    descartar();
    estado.atual = secao;
    const secundaria = secundarias.includes(secao);
    flushSync(() => {
      definirSelecionada(id);
      definirAbaFocavel(secundaria ? (grupoPrimario[0]?.id ?? '') : id);
    });
    if (mais.current) mais.current.open = secundaria;
    botoes.get(id)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    montarConteudo(secao);
    aoSelecionar(id);
    return true;
  }

  useImperativeHandle(comando, () => ({
    secaoAtual: () => estado.atual?.id ?? '',
    pendencia: () =>
      estado.atual && estado.pendente
        ? { secao: estado.atual.id, mensagem: mensagemAtual() }
        : null,
    selecionar,
    limparSecao() {
      descartar();
      flushSync(() => definirConteudo(null));
    },
    remontarSecao() {
      if (estado.ativa && estado.atual && estado.vazia) montarConteudo(estado.atual);
    },
    secaoVazia: () => estado.vazia,
    focarTitulo: () => titulo.current?.focus(),
    desmontar() {
      estado.ativa = false;
      descartar();
    },
  }));

  function moverFoco(evento: KeyboardEvent<HTMLDivElement>) {
    const ordem = grupoPrimario.map(({ id }) => botoes.get(id));
    const foco = ordem.findIndex((botao) => botao === document.activeElement);
    if (foco < 0) return;
    let indice: number;
    switch (evento.key) {
      case 'ArrowRight':
        indice = (foco + 1) % ordem.length;
        break;
      case 'ArrowLeft':
        indice = (foco - 1 + ordem.length) % ordem.length;
        break;
      case 'Home':
        indice = 0;
        break;
      case 'End':
        indice = ordem.length - 1;
        break;
      default:
        return;
    }
    evento.preventDefault();
    const proximo = ordem[indice];
    const secao = grupoPrimario[indice];
    if (proximo && secao) {
      flushSync(() => definirAbaFocavel(secao.id));
      proximo.focus();
    }
  }

  function aba(secao: SecaoFicha, secundaria: boolean) {
    const ativa = selecionada === secao.id;
    return (
      <button
        type="button"
        key={secao.id}
        id={`ficha-aba-${secao.id}`}
        className={classeAbaFicha}
        aria-controls="ficha-painel"
        role={secundaria ? undefined : 'tab'}
        aria-current={secundaria ? ativa : undefined}
        aria-selected={secundaria ? undefined : ativa}
        tabIndex={secundaria ? undefined : abaFocavel === secao.id ? 0 : -1}
        ref={(botao) => {
          if (botao) botoes.set(secao.id, botao);
          else botoes.delete(secao.id);
        }}
        onClick={() =>
          void selecionar(secao.id).then((mudou) => {
            if (!mudou && estado.atual) botoes.get(estado.atual.id)?.focus();
          })
        }
      >
        {secao.rotulo}
        {disponivel(secao) ? null : (
          <>
            {' '}
            <MarcaEstado tom="suave">em breve</MarcaEstado>
          </>
        )}
      </button>
    );
  }

  return (
    <>
      <header className="mb-sistema-5 grid min-w-0 gap-sistema-3">
        <Botao
          id="ficha-voltar"
          className="max-w-full justify-self-start"
          peso="discreto"
          aoAtivar={() => {
            void (async () => {
              if (estado.pendente && !(await confirmar(mensagemAtual()))) return;
              if (estado.ativa) aoVoltar();
            })();
          }}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Voltar para a lista
        </Botao>
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-sistema-3 lateral:grid-cols-[auto_minmax(0,1fr)_minmax(0,auto)]">
          <span
            className="inline-grid size-10 place-items-center rounded-avatar bg-sistema-hoje text-meta font-semibold text-sistema-acao lateral:size-14 lateral:text-item"
            aria-hidden="true"
          >
            {iniciais(paciente.nome)}
          </span>
          <div className="grid min-w-0 gap-sistema-1">
            <Titulo
              id="ficha-title"
              className="m-0 wrap-anywhere font-sans text-secao"
              ref={titulo}
              tabIndex={-1}
            >
              {paciente.nome}
            </Titulo>
            <p className="m-0 wrap-anywhere text-corpo text-sistema-texto-secundario">
              {paciente.nome_preferencia
                ? `Nome de preferência: ${paciente.nome_preferencia}`
                : 'Nome de preferência não informado'}
            </p>
            {paciente.situacao ? (
              <MarcaEstado
                className="mt-sistema-1 justify-self-start"
                data-situacao={paciente.situacao}
              >
                {rotulosSituacao[paciente.situacao]}
              </MarcaEstado>
            ) : null}
          </div>
          {atalhos.length ? (
            <div className="col-span-full flex min-w-0 flex-wrap gap-sistema-2 lateral:col-span-1">
              {atalhos.map((secao) => (
                <Botao key={secao.id} peso="secundario" aoAtivar={() => void selecionar(secao.id)}>
                  {rotulosAtalhos[secao.id]}
                </Botao>
              ))}
            </div>
          ) : null}
        </div>
      </header>
      <div
        className="flex min-w-0 flex-wrap gap-x-sistema-1 border-b border-sistema-divisor"
        role="tablist"
        aria-label="Seções da ficha"
        onKeyDown={moverFoco}
      >
        {grupoPrimario.map((secao) => aba(secao, false))}
      </div>
      {secundarias.length ? (
        <details
          id="ficha-mais-secoes"
          className="group border-b border-sistema-divisor"
          ref={mais}
        >
          <summary
            className={classesBotao({
              peso: 'discreto',
              className: 'my-sistema-1 list-none [&::-webkit-details-marker]:hidden',
            })}
          >
            Mais seções
            <ChevronDown aria-hidden="true" size={16} className="shrink-0 group-open:rotate-180" />
          </summary>
          <div className="flex min-w-0 flex-wrap gap-x-sistema-1 pb-sistema-3">
            {secundarias.map((secao) => aba(secao, true))}
          </div>
        </details>
      ) : null}
      <div
        className="min-w-0 pt-sistema-5 pb-sistema-2 focus-visible:[outline-offset:var(--recuo-foco)] lateral:pt-sistema-6"
        id="ficha-painel"
        role="tabpanel"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a área rolável deve receber foco.
        tabIndex={0}
        aria-labelledby={selecionada ? `ficha-aba-${selecionada}` : undefined}
      >
        {conteudo ? (
          <div
            key={conteudo.geracao}
            className="ficha-secao"
            data-secao={conteudo.secao.id}
            aria-busy={conteudo.fase === 'carregando' || undefined}
          >
            {conteudo.fase === 'falha' ? (
              <p data-tone="error">Não foi possível abrir esta seção. Tente novamente.</p>
            ) : conteudo.tela ? (
              <LimiteErroPainel
                aoFalhar={() => {
                  if (estado.geracao === conteudo.geracao) {
                    estado.geracao += 1;
                    estado.pendente = false;
                  }
                }}
                aoTentarNovamente={() => {
                  if (estado.atual?.id !== conteudo.secao.id) return;
                  descartar();
                  montarConteudo(conteudo.secao);
                }}
              >
                {conteudo.tela}
              </LimiteErroPainel>
            ) : disponivel(conteudo.secao) ? null : (
              <>
                <h2>{conteudo.secao.rotulo}: em breve</h2>
                <p>
                  Esta seção ainda não está disponível nesta versão. Nada foi registrado nem enviado
                  aqui.
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
