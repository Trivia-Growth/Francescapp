import { Bell } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { rotulosTipoAviso, type Aviso, type ListaAvisos } from '../packages/contracts/src/aviso.ts';
import { Botao } from './componentes/ui/botao.js';
import { ilha } from './ponte/ilha.js';

/** Serviço dos avisos no aplicativo (FR-072). Implementado por `servico-avisos-http.ts`;
 * aqui só existe o contrato, para que a tela seja testável sem rede. */
export type ServicoAvisos = {
  listar(): Promise<ListaAvisos>;
  marcarLido(aviso: Pick<Aviso, 'paciente_id' | 'tipo' | 'chave_origem'>): Promise<ListaAvisos>;
};

const estados = ['inicial', 'carregando', 'lista', 'vazio', 'falha'] as const;
export type EstadoAvisos = (typeof estados)[number];

function formatarInstante(valor: string | null): string {
  if (!valor) return 'sem data registrada';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 'sem data registrada';
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Chave de um aviso dentro da lista: não é identidade de registro no banco, só o bastante
 *  para rastrear qual botão de "Marcar como lido" está com a requisição em voo. */
function chaveAviso(item: Pick<Aviso, 'tipo' | 'chave_origem'>): string {
  return `${item.tipo}::${item.chave_origem}`;
}

/** Sino e lista de avisos.
 *
 * Quatro estados observáveis e distintos, porque confundi-los é o erro perigoso aqui:
 * vazio só aparece depois de uma consulta real bem-sucedida, e falha nunca é apresentada
 * como "nenhum aviso" nem reaproveita a contagem de uma consulta anterior — o indicador é
 * apagado enquanto não há resposta boa.
 *
 * O texto de cada item descreve a ORIGEM do aviso, nunca o seu teor: quem quer saber o que
 * aconteceu abre o caso, onde a autorização é verificada de novo.
 *
 * VIS-018: nenhuma frase mudou. A única diferença de comportamento é um detalhe que nunca
 * era observável — no evento de falha ao marcar como lido, a versão imperativa reabilitava
 * o botão antes de `falhar()` apagar a lista inteira (o nó era removido um instante depois
 * de voltar a ficar clicável). Aqui a lista inteira é esvaziada direto, com o mesmo
 * resultado final em tela. */
function TelaAvisos({
  servico,
  raiz,
  expor,
}: {
  servico: ServicoAvisos;
  raiz: HTMLElement;
  expor: (api: { atualizar(): Promise<void> }) => void;
}) {
  const [fase, definirFase] = useState<EstadoAvisos>('inicial');
  const [itens, definirItens] = useState<readonly Aviso[]>([]);
  const [naoLidos, definirNaoLidos] = useState(0);
  const [situacao, definirSituacao] = useState('');
  const [carregandoLista, definirCarregandoLista] = useState(false);
  const [painelAberto, definirPainelAberto] = useState(false);
  const [pendentes, definirPendentes] = useState<ReadonlySet<string>>(new Set());

  const servicoRef = useRef(servico);
  servicoRef.current = servico;

  const aplicar = useCallback((dados: ListaAvisos) => {
    definirItens(dados.itens);
    definirNaoLidos(dados.nao_lidos);
    if (dados.itens.length === 0) {
      definirFase('vazio');
      definirSituacao('Nenhum aviso para você agora.');
    } else {
      definirFase('lista');
      definirSituacao(`${dados.itens.length} aviso(s) na lista.`);
    }
  }, []);

  const falhar = useCallback(() => {
    // Falha não vira lista vazia e não reaproveita contagem anterior: o indicador some e
    // a lista é esvaziada, porque "não sabemos" não é "não há".
    definirItens([]);
    definirNaoLidos(0);
    definirFase('falha');
    definirSituacao('Não foi possível carregar os avisos. Tente novamente.');
  }, []);

  const atualizar = useCallback(async (): Promise<void> => {
    flushSync(() => {
      definirFase('carregando');
      definirSituacao('Carregando avisos…');
      definirItens([]);
      definirNaoLidos(0);
      definirCarregandoLista(true);
    });
    try {
      const dados = await servicoRef.current.listar();
      flushSync(() => {
        aplicar(dados);
        definirCarregandoLista(false);
      });
    } catch {
      flushSync(() => {
        falhar();
        definirCarregandoLista(false);
      });
    }
  }, [aplicar, falhar]);

  const marcarLido = useCallback(
    (item: Aviso) => {
      const chave = chaveAviso(item);
      flushSync(() => definirPendentes((atual) => new Set(atual).add(chave)));
      void servicoRef.current
        .marcarLido({
          paciente_id: item.paciente_id,
          tipo: item.tipo,
          chave_origem: item.chave_origem,
        })
        .then((novo) => {
          flushSync(() => {
            aplicar(novo);
            definirPendentes(new Set());
          });
        })
        .catch(() => {
          flushSync(() => {
            definirPendentes(new Set());
            falhar();
          });
        });
    },
    [aplicar, falhar],
  );

  const aoClicarSino = useCallback(() => {
    const vaiAbrir = !painelAberto;
    flushSync(() => definirPainelAberto(vaiAbrir));
    if (vaiAbrir) void atualizar();
  }, [painelAberto, atualizar]);

  /* Duas escritas fora de efeito, no próprio corpo do componente: `raiz` é o nó que
   * `main.ts` recebeu de volta e continua manipulando por fora (`avisosRaiz.id`,
   * `avisosRaiz.hidden`), então seu `dataset.estado` é atributo do CONTAINER, não algo que
   * esta árvore React desenha — mexer nele dentro de um efeito só atrasaria a sincronia que
   * o contrato imperativo (`estado()` chamado logo depois de `atualizar()`) exige. E
   * `expor` precisa estar pronto ANTES de `ilha()` devolver: `montarAvisos` lê o resultado
   * na mesma linha, como `main.ts:349` faz (`avisos ??= montarAvisos(...); void
   * avisos.atualizar();`). */
  raiz.dataset.estado = fase;
  expor({ atualizar });

  return (
    <>
      <button
        type="button"
        id="avisos-sino"
        className="avisos-sino"
        aria-expanded={painelAberto}
        aria-controls="avisos-painel"
        aria-label={
          naoLidos > 0
            ? `Avisos ${naoLidos} ${naoLidos === 1 ? 'não lido' : 'não lidos'}`
            : undefined
        }
        onClick={aoClicarSino}
      >
        <Bell aria-hidden="true" className="chrome-icon" size={16} />
        <span className="avisos-sino-rotulo">Avisos</span>
        <span id="avisos-indicador" className="avisos-indicador" hidden={naoLidos <= 0}>
          {naoLidos > 0 ? String(naoLidos) : ''}
        </span>
      </button>
      <div id="avisos-painel" className="avisos-painel" hidden={!painelAberto}>
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que a tela e as provas já usam. */}
        <p id="avisos-situacao" className="avisos-situacao" role="status">
          {situacao}
        </p>
        <ul id="avisos-lista" className="avisos-lista" aria-busy={carregandoLista || undefined}>
          {itens.map((item) => {
            const chave = chaveAviso(item);
            const partes = [formatarInstante(item.instante)];
            if (item.por_substituicao) partes.push('recebido por substituição');
            if (item.lido) partes.push('lido');
            return (
              <li
                key={chave}
                className="avisos-item"
                data-tipo={item.tipo}
                data-lido={String(item.lido)}
              >
                <p className="avisos-item-titulo">{rotulosTipoAviso[item.tipo]}</p>
                <p className="avisos-item-detalhe">{partes.join(' · ')}</p>
                {item.motivo ? <p className="avisos-item-motivo">{item.motivo}</p> : null}
                {item.lido ? null : (
                  <Botao
                    peso="discreto"
                    className="avisos-item-lido"
                    title="Tira do indicador. Não registra ciência nem encerra a pendência."
                    disabled={pendentes.has(chave)}
                    aoAtivar={() => marcarLido(item)}
                  >
                    Marcar como lido
                  </Botao>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

export function montarAvisos(
  raiz: HTMLElement,
  servico: ServicoAvisos,
): { atualizar(): Promise<void>; estado(): EstadoAvisos; desmontar(): void } {
  raiz.classList.add('avisos');
  let atualizarAtual: () => Promise<void> = () => Promise.resolve();
  const desmontarIlha = ilha(
    raiz,
    <TelaAvisos
      servico={servico}
      raiz={raiz}
      expor={(api) => {
        atualizarAtual = api.atualizar;
      }}
    />,
  );
  return {
    atualizar: () => atualizarAtual(),
    estado: () => (raiz.dataset.estado as EstadoAvisos | undefined) ?? 'inicial',
    /* A versão imperativa não precisava de desmontagem: quem encerrava o sino apagava os
       filhos da raiz e pronto. Uma raiz React não some assim — ela continua viva, e
       quando o React vai remover os nós dela, eles já saíram. Resultado medido em
       26/11/2026: `NotFoundError: The node to be removed is not a child of this node`,
       15 vezes no portão de ativação, sempre em caminho de perda de acesso, sem
       derrubar uma única asserção. */
    desmontar: desmontarIlha,
  };
}
