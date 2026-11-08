import { exigeNovoAcesso, mensagemFalha } from './api.js';
import type { ServicoPlanoCuidado } from './plano-cuidado.js';
import type { ServicoTarefasCuidado } from './tarefas-cuidado.js';

/** Consulta somente dados autorizados pelos serviços; desmontagem invalida respostas pendentes. */
export function montarResumoConectado(
  raiz: HTMLElement,
  pacienteId: string,
  plano: Pick<ServicoPlanoCuidado, 'consultarObjetivos'>,
  tarefas: Pick<ServicoTarefasCuidado, 'consultarTarefas'>,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  let ativa = true;
  let geracao = 0;
  const objetivos = document.createElement('section');
  const listaTarefas = document.createElement('section');
  raiz.replaceChildren(objetivos, listaTarefas);
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto: string) => {
    const el = document.createElement(tipo);
    el.textContent = texto;
    return el;
  };
  const falha = (destino: HTMLElement, erro: unknown, tentar: () => void) => {
    if (exigeNovoAcesso(erro)) {
      ativa = false;
      raiz.replaceChildren();
      acessoPerdido(erro);
      return;
    }
    destino.append(elemento('p', mensagemFalha(erro)));
    const botao = elemento('button', 'Tentar novamente');
    botao.type = 'button';
    botao.addEventListener('click', tentar);
    destino.append(botao);
  };
  const carregarObjetivos = (cursor?: string) => {
    const versao = ++geracao;
    objetivos.replaceChildren(elemento('h3', 'Objetivos'), elemento('p', 'Carregando objetivos…'));
    void plano
      .consultarObjetivos(pacienteId, cursor)
      .then((pagina) => {
        if (!ativa || versao !== geracao) return;
        objetivos.replaceChildren(elemento('h3', 'Objetivos'));
        objetivos.append(elemento('p', 'Página de objetivos. A lista pode mudar entre consultas.'));
        if (!pagina.itens.length) objetivos.append(elemento('p', 'Nenhum objetivo nesta página.'));
        const lista = document.createElement('ul');
        for (const item of pagina.itens)
          lista.append(
            elemento(
              'li',
              `${item.objetivo.descricao} · ${item.objetivo.estado} · Revisão: ${item.objetivo.dataRevisao}`,
            ),
          );
        objetivos.append(lista);
        if (pagina.proximo_cursor) {
          const proximo = elemento('button', 'Próxima página de objetivos');
          proximo.type = 'button';
          proximo.addEventListener('click', () =>
            carregarObjetivos(pagina.proximo_cursor ?? undefined),
          );
          objetivos.append(proximo);
        }
        if (cursor) {
          const inicio = elemento('button', 'Voltar à primeira página de objetivos');
          inicio.type = 'button';
          inicio.addEventListener('click', () => carregarObjetivos());
          objetivos.append(inicio);
        }
      })
      .catch((erro: unknown) => {
        if (!ativa || versao !== geracao) return;
        objetivos.replaceChildren(elemento('h3', 'Objetivos'));
        falha(objetivos, erro, () => carregarObjetivos(cursor));
      });
  };
  const carregarTarefas = () => {
    listaTarefas.replaceChildren(elemento('h3', 'Tarefas'), elemento('p', 'Carregando tarefas…'));
    void tarefas
      .consultarTarefas(pacienteId)
      .then((registros) => {
        if (!ativa) return;
        listaTarefas.replaceChildren(elemento('h3', 'Tarefas'));
        const abertas = registros.filter(
          ({ tarefa }) => tarefa.estado === 'pendente' || tarefa.estado === 'em_andamento',
        );
        if (!abertas.length) listaTarefas.append(elemento('p', 'Nenhuma tarefa em aberto.'));
        const lista = document.createElement('ul');
        for (const { tarefa } of abertas)
          lista.append(
            elemento(
              'li',
              `${tarefa.descricao} · ${tarefa.responsavel} · Prazo: ${tarefa.prazo} · ${tarefa.estado}`,
            ),
          );
        listaTarefas.append(lista);
      })
      .catch((erro: unknown) => {
        if (!ativa) return;
        listaTarefas.replaceChildren(elemento('h3', 'Tarefas'));
        falha(listaTarefas, erro, carregarTarefas);
      });
  };
  carregarObjetivos();
  carregarTarefas();
  return () => {
    ativa = false;
    geracao += 1;
    raiz.replaceChildren();
  };
}
