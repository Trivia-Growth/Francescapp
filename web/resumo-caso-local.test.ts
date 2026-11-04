// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { montarResumoCasoLocal } from './resumo-caso-local';

it('apresenta dados fictícios disponíveis e informação insuficiente sem interpretar conteúdo como HTML', () => {
  const raiz = document.createElement('div');
  montarResumoCasoLocal(raiz, {
    anamnese: null,
    tarefas: [
      {
        descricao: 'Agendar retorno',
        responsavel: 'Equipe',
        prazo: '2026-12-01',
        prioridade: 'normal',
        estado: 'pendente',
        acaoOuJustificativa: '',
      },
    ],
    objetivos: [],
    relatos: [{ dataAcontecimento: '2026-11-03', descricao: '<img src=x onerror=alert(1)>' }],
  });
  expect(raiz.textContent).toContain('Informação insuficiente');
  expect(raiz.textContent).toContain('Agendar retorno');
  expect(raiz.textContent).toContain('2026-11-03');
  expect(raiz.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(raiz.querySelector('img')).toBeNull();
});

it('não exibe valor residual quando anamnese está desconhecida', () => {
  const raiz = document.createElement('div');
  montarResumoCasoLocal(raiz, {
    anamnese: {
      estado: 'desconhecido',
      valor: 'valor antigo',
      fonte: 'Equipe',
      data: '2026-11-01',
    },
    tarefas: [],
    objetivos: [],
    relatos: [],
  });
  expect(raiz.textContent).toContain('desconhecido');
  expect(raiz.textContent).not.toContain('valor antigo');
  expect(raiz.textContent).toContain('Nenhum objetivo não encerrado');
});

it('apresenta encaminhamentos e orientações registrados como texto', () => {
  const raiz = document.createElement('div');
  montarResumoCasoLocal(raiz, {
    anamnese: null,
    tarefas: [],
    objetivos: [],
    relatos: [],
    encaminhamentos: [
      {
        id: '1',
        destino: 'Serviço',
        motivo: 'Acompanhamento',
        responsavel: 'Equipe',
        estado: 'sugerido',
      },
    ],
    orientacoes: [
      {
        id: '1',
        texto: '<b>Orientação</b>',
        autor: 'Equipe',
        data: '2026-11-04',
        destinatarios: 'Família',
        validade: null,
        anterior: false,
      },
    ],
  });
  expect(raiz.textContent).toContain('Serviço · Acompanhamento · Equipe · sugerido');
  expect(raiz.textContent).toContain('<b>Orientação</b>');
  expect(raiz.querySelector('b')).toBeNull();
});
