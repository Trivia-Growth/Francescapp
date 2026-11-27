/* Painel de pendências da demonstração local, reconstruído em React sobre a ilha
 * (`web/ponte/ilha.ts`).
 *
 * Contrato: `montarPainelPendenciasLocal(raiz, dados) => desmontar`. O único chamador é
 * `web/demonstracao.ts`, que recarrega o painel a cada atualização da lista e escreve
 * "Carregando…" na mesma raiz entre uma carga e outra — por isso ele precisa desmontar a
 * ilha ANTES de escrever, e a desmontagem passou a ser devolvida.
 *
 * O que NÃO mudou, de propósito: o texto de cada linha (inclusive o `estado` cru, como
 * `em_andamento`), a comparação de prazo por texto `AAAA-MM-DD` e o rótulo "Abrir tarefas"
 * sem o nome do paciente. Os três são achados registrados no PR, não corrigidos calados. */
import { Botao } from './componentes/ui/botao.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';

type TarefaPainelLocal = {
  descricao: string;
  responsavel: string;
  prazo: string;
  estado: string;
};

export type DadosPainelPendenciasLocal = {
  hoje: string;
  pacientes: readonly {
    id: string;
    nome: string;
    tarefas: readonly TarefaPainelLocal[];
  }[];
  abrirTarefas?: (pacienteId: string) => void;
};

const aberta = (tarefa: TarefaPainelLocal) =>
  tarefa.estado === 'pendente' || tarefa.estado === 'em_andamento';

function PainelPendenciasLocal({ dados }: { dados: DadosPainelPendenciasLocal }) {
  const comTarefas = dados.pacientes
    .map((paciente) => ({ paciente, tarefas: paciente.tarefas.filter(aberta) }))
    .filter(({ tarefas }) => tarefas.length > 0);
  if (!comTarefas.length) return <p>Nenhuma tarefa em aberto registrada nesta prévia.</p>;
  return (
    <>
      {comTarefas.map(({ paciente, tarefas }) => (
        <section key={paciente.id}>
          <h3>{paciente.nome}</h3>
          <ul>
            {tarefas.map((tarefa, indice) => {
              const vencida = tarefa.prazo && tarefa.prazo < dados.hoje;
              return (
                // A tarefa da prévia não tem identificador próprio; a ordem é estável
                // dentro de uma montagem, que é tudo o que esta lista vive.
                // biome-ignore lint/suspicious/noArrayIndexKey: lista só de leitura, sem reordenação.
                <li key={indice}>
                  {`${tarefa.descricao} · ${tarefa.responsavel} · Prazo: ${tarefa.prazo} · ${tarefa.estado}${vencida ? ' · Vencida' : ''}`}
                </li>
              );
            })}
          </ul>
          {dados.abrirTarefas ? (
            <Botao peso="discreto" aoAtivar={() => dados.abrirTarefas?.(paciente.id)}>
              Abrir tarefas
            </Botao>
          ) : null}
        </section>
      ))}
    </>
  );
}

/** Apresenta dados fornecidos pela prévia; não autoriza acesso. Datas usam AAAA-MM-DD. */
export function montarPainelPendenciasLocal(
  raiz: HTMLElement,
  dados: DadosPainelPendenciasLocal,
): () => void {
  return ilha(raiz, <PainelPendenciasLocal dados={dados} />);
}
