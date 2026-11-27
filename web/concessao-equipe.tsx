/* Área Administração › Equipe, reconstruída em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarConcessaoEquipe(raiz, api) => desmontar`. Quem
 * chama — `web/main.ts` — não sabe que aqui dentro é React, e não precisou de uma linha.
 *
 * O que a migração entrega, além do visual:
 *
 * 1. VIS-012. A versão imperativa tinha SETE `if (!ativa) return` e mais cinco `if (ativa)`
 *    protegendo escritas em DOM já desmontado — vigilância humana sobre um problema que o
 *    ciclo de vida resolve por construção. `ilha()` desmonta a raiz React, os efeitos são
 *    cancelados e escrever estado depois disso não faz nada. Não sobrou nenhuma.
 *    O único ponto em que o ciclo de vida NÃO basta está anotado em `perguntar()`.
 * 2. VIS-016. A listagem era um `<ul>` montado à mão: uma linha com conteúdo inesperado
 *    derrubava a lista inteira, que foi o que aconteceu em 24/11/2026. a lista tem
 *    barreira por linha, e os rótulos de perfil e estado passaram a RECUSAR valor
 *    desconhecido em vez de desenhar vazio — assim a degradação é daquele registro, e os
 *    demais continuam legíveis.
 * 3. "Superfície plana" do `DESIGN.md`, que é a resposta à queixa de 24/11/2026 sobre
 *    "uma caixa solta": uma superfície só, a lista, sem caixa dentro de caixa.
 *
 * Fatia 7 do plano visual (27/11/2026): a conferência e o formulário de convite saíram
 * daqui para a página própria `web/convidar-equipe.tsx`. Esta tela é só leitura.
 *
 * O que NÃO mudou, de propósito (VIS-018): a lista, os rótulos que recusam valor
 * desconhecido e a barreira por linha.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClienteFFCM } from './api.js';
import { Botao, classesBotao } from './componentes/ui/botao.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { EstadoErro } from './componentes/ui/estado-erro.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { type ColunaTabela, ListaRotulada, Tabela } from './componentes/ui/tabela.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { Superficie } from './componentes/ui/superficie.js';
import './estilos/tema.css';
import { ilhaSincrona } from './telas/ilha-sincrona.js';

type ItemEquipe = Awaited<ReturnType<ClienteFFCM['listarProfissionais']>>['itens'][number];

const perfisEquipe: Record<string, string> = {
  profissional: 'Profissional',
  administrador: 'Administrador',
};
const estadosEquipe: Record<string, string> = {
  pendente: 'Convite pendente',
  vinculada: 'Acesso ativo',
  revogada: 'Acesso revogado',
};

/** Traduz um valor do servidor e RECUSA o que não conhece.
 *
 *  Devolver vazio para um valor inesperado é pior do que falhar: a linha fica com uma
 *  coluna em branco e ninguém descobre que o servidor passou a mandar outra coisa. Aqui o
 *  erro é contido pela barreira de linha da tabela e da lista, degrada aquele registro e deixa os
 *  outros legíveis (VIS-016). */
function traduzir(mapa: Record<string, string>, chave: string, campo: string): string {
  const texto = mapa[chave];
  if (texto === undefined) throw new Error(`Valor desconhecido em ${campo}.`);
  return texto;
}

const colunasEquipe = {
  pessoa: { titulo: 'Pessoa', largura: 'w-2/5', celula: (item) => item.email },
  perfil: {
    titulo: 'Perfil',
    largura: 'w-1/5',
    celula: (item) => traduzir(perfisEquipe, item.perfil, 'perfil'),
  },
  conta: {
    titulo: 'Conta',
    largura: 'w-[18%]',
    celula: (item) => (item.ativo === false ? 'Conta desativada' : 'Conta ativa'),
  },
  estado: {
    titulo: 'Estado',
    largura: 'w-[22%]',
    celula: (item) => <MarcaEstado>{traduzir(estadosEquipe, item.estado, 'estado')}</MarcaEstado>,
  },
} satisfies Record<string, ColunaTabela<ItemEquipe>>;

const { pessoa, perfil, conta, estado } = colunasEquipe;
const colunasTabela = [pessoa, perfil, conta, estado];
const camposLista = [pessoa, perfil, estado, conta];
const tituloRegistros = 'Pessoas com acesso concedido';

/** O indicador de ação em curso que `iniciarAcao` acrescentava ao botão. A mensagem
 *  acessível continua no `role="status"` da tela; isto é só a pintura. */
function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

function TelaConcessaoEquipe({ api }: { api: ClienteFFCM }) {
  const [itens, definirItens] = useState<readonly ItemEquipe[]>([]);
  const itensRef = useRef<readonly ItemEquipe[]>([]);
  // A tela nasce consultando: declarar "já em curso" mantém a primeira pintura honesta.
  const [statusLista, definirStatusLista] = useState('Carregando a equipe…');
  const [erroLista, definirErroLista] = useState(false);
  const [carregandoLista, definirCarregandoLista] = useState(true);
  const [temMais, definirTemMais] = useState(false);
  const consultandoListaRef = useRef(false);
  const cursorListaRef = useRef<string | undefined>(undefined);

  const carregarLista = useCallback(
    async (continuar = false): Promise<void> => {
      if (consultandoListaRef.current) return;
      consultandoListaRef.current = true;
      definirCarregandoLista(true);
      definirErroLista(false);
      if (!continuar) {
        cursorListaRef.current = undefined;
        itensRef.current = [];
        definirItens([]);
      }
      definirStatusLista('Carregando a equipe…');
      try {
        const pagina = await api.listarProfissionais(
          continuar ? cursorListaRef.current : undefined,
        );
        const todos = continuar ? [...itensRef.current, ...pagina.itens] : [...pagina.itens];
        itensRef.current = todos;
        definirItens(todos);
        // O vazio é desenhado por `EstadoVazio`; repetir a frase aqui a poria duas vezes
        // na tela e duas vezes na leitura.
        definirStatusLista(todos.length ? `${todos.length} pessoas com acesso concedido.` : '');
        cursorListaRef.current = pagina.proximo_cursor ?? undefined;
        definirTemMais(Boolean(cursorListaRef.current));
      } catch {
        // A frase inteira vive em `EstadoErro`, que tem `role="alert"`: deixá-la também
        // no `role="status"` faria o leitor de tela anunciar duas vezes.
        definirStatusLista('');
        definirErroLista(true);
      } finally {
        definirCarregandoLista(false);
        consultandoListaRef.current = false;
      }
    },
    [api],
  );

  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  function conteudoDaLista() {
    if (erroLista)
      return (
        <EstadoErro
          titulo="Não foi possível carregar a equipe."
          texto="Tente atualizar a lista."
          acao={
            <Botao peso="secundario" aoAtivar={() => void carregarLista()}>
              Atualizar lista
            </Botao>
          }
        />
      );
    if (itens.length)
      return (
        <div className="@container/equipe min-w-0">
          <ListaRotulada
            itens={itens}
            colunas={camposLista}
            chave={(item) => item.id}
            rotulo={tituloRegistros}
            className="@tabela/equipe:hidden"
          />
          <Tabela
            itens={itens}
            colunas={colunasTabela}
            chave={(item) => item.id}
            rotulo={tituloRegistros}
            className="hidden @tabela/equipe:table"
          />
        </div>
      );
    if (carregandoLista) return null;
    return (
      <EstadoVazio
        titulo="Nenhum acesso concedido ainda"
        texto="Use a área “Convidar alguém” para dar o primeiro acesso."
      />
    );
  }

  return (
    <div className="grid gap-6">
      <Superficie
        titulo="Equipe"
        descricao="Quem já tem acesso ao sistema. Conceder e revogar continua sendo decidido no servidor."
        acao={
          <div className="flex flex-wrap gap-2">
            {/* Convidar é página própria (fatia 7): o link só navega; quem concede é o servidor. */}
            <a
              href="#administracao/convidar-equipe"
              className={classesBotao({ peso: 'principal' })}
            >
              Convidar alguém
            </a>
            <Botao
              peso="secundario"
              disabled={carregandoLista}
              aria-busy={carregandoLista || undefined}
              aoAtivar={() => void carregarLista()}
            >
              Atualizar lista
              {carregandoLista ? <Indicador /> : null}
            </Botao>
          </div>
        }
      >
        <div className="grid gap-4">
          <output className="m-0 text-(length:--texto-1) text-texto-suave block" aria-live="polite">
            {statusLista}
          </output>
          <Esqueleto ocupado={carregandoLista}>{conteudoDaLista()}</Esqueleto>
          {temMais ? (
            <div className="flex justify-end">
              <Botao
                peso="secundario"
                disabled={carregandoLista}
                aoAtivar={() => void carregarLista(true)}
              >
                Carregar mais
              </Botao>
            </div>
          ) : null}
        </div>
      </Superficie>
    </div>
  );
}

/** Preparação isolada: não montar até existir capacidade e recuperação entre sessões
 *  comprovadas. */
export function montarConcessaoEquipe(raiz: HTMLElement, api: ClienteFFCM): () => void {
  return ilhaSincrona(raiz, <TelaConcessaoEquipe api={api} />);
}
