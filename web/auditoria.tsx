/* Consulta da trilha de auditoria (FR-039). Os registros identificam autor,
 * instante, operação e objeto. O motivo cifrado e o request_id de cada registro ficam no banco. */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { leituraPorSessao } from './consultas.js';
import type { EventoAuditoria } from '../packages/contracts/src/auditoria.js';
import { FalhaApi } from './api.js';
import { Botao } from './componentes/ui/botao.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { Campo } from './componentes/ui/campo.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { type ColunaTabela, ListaRotulada, Tabela } from './componentes/ui/tabela.js';
import type { FiltrosAuditoria, ServicoAuditoria } from './servico-auditoria-http.js';
import { MolduraTela } from './telas/moldura-tela.js';

const formatadorInstante = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/Sao_Paulo',
});

function instanteLegivel(iso: string): string {
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? iso : formatadorInstante.format(instante);
}

const RESULTADOS = {
  permitido: 'Permitido',
  negado: 'Negado',
  falhou: 'Falhou',
} as const;

/** Converte `api.listar_concessoes_equipe` em "Listar concessões da equipe".
 * A trilha guarda o nome técnico da operação porque é ele que identifica o caminho de código;
 * a tela mostra o nome técnico junto do legível para que a pessoa consiga procurar por ele. */
function acaoLegivel(acao: string): string {
  const semPrefixo = acao.replace(/^api\./, '').replace(/_/g, ' ');
  return semPrefixo.charAt(0).toUpperCase() + semPrefixo.slice(1);
}

function autorDoEvento(
  evento: EventoAuditoria,
  nomeDoUsuario?: (usuarioId: string) => string | undefined,
): string {
  if (evento.ator_usuario_id)
    return (
      nomeDoUsuario?.(evento.ator_usuario_id) ?? `Usuário ${evento.ator_usuario_id.slice(0, 8)}`
    );
  if (evento.ator_auth_id) return `Acesso não vinculado ${evento.ator_auth_id.slice(0, 8)}`;
  return evento.operador_restrito ?? 'Origem não identificada';
}

type Caso = { readonly id: string; readonly nome: string };

type Opcoes = {
  nomeDoUsuario?: (usuarioId: string) => string | undefined;
  /** Casos que esta pessoa já pode ver por outro caminho autorizado. Serve só para o filtro
   * ter nomes em vez de identificadores; a autorização continua no banco. Sem a lista, o
   * filtro por caso não aparece — não oferecemos um campo de uuid cru. */
  listarCasos?: () => Promise<readonly Caso[]>;
};

/** Lê um campo de data local e devolve o começo (`00:00:00`) ou o fim (`23:59:59.999`) do
 *  dia em ISO. A trilha guarda instante com fuso; sem isto um evento das 14h sumiria de um
 *  filtro do próprio dia. */
function limiteDoDia(data: string, fim: boolean): string {
  return new Date(`${data}T${fim ? '23:59:59.999' : '00:00:00'}`).toISOString();
}

/** Política da fatia 9b para a Auditoria: NADA é guardado. O registro de acessos é dado
 *  sensível e sempre lido na hora; o cache de leituras serve só para que pedidos iguais
 *  simultâneos (duplo clique em Aplicar) virem um GET, com `gcTime: 0` — a entrada some
 *  quando a consulta termina. A resposta que chega depois de outra consulta mais nova é
 *  descartada pela geração; a de outra identidade, pela chave e pelo serviço HTTP. */
export function TelaAuditoria({
  servico,
  opcoes,
}: {
  servico: ServicoAuditoria & { identidade: { usuario_id: string; session_id: string } };
  opcoes: Opcoes;
}) {
  const idFiltros = useId();
  const [itens, definirItens] = useState<readonly EventoAuditoria[]>([]);
  const [status, definirStatus] = useState('Carregando registros…');
  const [ocupada, definirOcupada] = useState(true);
  const [proximoCursor, definirProximoCursor] = useState<string | null>(null);
  const [temAnteriores, definirTemAnteriores] = useState(false);
  const [casos, definirCasos] = useState<readonly Caso[]>([]);

  const [caso, definirCaso] = useState('');
  const [acao, definirAcao] = useState('');
  const [resultado, definirResultado] = useState('');
  const [de, definirDe] = useState('');
  const [ate, definirAte] = useState('');

  const ativaRef = useRef(true);
  useEffect(
    () => () => {
      ativaRef.current = false;
    },
    [],
  );

  const cursorRef = useRef<string | undefined>(undefined);
  const anterioresRef = useRef<(string | undefined)[]>([]);
  const proximoCursorRef = useRef<string | null>(null);

  const geracaoRef = useRef(0);
  const carregar = useCallback(
    async (cursor: string | undefined, filtros: Omit<FiltrosAuditoria, 'limite' | 'cursor'>) => {
      const geracao = ++geracaoRef.current;
      const vigente = () => ativaRef.current && geracao === geracaoRef.current;
      definirOcupada(true);
      definirStatus('Carregando registros…');
      try {
        const entrada: FiltrosAuditoria = { limite: 25, cursor, ...filtros };
        const pagina = await leituraPorSessao(
          servico.identidade,
          ['auditoria', JSON.stringify(entrada)],
          () => servico.consultar(entrada),
          0,
        ).consultar();
        if (!vigente()) return;
        definirItens(pagina.itens);
        cursorRef.current = cursor;
        proximoCursorRef.current = pagina.proximo_cursor;
        definirProximoCursor(pagina.proximo_cursor);
        // Com filtro por caso, o resultado é incompleto por construção: registros feitos antes
        // de o sistema passar a guardar o caso não têm como ser encontrados por aqui. Dizer
        // isso é obrigação — quem investiga precisa saber que a lista não é a trilha inteira.
        const ressalvaCaso = filtros.paciente_id
          ? ' Registros anteriores a esta função não guardavam o caso e não aparecem neste filtro.'
          : '';
        definirStatus(
          pagina.itens.length === 0
            ? `Nenhum registro para estes filtros.${ressalvaCaso}`
            : `${pagina.itens.length} ${pagina.itens.length === 1 ? 'registro' : 'registros'} nesta página.${ressalvaCaso}`,
        );
      } catch (erro) {
        if (!vigente()) return;
        definirItens([]);
        proximoCursorRef.current = null;
        definirProximoCursor(null);
        const codigo = erro instanceof FalhaApi ? erro.codigo : null;
        definirStatus(
          codigo === 'sem_permissao'
            ? 'Sua conta não pode consultar o registro de acessos.'
            : 'Não foi possível carregar o registro. Tente de novo.',
        );
      } finally {
        if (vigente()) definirOcupada(false);
      }
    },
    [servico],
  );

  const filtrosAtuais = useCallback((): Omit<FiltrosAuditoria, 'limite' | 'cursor'> => {
    const entrada: Omit<FiltrosAuditoria, 'limite' | 'cursor'> = {};
    if (caso) entrada.paciente_id = caso;
    if (acao.trim()) entrada.acao = acao.trim();
    if (resultado) entrada.resultado = resultado as FiltrosAuditoria['resultado'];
    if (de) entrada.instante_de = limiteDoDia(de, false);
    if (ate) entrada.instante_ate = limiteDoDia(ate, true);
    return entrada;
  }, [caso, acao, resultado, de, ate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: é a montagem da tela, e só ela — a primeira carga usa sempre os filtros vazios, como na versão anterior.
  useEffect(() => {
    void carregar(undefined, {});
  }, []);

  useEffect(() => {
    if (!opcoes.listarCasos) return;
    opcoes
      .listarCasos()
      .then((lista) => {
        if (ativaRef.current) definirCasos(lista);
      })
      .catch(() => {
        /* sem a lista, o filtro fica só com "Todos" em vez de sumir no meio da sessão */
      });
  }, [opcoes]);

  function aplicarFiltros() {
    anterioresRef.current = [];
    definirTemAnteriores(false);
    void carregar(undefined, filtrosAtuais());
  }

  function limparFiltros() {
    definirCaso('');
    definirAcao('');
    definirResultado('');
    definirDe('');
    definirAte('');
    anterioresRef.current = [];
    definirTemAnteriores(false);
    void carregar(undefined, {});
  }

  function avancarPagina() {
    const proximo = proximoCursorRef.current;
    if (!proximo) return;
    anterioresRef.current.push(cursorRef.current);
    definirTemAnteriores(true);
    void carregar(proximo, filtrosAtuais());
  }

  function voltarPagina() {
    if (anterioresRef.current.length === 0) return;
    const anterior = anterioresRef.current.pop();
    definirTemAnteriores(anterioresRef.current.length > 0);
    void carregar(anterior, filtrosAtuais());
  }

  const colunas: readonly ColunaTabela<EventoAuditoria>[] = useMemo(
    () => [
      {
        titulo: 'Quando',
        largura: 'w-1/5',
        celula: (item) => <time dateTime={item.instante}>{instanteLegivel(item.instante)}</time>,
      },
      {
        titulo: 'Quem',
        largura: 'w-[21%]',
        celula: (item) => autorDoEvento(item, opcoes.nomeDoUsuario),
      },
      {
        titulo: 'Operação',
        largura: 'w-[23%]',
        celula: (item) => <span title={item.acao}>{acaoLegivel(item.acao)}</span>,
      },
      {
        titulo: 'Objeto',
        largura: 'w-1/5',
        celula: (item) =>
          item.objeto_id ? `${item.tipo_objeto} ${item.objeto_id.slice(0, 8)}` : item.tipo_objeto,
      },
      {
        titulo: 'Resultado',
        largura: 'w-[16%]',
        celula: (item) => (
          <MarcaEstado
            tom={item.resultado === 'permitido' ? 'padrao' : 'contorno'}
            className="whitespace-nowrap text-meta"
          >
            {RESULTADOS[item.resultado]}
          </MarcaEstado>
        ),
      },
    ],
    [opcoes.nomeDoUsuario],
  );

  return (
    <div data-tela="auditoria" className="min-w-0">
      <MolduraTela
        titulo="Registro de acessos e alterações"
        explicacao="Cada consulta, alteração e mudança de acesso fica registrada com quem fez, quando e sobre o quê. O registro não guarda o conteúdo em si, e não pode ser apagado nem corrigido depois."
        status={status}
        ocupado={ocupada}
      >
        <section className="grid min-w-0 gap-sistema-3" aria-labelledby={idFiltros}>
          <h3 id={idFiltros} className="m-0 font-serifada text-secao">
            Filtrar registros
          </h3>
          <form
            className="@container/filtros m-0 grid min-w-0 max-w-none gap-sistema-4 rounded-superficie border-0 bg-sistema-superficie p-sistema-4 shadow-cartao lateral:p-sistema-5"
            noValidate
            onSubmit={(evento) => {
              evento.preventDefault();
              aplicarFiltros();
            }}
          >
            <div className="grid grid-cols-1 gap-sistema-4 @min-[40rem]/filtros:grid-cols-2">
              {opcoes.listarCasos ? (
                <SelecaoAprimorada
                  id="auditoria-caso"
                  rotulo="Caso"
                  value={caso}
                  onChange={(evento) => definirCaso(evento.currentTarget.value)}
                  classeEnvelope="mb-0"
                >
                  <option value="">Todos</option>
                  {casos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                    </option>
                  ))}
                </SelecaoAprimorada>
              ) : null}
              <Campo
                id="auditoria-acao"
                rotulo="Operação"
                maxLength={120}
                placeholder="Ex.: api.consultar_auditoria"
                value={acao}
                onChange={(evento) => definirAcao(evento.currentTarget.value)}
                classeEnvelope="mb-0"
              />
              <SelecaoAprimorada
                id="auditoria-resultado"
                rotulo="Resultado"
                value={resultado}
                onChange={(evento) => definirResultado(evento.currentTarget.value)}
                classeEnvelope="mb-0"
              >
                <option value="">Todos</option>
                {Object.entries(RESULTADOS).map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
              </SelecaoAprimorada>
              <CampoData
                id="auditoria-de"
                rotulo="A partir de"
                value={de}
                aoAlterar={definirDe}
                classeEnvelope="mb-0"
              />
              <CampoData
                id="auditoria-ate"
                rotulo="Até"
                value={ate}
                aoAlterar={definirAte}
                classeEnvelope="mb-0"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-sistema-2">
              <Botao peso="secundario" tipo="submit" disabled={ocupada}>
                Aplicar filtros
              </Botao>
              <Botao peso="secundario" disabled={ocupada} aoAtivar={limparFiltros}>
                Limpar
              </Botao>
            </div>
          </form>
        </section>

        <section
          aria-label="Resultados da auditoria"
          aria-busy={ocupada}
          className="@container/auditoria min-w-0 rounded-superficie bg-sistema-superficie px-sistema-4 shadow-cartao empty:hidden lateral:px-sistema-5"
        >
          {itens.length ? (
            <>
              <ListaRotulada
                itens={itens}
                colunas={colunas}
                chave={(item) => item.id}
                rotulo="Registros de auditoria"
                className="@tabela/auditoria:hidden"
              />
              <Tabela
                itens={itens}
                colunas={colunas}
                chave={(item) => item.id}
                rotulo="Registros de auditoria"
                className="hidden @tabela/auditoria:table"
              />
            </>
          ) : null}
        </section>

        <div className="flex flex-wrap justify-end gap-sistema-2">
          <Botao peso="secundario" disabled={ocupada || !temAnteriores} aoAtivar={voltarPagina}>
            Página anterior
          </Botao>
          <Botao peso="secundario" disabled={ocupada || !proximoCursor} aoAtivar={avancarPagina}>
            Próxima página
          </Botao>
        </div>
      </MolduraTela>
    </div>
  );
}
