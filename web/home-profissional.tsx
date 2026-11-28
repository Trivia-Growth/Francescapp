import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { FiltrosCarteira, PacienteLista } from '../packages/contracts/src/cadastro.js';
import { avisoSinalOperacional } from '../packages/contracts/src/pendencia.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { Botao, classesBotao } from './componentes/ui/botao.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { EstadoErro } from './componentes/ui/estado-erro.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { ListaRotulada } from './componentes/ui/tabela.js';
import { hashFicha } from './ficha-paciente.js';

export type PaginaCarteira = {
  itens: PacienteLista[];
  proximo_cursor: string | null;
};

export type ServicoHome = {
  listar(filtros?: FiltrosCarteira): Promise<PaginaCarteira>;
};

function nomeVisivel(paciente: PacienteLista): string {
  return paciente.nome_preferencia ?? paciente.nome;
}

/** Plural em português sem recorrer a "(s)", que lê mal em voz alta. */
function frase(quantidade: number, singular: string, plural: string): string {
  return quantidade === 1 ? singular : plural.replace('{n}', String(quantidade));
}

/** O link leva direto à aba que resolve o motivo, inclusive ao abrir em outra guia. */
function LinkCaso({ paciente }: { paciente: PacienteLista }) {
  const motivos = paciente.sinal?.motivos ?? [];
  return (
    <a
      className="flex min-h-alvo-toque min-w-0 items-center justify-between gap-sistema-3 rounded-sistema-controle text-sistema-texto no-underline hover:bg-sistema-hoje focus-visible:outline-sistema-foco focus-visible:[outline-width:var(--espessura-foco)] focus-visible:[outline-offset:var(--recuo-foco)]"
      href={hashFicha(paciente.id, 'pendencias')}
    >
      <div className="grid min-w-0 gap-sistema-1 wrap-anywhere">
        <span className="text-item">{nomeVisivel(paciente)}</span>
        {motivos.length ? (
          <ul className="m-0 grid list-none gap-sistema-1 p-0 text-meta text-sistema-texto-secundario">
            {motivos.map((motivo) => (
              <li key={motivo}>{motivo}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-sistema-acao" />
    </a>
  );
}

function CasosDoDia({
  pacientes,
  rotulo,
  aviso,
}: {
  pacientes: readonly PacienteLista[];
  rotulo: string;
  aviso: string;
}) {
  return (
    <div className="min-w-0 rounded-superficie bg-sistema-superficie px-sistema-4 pt-sistema-4 shadow-cartao lateral:px-sistema-5 lateral:pt-sistema-5">
      <p className="m-0 max-w-texto text-corpo text-sistema-texto-secundario">{aviso}</p>
      <ListaRotulada
        itens={pacientes}
        rotulo={rotulo}
        chave={(paciente) => paciente.id}
        colunas={[{ titulo: 'Pessoa', celula: (paciente) => <LinkCaso paciente={paciente} /> }]}
      />
    </div>
  );
}

function SecaoDoDia({
  id,
  titulo,
  nivel,
  children,
}: {
  id: string;
  titulo: string;
  nivel: 1 | 2;
  children: ReactNode;
}) {
  const Subtitulo = nivel === 2 ? 'h3' : 'h2';
  return (
    <section className="grid min-w-0 gap-sistema-3" aria-labelledby={id} data-bloco={titulo}>
      <Subtitulo id={id} className="m-0 font-serifada text-secao">
        {titulo}
      </Subtitulo>
      {children}
    </section>
  );
}

function BlocoFalha({ erro, repetir }: { erro: unknown; repetir: () => void }) {
  return (
    <EstadoErro
      titulo="Esta leitura não foi carregada."
      texto={mensagemFalha(erro)}
      acao={
        <Botao peso="secundario" aoAtivar={repetir}>
          Tentar novamente
        </Botao>
      }
    />
  );
}

/** Home do profissional: responde "o que precisa de mim agora?".
 *
 * Três decisões que são regra, não estilo:
 *
 * - **Só entra o que tem fonte.** Nada de bloco vazio anunciando o que ainda não existe.
 *   A tela é montada do sinal operacional da carteira, que é a única agregação entre casos
 *   que o servidor oferece hoje. Agenda, documentos e transcrição ficam de fora porque não
 *   há dado — não porque não caberiam.
 * - **A autorização é a da carteira.** Cada chamada é a mesma consulta que a lista de
 *   pessoas faz, com o mesmo recorte por `acesso_paciente`. A home não soma nada que o
 *   servidor não tenha devolvido, então nenhuma contagem revela caso que a pessoa não vê.
 * - **O sinal nunca vira leitura clínica.** O aviso de FR-028 acompanha a seção que mostra
 *   o estado, como em toda outra superfície que o exibe.
 *
 * Uma fonte que falha degrada o próprio bloco e mantém o resto da tela de pé.
 *
 * VIS-012: a guarda de geração descarta a resposta de uma leitura anterior ou de uma
 * tela que saiu da casca. */
export function TelaHomeProfissional({
  servico,
  acessoPerdido,
  nivelTitulo = 1,
}: {
  servico: ServicoHome;
  acessoPerdido: (erro: unknown) => void;
  nivelTitulo?: 1 | 2;
}) {
  const [carregando, definirCarregando] = useState(true);
  const [atencao, definirAtencao] = useState<PromiseSettledResult<PaginaCarteira> | null>(null);
  const [todos, definirTodos] = useState<PromiseSettledResult<PaginaCarteira> | null>(null);
  const [descartada, definirDescartada] = useState(false);

  const idAtencao = useId();
  const idSemAcordo = useId();
  const idTodosFalha = useId();

  const geracaoRef = useRef(0);
  const ativaRef = useRef(true);
  useEffect(
    () => () => {
      ativaRef.current = false;
    },
    [],
  );

  const servicoRef = useRef(servico);
  servicoRef.current = servico;
  const acessoPerdidoRef = useRef(acessoPerdido);
  acessoPerdidoRef.current = acessoPerdido;

  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    flushSync(() => definirDescartada(true));
    acessoPerdidoRef.current(erro);
    return true;
  }, []);

  const carregar = useCallback(async (): Promise<void> => {
    geracaoRef.current += 1;
    const numero = geracaoRef.current;
    definirCarregando(true);
    definirAtencao(null);
    definirTodos(null);

    // As duas leituras são a mesma consulta da carteira, com recortes diferentes. Elas
    // seguem em paralelo e são tratadas separadamente: uma falhar não derruba a outra.
    const [resultadoAtencao, resultadoTodos] = await Promise.allSettled([
      servicoRef.current.listar({ pendencia: 'abertas' }),
      servicoRef.current.listar(),
    ]);
    if (!ativaRef.current || numero !== geracaoRef.current) return;

    for (const resultado of [resultadoAtencao, resultadoTodos])
      if (resultado.status === 'rejected' && descartarAcesso(resultado.reason)) return;

    flushSync(() => {
      definirCarregando(false);
      definirAtencao(resultadoAtencao);
      definirTodos(resultadoTodos);
    });
  }, [descartarAcesso]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (descartada) return null;

  let saudacao = 'Carregando seu dia…';
  let apoio = '';
  const blocos: ReactNode[] = [];

  if (!carregando && atencao && todos) {
    if (atencao.status === 'fulfilled') {
      const casos = atencao.value.itens;
      const parcial = atencao.value.proximo_cursor !== null;
      if (casos.length === 0) {
        saudacao = 'Nada precisa de você agora';
        // A agenda não é lida aqui: afirmar que "os compromissos estão em dia" seria uma
        // conclusão sem fonte. O que esta leitura sabe é só a ausência de pendência na carteira.
        blocos.push(
          <EstadoVazio
            key="sereno"
            titulo="Nenhum caso com pendência aberta no seu acesso."
            texto="Quando algo precisar de atenção, aparece aqui primeiro, com o motivo e o caminho direto para o caso."
          />,
        );
      } else {
        saudacao = frase(casos.length, 'Um caso precisa de você', '{n} casos precisam de você');
        apoio = parcial
          ? 'Os primeiros da fila; abra a lista completa para ver o restante.'
          : 'Em ordem de chegada, com o motivo de cada um.';
        blocos.push(
          <SecaoDoDia
            key="atencao"
            id={idAtencao}
            titulo="Precisa de você agora"
            nivel={nivelTitulo}
          >
            <CasosDoDia
              pacientes={casos}
              aviso={avisoSinalOperacional}
              rotulo="Casos que precisam de atenção"
            />
          </SecaoDoDia>,
        );
      }
    } else {
      saudacao = 'Seu dia';
      blocos.push(
        <SecaoDoDia
          key="atencao-falha"
          id={idAtencao}
          titulo="Precisa de você agora"
          nivel={nivelTitulo}
        >
          <BlocoFalha erro={atencao.reason} repetir={() => void carregar()} />
        </SecaoDoDia>,
      );
    }

    if (todos.status === 'fulfilled') {
      const semAcordo = todos.value.itens.filter(
        (caso) => caso.sinal?.estado === 'informacao_insuficiente',
      );
      if (semAcordo.length > 0) {
        blocos.push(
          <SecaoDoDia
            key="semacordo"
            id={idSemAcordo}
            titulo="Esperando combinar"
            nivel={nivelTitulo}
          >
            <CasosDoDia
              pacientes={semAcordo}
              aviso="Sem periodicidade acordada o acompanhamento não consegue apontar pendência — ausência de aviso aqui não é sinal de que está tudo bem."
              rotulo="Casos sem periodicidade acordada"
            />
          </SecaoDoDia>,
        );
      }
      const total = todos.value.itens.length;
      const parcialTodos = todos.value.proximo_cursor !== null;
      const contagem = parcialTodos
        ? `Você acompanha mais de ${total} ${frase(total, 'pessoa', 'pessoas')}.`
        : `Você acompanha ${total} ${frase(total, 'pessoa', 'pessoas')}.`;
      blocos.push(
        <div
          key="rodape"
          className="flex flex-wrap items-center justify-between gap-sistema-2 border-t border-sistema-divisor pt-sistema-3"
        >
          <p className="m-0 text-corpo text-sistema-texto-secundario">{contagem}</p>
          <a className={classesBotao({ peso: 'discreto' })} href="#carteira">
            Ver a lista completa
          </a>
        </div>,
      );
    } else {
      blocos.push(
        <SecaoDoDia
          key="todos-falha"
          id={idTodosFalha}
          titulo="Suas pessoas acompanhadas"
          nivel={nivelTitulo}
        >
          <BlocoFalha erro={todos.reason} repetir={() => void carregar()} />
        </SecaoDoDia>,
      );
    }
  }

  const Titulo = nivelTitulo === 2 ? 'h2' : 'h1';
  return (
    <section className="grid min-w-0 gap-sistema-6" aria-labelledby="home-saudacao">
      <header className="grid gap-sistema-2">
        <Titulo
          id="home-saudacao"
          className="m-0 font-serifada text-pagina lateral:text-pagina-desktop"
          tabIndex={-1}
        >
          {saudacao}
        </Titulo>
        {apoio ? (
          <p className="m-0 max-w-texto text-corpo text-sistema-texto-secundario">{apoio}</p>
        ) : null}
      </header>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que a região viva já usa; repetir aqui o texto do título faria o leitor de tela dizer duas vezes a mesma coisa. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {carregando ? 'Carregando o resumo do seu dia.' : 'Resumo do dia atualizado.'}
      </p>
      <Esqueleto ocupado={carregando} className="grid gap-sistema-6">
        {blocos}
      </Esqueleto>
    </section>
  );
}
