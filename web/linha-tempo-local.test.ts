// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { montarLinhaTempoLocal } from './linha-tempo-local';

it('ordena datas fornecidas e distingue acontecimento, prazo e compromisso sem interpretar HTML', () => {
  const raiz = document.createElement('div');
  montarLinhaTempoLocal(raiz, {
    relatos: [{ dataAcontecimento: '2026-11-02', descricao: '<img src=x>' }],
    tarefas: [{ prazo: '2026-11-04', descricao: 'Retorno', estado: 'pendente' }],
    compromissos: [
      { data: '2026-11-03', hora: '14:30', descricao: 'Consulta', estado: 'cancelado' },
    ],
  });
  const linhas = [...raiz.querySelectorAll('li')].map((item) => item.textContent);
  expect(linhas).toEqual([
    'Tarefa · Prazo: 2026-11-04 · Retorno · pendente',
    'Compromisso · Data: 2026-11-03 às 14:30 · Consulta · cancelado',
    'Relato · Data do acontecimento: 2026-11-02 · <img src=x>',
  ]);
  expect(raiz.querySelector('img')).toBeNull();
});

it('informa ausência de eventos e substitui conteúdo anterior', () => {
  const raiz = document.createElement('div');
  raiz.textContent = 'Anterior';
  montarLinhaTempoLocal(raiz, { relatos: [], tarefas: [], compromissos: [] });
  expect(raiz.textContent).toBe('Nenhum evento registrado nesta prévia.');
});

it('inclui evoluções na cronologia e identifica rascunhos sem interpretar HTML', () => {
  const raiz = document.createElement('div');
  montarLinhaTempoLocal(raiz, {
    relatos: [{ dataAcontecimento: '2026-11-02', descricao: 'Relato fictício' }],
    tarefas: [],
    compromissos: [],
    evolucoes: [
      {
        data: '2026-11-03',
        texto: '<img src=x>',
        autor: 'Pessoa fictícia',
        area: 'Atendimento',
        estado: 'rascunho',
      },
      {
        data: '2026-11-01',
        texto: 'Registro fictício',
        autor: 'Pessoa fictícia',
        area: 'Atendimento',
        estado: 'publicada',
      },
    ],
  });
  expect([...raiz.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
    'Evolução · Data: 2026-11-03 · <img src=x> · Pessoa fictícia · Atendimento · rascunho',
    'Relato · Data do acontecimento: 2026-11-02 · Relato fictício',
    'Evolução · Data: 2026-11-01 · Registro fictício · Pessoa fictícia · Atendimento · publicada',
  ]);
  expect(raiz.querySelector('img')).toBeNull();
});
