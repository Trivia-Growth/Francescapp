import type { Objetivo } from '../packages/contracts/src/plano-cuidado';
import type { RelatoTextual } from '../packages/contracts/src/relato-textual';

type RespostaLocal = {
  estado: string;
  valor: string;
  fonte: string;
  data: string;
  secao?: string;
  campo?: string;
};
type AnamneseLocal = RespostaLocal | RespostaLocal[];
type TarefaLocal = {
  descricao: string;
  responsavel: string;
  prazo: string;
  prioridade: string;
  estado: string;
  acaoOuJustificativa: string;
};

export type DadosResumoCasoLocal = {
  anamnese: AnamneseLocal | null;
  tarefas: readonly TarefaLocal[];
  objetivos: readonly Objetivo[];
  relatos: readonly RelatoTextual[];
};

/** Apresenta somente dados já carregados pela prévia fictícia; não autoriza acesso. */
export function montarResumoCasoLocal(raiz: HTMLElement, dados: DadosResumoCasoLocal): void {
  raiz.replaceChildren();
  const secao = (titulo: string, linhas: string[]) => {
    const bloco = document.createElement('section');
    const cabecalho = document.createElement('h3');
    cabecalho.textContent = titulo;
    bloco.append(cabecalho);
    const lista = document.createElement('ul');
    for (const linha of linhas) {
      const item = document.createElement('li');
      item.textContent = linha;
      lista.append(item);
    }
    bloco.append(lista);
    raiz.append(bloco);
  };
  const anamnese = dados.anamnese;
  const respostas = anamnese ? (Array.isArray(anamnese) ? anamnese : [anamnese]) : [];
  secao(
    'Anamnese',
    respostas.length
      ? respostas.map(
          (item) =>
            `${item.secao ? `${item.secao} · ${item.campo} · ` : ''}Estado: ${item.estado}${item.estado === 'informado' && item.valor ? ` · ${item.valor}` : ''}${item.estado !== 'pendente' ? ` · Fonte: ${item.fonte} · Data: ${item.data}` : ''}`,
        )
      : ['Informação insuficiente: anamnese pendente nesta prévia.'],
  );
  const pendentes = dados.tarefas.filter(
    (tarefa) => tarefa.estado === 'pendente' || tarefa.estado === 'em_andamento',
  );
  secao(
    'Tarefas em aberto',
    pendentes.length
      ? pendentes.map(
          (tarefa) =>
            `${tarefa.descricao} · ${tarefa.responsavel} · Prazo: ${tarefa.prazo} · ${tarefa.estado}`,
        )
      : ['Nenhuma tarefa em aberto registrada nesta prévia.'],
  );
  const ativos = dados.objetivos.filter(
    (objetivo) => objetivo.estado !== 'atingido' && objetivo.estado !== 'encerrado',
  );
  secao(
    'Objetivos',
    ativos.length
      ? ativos.map(
          (objetivo) =>
            `${objetivo.descricao} · ${objetivo.estado} · Revisão: ${objetivo.dataRevisao}`,
        )
      : ['Nenhum objetivo não encerrado registrado nesta prévia.'],
  );
  const relatos = [...dados.relatos].sort((a, b) =>
    b.dataAcontecimento.localeCompare(a.dataAcontecimento),
  );
  secao(
    'Relatos por data do acontecimento',
    relatos.length
      ? relatos.map((relato) => `${relato.dataAcontecimento} · ${relato.descricao}`)
      : ['Nenhum relato registrado nesta prévia.'],
  );
}
