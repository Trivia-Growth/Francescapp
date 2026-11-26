import { describe, it, expect } from 'vitest';
import { apresentarRedeMinima, apresentarFonteCaso } from './turno-execucao-caso-apresentacao.ts';
describe('FR033 mínimo identificável de terceiros no PDF de caso', () => {
  it('inclui apenas papel e primeiro nome; omite sobrenome, contato, anotação e identificadores', () => {
    const texto = apresentarRedeMinima([
      {
        id: 'identificador-ficticio',
        nome: 'Maria Fictícia Silva',
        vinculos: ['familiar', 'contato_emergencia'],
        contato: 'contato-ficticio',
        observacao: 'anotacao-ficticia',
      },
    ]);
    expect(texto).toBe('Familiar, Contato de emergência: Maria');
    for (const segredo of [
      'Fictícia',
      'Silva',
      'identificador-ficticio',
      'contato-ficticio',
      'anotacao-ficticia',
    ])
      expect(texto).not.toContain(segredo);
  });
});

it('campos adicionais de objetivo preservam todos valores sem expor UUID de catálogo', () => {
  const extras = {
    'a0000000-0000-4000-8000-000000000001': '42',
    'a0000000-0000-4000-8000-000000000002': 'Texto fictício',
    'a0000000-0000-4000-8000-000000000003': '2026-11-19',
    'a0000000-0000-4000-8000-000000000004': 'Primeiro; Segundo',
  };
  const texto = apresentarFonteCaso('objetivo', {
    objetivo: {
      descricao: 'Objetivo fictício',
      area: 'Área fictícia',
      responsavel: 'Responsável fictício',
      situacaoInicial: 'Situação fictícia',
      observacaoProgresso: 'Progresso fictício',
      dataRevisao: '2026-11-19',
      estado: 'proposto',
      camposExtras: extras,
    },
  });
  for (const valor of Object.values(extras)) expect(texto).toContain(valor);
  for (const chave of Object.keys(extras)) expect(texto).not.toContain(chave);
  expect(texto).toContain('rótulo não disponível nesta versão');
});
it.each([
  [
    'anamnese',
    {
      secoes: [
        {
          id: 'secao-ficticia',
          camposEsperados: ['Queixa'],
          respostas: [
            {
              campo: 'Queixa',
              estado: 'informado',
              valor: 'Queixa fictícia preservada',
              fonte: 'Fonte fictícia',
              data: '2026-11-19',
            },
          ],
        },
      ],
    },
    'Queixa fictícia preservada',
  ],
  [
    'saude',
    {
      registros: [
        {
          id: 'saude-ficticia',
          tipo: 'historico',
          descricao: 'Histórico fictício preservado',
          origem: 'Pessoa fictícia',
          natureza: 'relato_leigo',
          data: '2026-11-19',
          situacao: 'hipotese',
        },
      ],
    },
    'Histórico fictício preservado',
  ],
  [
    'contexto',
    {
      conteudo: [
        {
          id: 'contexto-ficticio',
          categoria: 'rotina',
          descricao: 'Rotina fictícia preservada',
          objetivos: [],
        },
      ],
    },
    'Rotina fictícia preservada',
  ],
  [
    'rede',
    {
      conteudo: [
        {
          id: 'rede-ficticia',
          nome: 'Maria Sobrenome',
          vinculos: ['cuidador'],
          contato: null,
          observacao: null,
        },
      ],
    },
    'Cuidador: Maria',
  ],
  [
    'diario',
    {
      tipo: 'evolucao_profissional',
      estado: 'publicado',
      audiencia: 'equipe',
      origem_conteudo: 'texto',
      atencao: true,
      retorno_solicitado: false,
      conteudo: {
        data: '2026-11-19',
        area: 'Área fictícia',
        atividade: 'Atividade fictícia preservada',
      },
    },
    'Atividade fictícia preservada',
  ],
  [
    'documento',
    {
      nome_visivel: 'Documento fictício preservado',
      categoria: 'Laudo',
      origem: 'Fonte fictícia',
      data_documento: '2026-11-19',
      estado: 'disponivel',
      audiencia: 'equipe',
      descricao: 'Descrição fictícia',
    },
    'Documento fictício preservado',
  ],
  [
    'situacao',
    { subtipo: 'ativo', detalhe: { situacao: 'ativo' } },
    'Situação do acompanhamento: ativo',
  ],
  [
    'objetivo',
    {
      objetivo: {
        descricao: 'Objetivo fictício preservado',
        area: 'Área fictícia',
        responsavel: 'Responsável fictício',
        situacaoInicial: 'Situação inicial fictícia',
        observacaoProgresso: 'Progresso fictício',
        dataRevisao: '2026-11-19',
        estado: 'proposto',
      },
    },
    'Objetivo fictício preservado',
  ],
  [
    'tarefa',
    {
      tarefa: {
        descricao: 'Tarefa fictícia preservada',
        responsavel: 'Responsável fictício',
        prazo: '2026-11-19',
        prioridade: 'alta',
        estado: 'concluida',
        acaoRealizada: 'Ação fictícia concluída',
      },
      data: '2026-11-19T12:00:00Z',
    },
    'Tarefa fictícia preservada',
  ],
  [
    'encaminhamento',
    {
      destino: 'Destino fictício preservado',
      motivo: 'Motivo fictício',
      responsavel: 'Responsável fictício',
      etapa: 'sugerido',
    },
    'Destino fictício preservado',
  ],
  [
    'orientacao',
    {
      texto: 'Orientação fictícia preservada',
      autor: 'Autora declarada fictícia',
      data: '2026-11-19',
      destinatarios: 'Destinatário fictício',
      validade: null,
      situacao: 'vigente',
    },
    'Orientação fictícia preservada',
  ],
  [
    'pendencia',
    { detalhe: { tipo: 'retorno', acao: 'Ação fictícia preservada' } },
    'Ação fictícia preservada',
  ],
] as const)(
  'apresenta conteúdo relevante da fonte %s sem omissão silenciosa',
  (fonte, conteudo, esperado) => {
    expect(apresentarFonteCaso(fonte, conteudo)).toContain(esperado);
  },
);
it('tarefa concluída preserva descrição, responsável, estado e ação realizada', () => {
  const t = apresentarFonteCaso('tarefa', {
    tarefa: {
      descricao: 'Tarefa fictícia',
      responsavel: 'Responsável fictício',
      prazo: '2026-11-19',
      prioridade: 'alta',
      estado: 'concluida',
      acaoRealizada: 'Ação fictícia',
    },
  });
  for (const v of ['Tarefa fictícia', 'Responsável fictício', 'concluida', 'Ação fictícia'])
    expect(t).toContain(v);
});
it('orientação distingue autoria declarada dos metadados de registrador do manifesto', () => {
  const t = apresentarFonteCaso('orientacao', {
    texto: 'Orientação fictícia',
    autor: 'Assinante fictício',
    data: '2026-11-19',
    destinatarios: 'Família fictícia',
    validade: '2026-12-19',
    situacao: 'vigente',
    autor_usuario_id: 'registrador-diferente',
  });
  expect(t).toContain('Autor declarado: Assinante fictício');
  expect(t).toContain('Destinatários declarados: Família fictícia');
  expect(t).not.toContain('registrador-diferente');
});
