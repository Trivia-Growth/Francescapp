/** Apresenta as tarefas informadas pela demonstração local. */
import { Botao } from './componentes/ui/botao.js';
import './estilos/tema.css';

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

export function PainelPendenciasLocal({ dados }: { dados: DadosPainelPendenciasLocal }) {
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
