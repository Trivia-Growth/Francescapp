import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { FiltrosCarteira, PacienteLista } from '../packages/contracts/src/cadastro.js';
import { avisoSinalOperacional } from '../packages/contracts/src/pendencia.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { Botao } from './componentes/ui/botao.js';
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

/** Linha de um caso que pede atenção.
 *
 * O destino do link é a aba que resolve o motivo, não a ficha genérica: quem abre a home
 * entre dois atendimentos não deveria precisar caçar a aba certa depois de clicar. */
function LinhaCaso({ paciente, secao }: { paciente: PacienteLista; secao: string }) {
  const motivos = paciente.sinal?.motivos ?? [];
  return (
    <li className="home-caso">
      <a className="home-caso-link" href={hashFicha(paciente.id, secao)}>
        <span className="home-caso-nome">{nomeVisivel(paciente)}</span>
        {motivos.length > 0 ? (
          <ul className="home-caso-motivos">
            {motivos.map((motivo) => (
              <li key={motivo}>{motivo}</li>
            ))}
          </ul>
        ) : null}
        <span className="home-caso-seta" aria-hidden="true" />
      </a>
    </li>
  );
}

function BlocoFalha({ erro, repetir }: { erro: unknown; repetir: () => void }) {
  return (
    <div className="home-falha">
      <p data-tone="error">{`${mensagemFalha(erro)} Esta leitura não foi carregada.`}</p>
      <Botao peso="secundario" aoAtivar={repetir}>
        Tentar novamente
      </Botao>
    </div>
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
        apoio = 'Nenhum caso com pendência aberta no seu acesso.';
        blocos.push(
          <div key="sereno" className="home-sereno">
            <p>
              Quando algo precisar de atenção, aparece aqui primeiro, com o motivo e o caminho
              direto para o caso.
            </p>
          </div>,
        );
      } else {
        saudacao = frase(casos.length, 'Um caso precisa de você', '{n} casos precisam de você');
        apoio = parcial
          ? 'Os primeiros da fila; abra a lista completa para ver o restante.'
          : 'Em ordem de chegada, com o motivo de cada um.';
        blocos.push(
          <section
            key="atencao"
            className="home-bloco"
            aria-labelledby={idAtencao}
            data-bloco="Precisa de você agora"
          >
            <h2 id={idAtencao} className="home-bloco-titulo">
              Precisa de você agora
            </h2>
            <p className="home-aviso">{avisoSinalOperacional}</p>
            <div className="home-bloco-corpo">
              <ul className="home-lista">
                {casos.map((paciente) => (
                  <LinhaCaso key={paciente.id} paciente={paciente} secao="pendencias" />
                ))}
              </ul>
            </div>
          </section>,
        );
      }
    } else {
      saudacao = 'Seu dia';
      apoio = '';
      blocos.push(
        <section
          key="atencao-falha"
          className="home-bloco"
          aria-labelledby={idAtencao}
          data-bloco="Precisa de você agora"
        >
          <h2 id={idAtencao} className="home-bloco-titulo">
            Precisa de você agora
          </h2>
          <div className="home-bloco-corpo">
            <BlocoFalha erro={atencao.reason} repetir={() => void carregar()} />
          </div>
        </section>,
      );
    }

    if (todos.status === 'fulfilled') {
      const semAcordo = todos.value.itens.filter(
        (caso) => caso.sinal?.estado === 'informacao_insuficiente',
      );
      if (semAcordo.length > 0) {
        blocos.push(
          <section
            key="semacordo"
            className="home-bloco"
            aria-labelledby={idSemAcordo}
            data-bloco="Esperando combinar"
          >
            <h2 id={idSemAcordo} className="home-bloco-titulo">
              Esperando combinar
            </h2>
            <p className="home-aviso">
              Sem periodicidade acordada o acompanhamento não consegue apontar pendência — ausência
              de aviso aqui não é sinal de que está tudo bem.
            </p>
            <div className="home-bloco-corpo">
              <ul className="home-lista">
                {semAcordo.map((paciente) => (
                  <LinhaCaso key={paciente.id} paciente={paciente} secao="pendencias" />
                ))}
              </ul>
            </div>
          </section>,
        );
      }
      const total = todos.value.itens.length;
      const parcialTodos = todos.value.proximo_cursor !== null;
      const contagem = parcialTodos
        ? `Você acompanha mais de ${total} ${frase(total, 'pessoa', 'pessoas')}.`
        : `Você acompanha ${total} ${frase(total, 'pessoa', 'pessoas')}.`;
      blocos.push(
        <p key="rodape" className="home-rodape">
          {`${contagem} `}
          <a className="home-rodape-link" href="#carteira">
            Ver a lista completa
          </a>
        </p>,
      );
    } else {
      blocos.push(
        <section
          key="todos-falha"
          className="home-bloco"
          aria-labelledby={idTodosFalha}
          data-bloco="Suas pessoas acompanhadas"
        >
          <h2 id={idTodosFalha} className="home-bloco-titulo">
            Suas pessoas acompanhadas
          </h2>
          <div className="home-bloco-corpo">
            <BlocoFalha erro={todos.reason} repetir={() => void carregar()} />
          </div>
        </section>,
      );
    }
  }

  const Titulo = nivelTitulo === 2 ? 'h2' : 'h1';
  return (
    <section className="home" aria-labelledby="home-saudacao">
      <header className="home-cabecalho">
        <Titulo id="home-saudacao" className="home-saudacao" tabIndex={-1}>
          {saudacao}
        </Titulo>
        <p className="home-apoio">{apoio}</p>
      </header>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que a região viva já usa; repetir aqui o texto do título faria o leitor de tela dizer duas vezes a mesma coisa. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {carregando ? 'Carregando o resumo do seu dia.' : 'Resumo do dia atualizado.'}
      </p>
      <div className="home-corpo" aria-busy={carregando || undefined}>
        {carregando ? (
          <div className="list-loading" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : (
          blocos
        )}
      </div>
    </section>
  );
}
