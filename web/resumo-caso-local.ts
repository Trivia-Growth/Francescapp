import type { Objetivo } from '../packages/contracts/src/plano-cuidado';
import type { RelatoTextual } from '../packages/contracts/src/relato-textual';
import type { EncaminhamentoLocal } from './encaminhamentos-local';
import type { OrientacaoLocal } from './orientacoes-local';

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
  paciente?: {
    name: string;
    birthDate?: string | null;
    phone?: string | null;
    email?: string | null;
    situacao?: 'entrada' | 'ativo' | 'pausado' | 'encerrado' | 'transferido';
    historicoSituacao?: readonly {
      situacao: 'entrada' | 'ativo' | 'pausado' | 'encerrado' | 'transferido';
      data: string;
      motivo: string;
    }[];
  };
  anamnese: AnamneseLocal | null;
  tarefas: readonly TarefaLocal[];
  objetivos: readonly Objetivo[];
  relatos: readonly RelatoTextual[];
  encaminhamentos?: readonly EncaminhamentoLocal[];
  orientacoes?: readonly OrientacaoLocal[];
  pessoasReferencia?: readonly { nome: string; relacao: string; contato: string }[];
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
  if (dados.paciente) {
    const paciente = dados.paciente;
    secao('Paciente', [
      `Nome: ${paciente.name}`,
      ...(paciente.birthDate ? [`Nascimento: ${paciente.birthDate}`] : []),
      ...(paciente.phone ? [`Telefone: ${paciente.phone}`] : []),
      ...(paciente.email ? [`E-mail: ${paciente.email}`] : []),
    ]);
  }
  if (dados.paciente) {
    secao('Situação do acompanhamento', [
      `Situação atual: ${dados.paciente.situacao ?? 'não informada'}`,
      ...(dados.paciente.historicoSituacao?.length
        ? dados.paciente.historicoSituacao.map(
            (item) => `${item.data} · ${item.situacao} · Motivo: ${item.motivo}`,
          )
        : ['Nenhuma alteração de situação registrada nesta prévia.']),
    ]);
  } else {
    secao('Situação do acompanhamento', ['Situação não carregada nesta prévia.']);
  }
  secao(
    'Pessoas de referência',
    dados.pessoasReferencia?.length
      ? dados.pessoasReferencia.map(
          (pessoa) =>
            `${pessoa.nome} · ${pessoa.relacao}${pessoa.contato ? ` · Contato: ${pessoa.contato}` : ''}`,
        )
      : [
          dados.pessoasReferencia
            ? 'Nenhuma pessoa de referência registrada nesta prévia.'
            : 'Pessoas de referência não carregadas nesta prévia.',
        ],
  );
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
  secao(
    'Encaminhamentos',
    dados.encaminhamentos?.length
      ? dados.encaminhamentos.map(
          (item) => `${item.destino} · ${item.motivo} · ${item.responsavel} · ${item.estado}`,
        )
      : [
          dados.encaminhamentos
            ? 'Nenhum encaminhamento registrado nesta prévia.'
            : 'Encaminhamentos não carregados nesta prévia.',
        ],
  );
  secao(
    'Orientações',
    dados.orientacoes?.length
      ? dados.orientacoes.map(
          (item) =>
            `${item.texto} · ${item.autor} · ${item.data} · Destinatários: ${item.destinatarios}${item.validade ? ` · Validade: ${item.validade}` : ''}${item.anterior ? ' · Anterior' : ''}`,
        )
      : [
          dados.orientacoes
            ? 'Nenhuma orientação registrada nesta prévia.'
            : 'Orientações não carregadas nesta prévia.',
        ],
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
