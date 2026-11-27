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
 *    derrubava a lista inteira, que foi o que aconteceu em 24/11/2026. `Lista` tem
 *    barreira por linha, e os rótulos de perfil e estado passaram a RECUSAR valor
 *    desconhecido em vez de desenhar vazio — assim a degradação é daquele registro, e os
 *    demais continuam legíveis.
 * 3. "Superfície plana" do `DESIGN.md`, que é a resposta à queixa de 24/11/2026 sobre
 *    "uma caixa solta": duas superfícies, uma por assunto — quem já tem acesso, e o
 *    convite —, separadas por espaço e filete, sem caixa dentro de caixa.
 *
 * O que NÃO mudou, de propósito (VIS-018): o protocolo de barreira de
 * `web/ciclo-concessao-equipe.ts` (reservar, confirmar, reconhecer) é consumido exatamente
 * como antes; a revalidação de identidade continua dentro do ciclo; a confirmação continua
 * sendo `web/confirmacao.ts`, com os mesmos textos; e nenhuma mensagem de estado mudou de
 * palavra.
 */
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { criarConcessaoEquipeSchema } from '../packages/contracts/src/index.js';
import type { ClienteFFCM } from './api.js';
import { criarCicloConcessaoEquipe } from './ciclo-concessao-equipe.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { EstadoErro } from './componentes/ui/estado-erro.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { type Coluna, Lista } from './componentes/ui/lista.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import { Superficie } from './componentes/ui/superficie.js';
import { confirmar, type PedidoConfirmacao } from './confirmacao.js';
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
 *  erro é contido pela barreira de linha de `Lista`, degrada aquele registro e deixa os
 *  outros legíveis (VIS-016). */
function traduzir(mapa: Record<string, string>, chave: string, campo: string): string {
  const texto = mapa[chave];
  if (texto === undefined) throw new Error(`Valor desconhecido em ${campo}.`);
  return texto;
}

const colunasEquipe: ReadonlyArray<Coluna<ItemEquipe>> = [
  { titulo: 'Pessoa', celula: (item) => item.email },
  { titulo: 'Perfil', celula: (item) => traduzir(perfisEquipe, item.perfil, 'perfil') },
  {
    titulo: 'Conta',
    secundaria: true,
    celula: (item) => (item.ativo === false ? 'Conta desativada' : 'Conta ativa'),
  },
  {
    titulo: 'Estado',
    celula: (item) => <MarcaEstado>{traduzir(estadosEquipe, item.estado, 'estado')}</MarcaEstado>,
  },
];

/** O indicador de ação em curso que `iniciarAcao` acrescentava ao botão. A mensagem
 *  acessível continua no `role="status"` da tela; isto é só a pintura. */
function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

function TelaConcessaoEquipe({ api }: { api: ClienteFFCM }) {
  /* A tela nasce consultando: o efeito abaixo dispara a conferência e a listagem na
     montagem. Declarar o estado inicial como "já em curso" é o que mantém a primeira
     pintura honesta — a alternativa seria um instante de tela em branco antes de o efeito
     contar o que está acontecendo (VIS-014). */
  const [status, definirStatus] = useState('Conferindo se há algum convite aguardando resposta…');
  const [itens, definirItens] = useState<readonly ItemEquipe[]>([]);
  const itensRef = useRef<readonly ItemEquipe[]>([]);
  const [statusLista, definirStatusLista] = useState('Carregando a equipe…');
  const [erroLista, definirErroLista] = useState(false);
  const [carregandoLista, definirCarregandoLista] = useState(true);
  const [temMais, definirTemMais] = useState(false);

  /* Estado que decisões SÍNCRONAS leem no meio de um fluxo assíncrono — reentrância de
     clique, por exemplo — mora em ref e é espelhado para a renderização. Ler o `useState`
     nessas posições devolveria o valor do render anterior. */
  const ocupadaRef = useRef(false);
  const [ocupada, marcarOcupada] = useState(false);
  const definirOcupada = useCallback((valor: boolean) => {
    ocupadaRef.current = valor;
    marcarOcupada(valor);
  }, []);
  const liberadaRef = useRef(false);
  const [liberada, marcarLiberada] = useState(false);
  const definirLiberada = useCallback((valor: boolean) => {
    liberadaRef.current = valor;
    marcarLiberada(valor);
  }, []);

  const consultandoListaRef = useRef(false);
  const cursorListaRef = useRef<string | undefined>(undefined);

  /* Um controlador por montagem. O efeito o aborta ao desmontar, e o botão "Conferir
     novamente" reaproveita o mesmo sinal: uma conferência pedida à mão também precisa
     parar de perguntar quando a tela sai. */
  const controladorRef = useRef<AbortController | null>(null);
  controladorRef.current ??= new AbortController();

  const cicloRef = useRef<ReturnType<typeof criarCicloConcessaoEquipe> | null>(null);
  cicloRef.current ??= criarCicloConcessaoEquipe({
    identidadeAtual: () => api.identidadeAtual(),
    consultar: () => api.consultarBarreiraEquipe(),
    reservar: async (entrada) => (await api.reservarBarreiraEquipe(entrada)).estado,
    criar: ({ entrada, chave, reserva_id, geracao_reserva }) =>
      api.criarConcessaoEquipe(entrada, chave, { reserva_id, geracao_reserva }),
    encerrar: async (entrada) => (await api.encerrarBarreiraEquipe(entrada)).estado,
    reconhecer: async (entrada) => (await api.reconhecerBarreiraEquipe(entrada)).estado,
  });
  const ciclo = cicloRef.current;

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

  /** A confirmação é um `<dialog>` montado no documento por `web/confirmacao.ts`, FORA da
   *  ilha: desmontar a raiz React não a alcança. É o único ponto desta tela em que o
   *  ciclo de vida não basta, e por isso o sinal do efeito entra aqui — e só aqui, em vez
   *  de uma bandeira conferida antes de cada escrita. Sem isto, sair da tela durante a
   *  conferência faria uma pergunta aparecer sobre a tela seguinte, levando o foco para
   *  fora dela (VIS-012). Sinal abortado responde como "não confere", que é o caminho que
   *  abandona a conferência sem tocar no servidor. */
  const perguntar = useCallback(
    (sinal: AbortSignal, pedido: PedidoConfirmacao): Promise<boolean> =>
      sinal.aborted ? Promise.resolve(false) : confirmar(pedido),
    [],
  );

  const recuperar = useCallback(
    async (sinal: AbortSignal): Promise<void> => {
      if (ocupadaRef.current) return;
      definirOcupada(true);
      definirLiberada(false);
      definirStatus('Conferindo se há algum convite aguardando resposta…');
      try {
        let estado = await ciclo.consultar();
        if (!estado.resultado_pendente) {
          if (
            estado.reserva &&
            !(await perguntar(sinal, {
              titulo: 'Encerrar a operação em andamento?',
              detalhe:
                'A operação pode estar aberta em outra aba. Encerrá-la afeta todas as abas desta pessoa.',
              acao: 'Encerrar a operação',
              cancelar: 'Deixar como está',
            }))
          )
            throw new Error();
          await ciclo.encerrar();
          estado = await ciclo.consultar();
        }
        if (estado.resultado_pendente) {
          const resultado = estado.resultado_pendente;
          if (resultado.resultado === 'confirmada') {
            let cursor: string | undefined;
            const vistos = new Set<string>();
            let encontrada: ItemEquipe | undefined;
            do {
              const pagina = await api.listarProfissionais(cursor);
              encontrada = pagina.itens.find(
                (item) => item.id.toLowerCase() === resultado.concessao_id?.toLowerCase(),
              );
              cursor = pagina.proximo_cursor ?? undefined;
              if (cursor && vistos.has(cursor)) throw new Error();
              if (cursor) vistos.add(cursor);
            } while (!encontrada && cursor);
            if (
              !encontrada ||
              !(await perguntar(sinal, {
                titulo: `O convite enviado antes para ${encontrada.email} está ${encontrada.estado}, como ${encontrada.perfil}. Confere?`,
                detalhe:
                  'Confirmar encerra a conferência e libera novos convites. Cancelar mantém a tela conferindo.',
                acao: 'Confere, pode seguir',
                cancelar: 'Não confere',
              }))
            )
              throw new Error();
          }
          await ciclo.reconhecer();
          estado = await ciclo.consultar();
        }
        ciclo.liberar();
        definirLiberada(true);
        definirStatus('Tudo conferido. Você já pode convidar alguém da equipe.');
      } catch {
        definirStatus('Não foi possível concluir a conferência. Tente de novo antes de continuar.');
      } finally {
        definirOcupada(false);
      }
    },
    [api, ciclo, perguntar, definirOcupada, definirLiberada],
  );

  useEffect(() => {
    const controlador = controladorRef.current;
    if (!controlador) return;
    void recuperar(controlador.signal);
    void carregarLista();
    return () => controlador.abort();
  }, [recuperar, carregarLista]);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!liberadaRef.current || ocupadaRef.current) return;
    const preenchido = new FormData(evento.currentTarget);
    const texto = (campo: string) => String(preenchido.get(campo) ?? '');
    const validacao = criarConcessaoEquipeSchema.safeParse({
      email: texto('email'),
      perfil: texto('perfil'),
      metodo: 'google_workspace',
      motivo: texto('motivo'),
    });
    if (!validacao.success) {
      definirStatus('Confira e-mail, perfil e motivo.');
      return;
    }
    const formulario = evento.currentTarget;
    definirOcupada(true);
    definirLiberada(false);
    definirStatus('Enviando…');
    void ciclo
      .criar(validacao.data)
      .then((resultado) => {
        formulario.reset();
        const estados = { pendente: 'Pendente', vinculada: 'Vinculada', revogada: 'Revogada' };
        const perfis = { profissional: 'Profissional', administrador: 'Administrador' };
        definirStatus(
          `Convite ${estados[resultado.estado].toLocaleLowerCase('pt-BR')} para ${perfis[resultado.perfil].toLocaleLowerCase('pt-BR')}. Confira antes de continuar.`,
        );
      })
      .catch(() => {
        definirStatus(
          'Não deu para saber se o convite foi registrado. Confira antes de continuar.',
        );
      })
      .finally(() => definirOcupada(false));
  }

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
        <Lista
          itens={itens}
          colunas={colunasEquipe}
          chave={(item) => item.id}
          rotulo="Pessoas com acesso concedido"
          carregando={carregandoLista}
          // Já está dentro de uma `Superficie`: a segunda moldura seria caixa dentro de caixa.
          moldura={false}
        />
      );
    if (carregandoLista) return null;
    return (
      <EstadoVazio
        titulo="Nenhum acesso concedido ainda"
        texto="Convide alguém da equipe no formulário abaixo."
      />
    );
  }

  return (
    <div className="grid gap-6">
      <Superficie
        titulo="Equipe"
        descricao="Quem já tem acesso ao sistema. Conceder e revogar continua sendo decidido no servidor."
        acao={
          <Botao
            peso="secundario"
            disabled={carregandoLista}
            aria-busy={carregandoLista || undefined}
            aoAtivar={() => void carregarLista()}
          >
            Atualizar lista
            {carregandoLista ? <Indicador /> : null}
          </Botao>
        }
      >
        <div className="grid gap-4">
          <output className="m-0 text-(length:--texto-1) text-texto-suave block" aria-live="polite">
            {statusLista}
          </output>
          <Esqueleto ocupado={carregandoLista}>{conteudoDaLista()}</Esqueleto>
          {temMais ? (
            <div>
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

      <Superficie
        titulo="Convidar alguém da equipe"
        descricao="O convite só é liberado depois que a conferência confirma que nada ficou pendente."
      >
        <form onSubmit={enviar} noValidate>
          <fieldset
            disabled={!liberada || ocupada}
            className="m-0 min-w-0 border-0 p-0 grid gap-4 max-w-[560px]"
          >
            <Campo
              id="equipe-email"
              name="email"
              rotulo="E-mail"
              tipo="email"
              marcaRotulo="obrigatório"
              required
              maxLength={254}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <SelecaoSimples
              id="equipe-perfil"
              name="perfil"
              rotulo="Perfil"
              defaultValue="profissional"
            >
              <option value="profissional">Profissional</option>
              <option value="administrador">Administrador</option>
            </SelecaoSimples>
            <AreaTexto
              id="equipe-motivo"
              name="motivo"
              rotulo="Motivo"
              marcaRotulo="obrigatório"
              required
              maxLength={4000}
            />
            <div>
              <Botao peso="principal" tipo="submit" aria-busy={ocupada || undefined}>
                Pré-conceder acesso
                {ocupada ? <Indicador /> : null}
              </Botao>
            </div>
          </fieldset>
          <div className="mt-4 grid gap-2 justify-items-start">
            <Botao
              peso="secundario"
              disabled={ocupada}
              aria-busy={ocupada || undefined}
              aoAtivar={() => {
                const sinal = controladorRef.current?.signal;
                if (sinal) void recuperar(sinal);
              }}
            >
              Conferir novamente
              {ocupada ? <Indicador /> : null}
            </Botao>
            <output
              className="m-0 text-(length:--texto-1) text-texto-suave block"
              aria-live="polite"
            >
              {status}
            </output>
          </div>
        </form>
      </Superficie>
    </div>
  );
}

/** Preparação isolada: não montar até existir capacidade e recuperação entre sessões
 *  comprovadas. */
export function montarConcessaoEquipe(raiz: HTMLElement, api: ClienteFFCM): () => void {
  return ilhaSincrona(raiz, <TelaConcessaoEquipe api={api} />);
}
