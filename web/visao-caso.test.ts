// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { FalhaApi } from './api.js';
import { montarVisaoCaso, type FontesVisaoCaso } from './visao-caso.js';

const id = '10000000-0000-4000-8000-000000000001';
const paciente = { id, nome: 'Helena Fictícia', nome_preferencia: 'Lena' };

let raiz: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="raiz"></div>';
  raiz = document.getElementById('raiz') as HTMLElement;
});

const objetivo = (descricao: string, estado: string, data = '2026-11-02T12:00:00Z') => ({
  objetivo_id: id,
  versao: 1,
  data,
  objetivo: {
    descricao,
    area: 'rotina',
    responsavel: 'Equipe',
    situacaoInicial: 'inicial',
    observacaoProgresso: 'nenhuma',
    dataRevisao: '2026-12-01',
    estado,
  },
});
const tarefa = (descricao: string, estado: string, data = '2026-11-05T12:00:00Z') => ({
  tarefa_id: id,
  versao: 1,
  ator_usuario_id: id,
  data,
  tarefa: { descricao, responsavel: 'Equipe', prazo: '2026-11-20', prioridade: 'alta', estado },
});
const anamnese = {
  versao: 1,
  criado_em: '2026-11-03T12:00:00Z',
  secoes: [
    {
      id: 'Rotina',
      camposEsperados: ['sono', 'alimentacao'],
      respostas: [
        {
          campo: 'sono',
          estado: 'informado',
          valor: 'regular',
          fonte: 'familia',
          data: '2026-11-01',
        },
      ],
    },
    {
      id: 'Saúde',
      camposEsperados: ['alergias'],
      respostas: [
        { campo: 'alergias', estado: 'nao_se_aplica', fonte: 'familia', data: '2026-11-01' },
      ],
    },
  ],
};

const fontes = (parcial: Record<string, unknown> = {}) =>
  ({
    objetivos: {
      consultarObjetivos: async () => ({
        itens: [
          objetivo('Caminhar todos os dias', 'em andamento'),
          objetivo('Objetivo já encerrado', 'encerrado'),
        ],
        proximo_cursor: null,
      }),
    },
    tarefas: {
      consultarTarefas: async () => [
        tarefa('Ligar para a família', 'pendente'),
        tarefa('Tarefa concluída', 'concluida'),
      ],
    },
    anamnese: { consultarAnamnese: async () => anamnese },
    ...parcial,
  }) as unknown as FontesVisaoCaso;

const bloco = (nome: string) => raiz.querySelector(`[data-bloco="${nome}"]`) as HTMLElement;
const aguardar = () => new Promise((resolve) => setTimeout(resolve, 0));

it('apresenta cada bloco com dados consultados e a data da última atualização', async () => {
  montarVisaoCaso(raiz, paciente, fontes(), () => false);
  await vi.waitFor(() => expect(bloco('anamnese').textContent).toContain('Atualizado em'));
  expect(bloco('identificacao').textContent).toContain('Helena Fictícia');
  expect(bloco('identificacao').textContent).toContain('Nome de preferência: Lena');
  expect(bloco('objetivos').textContent).toContain('Caminhar todos os dias');
  expect(bloco('objetivos').textContent).not.toContain('Objetivo já encerrado');
  expect(bloco('objetivos').textContent).toContain('Revisão prevista: 01/12/2026');
  expect(bloco('objetivos').textContent).toContain('Atualizado em 02/11/2026.');
  expect(bloco('tarefas').textContent).toContain('Ligar para a família');
  expect(bloco('tarefas').textContent).not.toContain('Tarefa concluída');
  expect(bloco('tarefas').textContent).toContain('Atualizado em 05/11/2026.');
  expect(bloco('anamnese').textContent).toContain('Seções com pendências:');
  expect(bloco('anamnese').textContent).toContain('Rotina');
  expect(bloco('anamnese').textContent).not.toContain('Saúde');
  expect(bloco('anamnese').textContent).toContain('Atualizado em 03/11/2026.');
});

it('indica atenção, agenda e próxima revisão como indisponíveis, sem valor de exemplo', async () => {
  montarVisaoCaso(raiz, paciente, fontes(), () => false);
  await vi.waitFor(() => expect(bloco('objetivos').textContent).toContain('Caminhar'));
  const texto = bloco('indisponivel').textContent ?? '';
  expect(texto).toContain('Situação do caso e responsável: indisponíveis nesta versão');
  expect(texto).toContain('Mudanças recentes: indisponíveis nesta versão');
  expect(texto).toContain('Atenção sinalizada por profissional: indisponível nesta versão');
  expect(texto).toContain('Agenda: indisponível nesta versão');
  expect(texto).toContain('Próxima revisão: indisponível nesta versão');
});

it('distingue carregando, vazio e erro com nova tentativa só no bloco que falhou', async () => {
  let tentativa = 0;
  let liberar!: () => void;
  const espera = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  montarVisaoCaso(
    raiz,
    paciente,
    fontes({
      objetivos: {
        consultarObjetivos: async () => {
          await espera;
          return { itens: [], proximo_cursor: null };
        },
      },
      tarefas: {
        consultarTarefas: async () => {
          tentativa += 1;
          if (tentativa === 1) throw new FalhaApi('servico_indisponivel', 503);
          return [tarefa('Ligar para a família', 'pendente')];
        },
      },
    }),
    () => false,
  );
  expect(bloco('objetivos').textContent).toContain('Carregando…');
  expect(bloco('objetivos').textContent).not.toContain('Nenhum objetivo');
  await vi.waitFor(() => expect(bloco('tarefas').textContent).toContain('Tentar novamente'));
  expect(bloco('tarefas').textContent).toContain('Este bloco não foi carregado.');
  expect(bloco('tarefas').textContent).not.toContain('Nenhuma tarefa');
  await vi.waitFor(() => expect(bloco('anamnese').textContent).toContain('Atualizado em'));
  liberar();
  await vi.waitFor(() =>
    expect(bloco('objetivos').textContent).toContain('Nenhum objetivo ativo nesta consulta.'),
  );
  bloco('tarefas').querySelector('button')?.click();
  await vi.waitFor(() => expect(bloco('tarefas').textContent).toContain('Ligar para a família'));
  expect(bloco('tarefas').textContent).not.toContain('Tentar novamente');
});

it('não mostra título nem contagem de bloco que o perfil não lê', async () => {
  montarVisaoCaso(raiz, paciente, fontes({ tarefas: undefined, anamnese: undefined }), () => false);
  await vi.waitFor(() => expect(bloco('objetivos').textContent).toContain('Caminhar'));
  expect(raiz.textContent).not.toContain('Tarefas');
  expect(raiz.textContent).not.toContain('Ligar para a família');
  expect(raiz.textContent).not.toContain('Anamnese');
  expect(bloco('tarefas')).toBeNull();
  expect(bloco('anamnese')).toBeNull();
});

it('avisa quando há mais objetivos do que a consulta mostra', async () => {
  montarVisaoCaso(
    raiz,
    paciente,
    fontes({
      objetivos: {
        consultarObjetivos: async () => ({
          itens: [objetivo('Caminhar todos os dias', 'em andamento')],
          proximo_cursor: 'proximo',
        }),
      },
    }),
    () => false,
  );
  await vi.waitFor(() =>
    expect(bloco('objetivos').textContent).toContain(
      'Há mais objetivos no Plano de cuidado; esta visão mostra só os primeiros.',
    ),
  );
});

it('ao perder o acesso remove o conteúdo e aciona o fluxo de nova entrada', async () => {
  const acessoPerdido = vi.fn(() => true);
  montarVisaoCaso(
    raiz,
    paciente,
    fontes({
      tarefas: {
        consultarTarefas: async () => {
          throw new FalhaApi('sem_permissao', 403);
        },
      },
    }),
    acessoPerdido,
  );
  await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledTimes(1));
  expect(raiz.textContent).toBe('');
  await aguardar();
  expect(raiz.textContent).toBe('');
});

it('invalida respostas pendentes ao desmontar', async () => {
  let responder!: (valor: unknown) => void;
  const desmontar = montarVisaoCaso(
    raiz,
    paciente,
    fontes({
      tarefas: {
        consultarTarefas: () =>
          new Promise((resolve) => {
            responder = resolve;
          }),
      },
    }),
    () => false,
  );
  await vi.waitFor(() => expect(responder).toBeDefined());
  desmontar();
  expect(raiz.textContent).toBe('');
  responder([tarefa('Dado do paciente anterior', 'pendente')]);
  await aguardar();
  expect(raiz.textContent).toBe('');
});
