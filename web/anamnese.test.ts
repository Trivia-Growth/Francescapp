// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { lerRoteiroAnamnese, montarAnamnese } from './anamnese.js';
import { FalhaApi } from './api.js';

it('atualiza pendências ao alterar estado no rascunho', async () => {
  const raiz = document.createElement('div');
  montarAnamnese(
    raiz,
    'paciente',
    {
      consultarAnamnese: vi.fn().mockResolvedValue({
        versao: 1,
        secoes: [{ id: 'História', camposEsperados: ['Relato'], respostas: [] }],
      }),
      salvarAnamnese: vi.fn(),
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Seções com pendências: História'));
  const estado = raiz.querySelector('select') as HTMLSelectElement;
  estado.value = 'informado';
  estado.dispatchEvent(new Event('change', { bubbles: true }));
  expect(raiz.textContent).toContain('Seções com pendências: História');
  const resposta = raiz.querySelector('textarea') as HTMLTextAreaElement;
  const [fonte, data] = raiz.querySelectorAll('fieldset input');
  if (!fonte || !data) throw new Error('Campos ausentes');
  resposta.value = 'Relato';
  fonte.value = 'Família';
  data.value = '2026-01-01';
  data.dispatchEvent(new Event('input', { bubbles: true }));
  expect(raiz.textContent).toContain('Nenhuma pendência identificada nos campos informados.');
  fonte.value = '';
  fonte.dispatchEvent(new Event('input', { bubbles: true }));
  expect(raiz.textContent).toContain('Seções com pendências: História');
  estado.value = 'pendente';
  estado.dispatchEvent(new Event('change', { bubbles: true }));
  expect(raiz.textContent).toContain('Seções com pendências: História');
});

it('mostra pendências e respostas recebidas sem interpretar conteúdo como HTML', async () => {
  const raiz = document.createElement('div');
  const servico = {
    salvarAnamnese: vi.fn(),
    consultarAnamnese: vi.fn().mockResolvedValue({
      versao: 1,
      secoes: [
        {
          id: 'História',
          camposEsperados: ['Relato', 'Outra'],
          respostas: [
            {
              campo: 'Relato',
              estado: 'informado',
              valor: '<img src=x>',
              fonte: 'Família',
              data: '2026-01-01',
            },
          ],
        },
      ],
    }),
  };
  montarAnamnese(raiz, 'paciente', servico, vi.fn());
  await vi.waitFor(() => expect(raiz.textContent).toContain('Seções com pendências: História'));
  expect(raiz.querySelector('textarea')?.value).toBe('<img src=x>');
  expect(raiz.querySelector('img')).toBeNull();
  expect(raiz.textContent).toContain('Pendente');
});

it('não apresenta dados ou sucesso quando consulta falha', async () => {
  const raiz = document.createElement('div');
  montarAnamnese(
    raiz,
    'paciente',
    {
      consultarAnamnese: vi.fn().mockRejectedValue(new Error()),
      salvarAnamnese: vi.fn(),
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Serviço indisponível'));
  expect(raiz.querySelector('form')).toBeNull();
});

it('repete somente por ação explícita e preserva chave e conteúdo após resposta perdida', async () => {
  const raiz = document.createElement('div');
  const salvarAnamnese = vi
    .fn()
    .mockRejectedValueOnce(new Error())
    .mockResolvedValue({ versao: 1, secoes: [] });
  montarAnamnese(
    raiz,
    'paciente',
    {
      consultarAnamnese: vi.fn().mockResolvedValue(null),
      salvarAnamnese,
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Não foi possível confirmar'));
  expect(salvarAnamnese).toHaveBeenCalledTimes(1);
  const retry = [...raiz.querySelectorAll('button')].find(
    (botao) => botao.textContent === 'Tentar confirmar salvamento',
  );
  retry?.click();
  await vi.waitFor(() => expect(salvarAnamnese).toHaveBeenCalledTimes(2));
  expect(salvarAnamnese.mock.calls[1]).toEqual(salvarAnamnese.mock.calls[0]);
});

it.each([401, 403])(
  'descarta dados e invalida acesso ao receber %s no salvamento',
  async (status) => {
    const raiz = document.createElement('div');
    const erro = new FalhaApi('sem_permissao', status);
    const acessoPerdido = vi.fn(() => expect(raiz.textContent).not.toContain('Dado clínico'));
    montarAnamnese(
      raiz,
      'paciente',
      {
        consultarAnamnese: vi.fn().mockResolvedValue({
          versao: 1,
          secoes: [
            {
              id: 'História',
              camposEsperados: ['Relato'],
              respostas: [
                {
                  campo: 'Relato',
                  estado: 'informado',
                  valor: 'Dado clínico',
                  fonte: 'Família',
                  data: '2026-01-01',
                },
              ],
            },
          ],
        }),
        salvarAnamnese: vi.fn().mockRejectedValue(erro),
      },
      acessoPerdido,
    );
    await vi.waitFor(() => expect(raiz.querySelector('textarea')?.value).toBe('Dado clínico'));
    raiz.querySelector('form')?.requestSubmit();
    await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledWith(erro));
    expect(raiz.childElementCount).toBe(0);
  },
);

it('permite tentar novamente após falha na consulta', async () => {
  const raiz = document.createElement('div');
  const consultarAnamnese = vi.fn().mockRejectedValueOnce(new Error()).mockResolvedValueOnce(null);
  montarAnamnese(raiz, 'paciente', { consultarAnamnese, salvarAnamnese: vi.fn() }, vi.fn());
  await vi.waitFor(() => expect(raiz.textContent).toContain('Serviço indisponível'));
  const botao = [...raiz.querySelectorAll('button')].find(
    (item) => item.textContent === 'Tentar novamente',
  );
  expect(botao).toBeDefined();
  botao?.click();
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  expect(consultarAnamnese).toHaveBeenCalledTimes(2);
});

it('preserva rascunho após conflito de versão e impede novo envio obsoleto', async () => {
  const raiz = document.createElement('div');
  const salvarAnamnese = vi.fn().mockRejectedValue(new FalhaApi('conflito_versao', 409));
  montarAnamnese(
    raiz,
    'paciente',
    {
      consultarAnamnese: vi.fn().mockResolvedValue({
        versao: 1,
        secoes: [
          {
            id: 'História',
            camposEsperados: ['Relato'],
            respostas: [
              {
                campo: 'Relato',
                estado: 'informado',
                valor: 'Original',
                fonte: 'Família',
                data: '2026-01-01',
              },
            ],
          },
        ],
      }),
      salvarAnamnese,
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.querySelector('textarea')?.value).toBe('Original'));
  const resposta = raiz.querySelector('textarea') as HTMLTextAreaElement;
  resposta.value = 'Rascunho';
  resposta.dispatchEvent(new Event('input', { bubbles: true }));
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Copie seu rascunho'));
  expect(resposta.value).toBe('Rascunho');
  raiz.querySelector('form')?.requestSubmit();
  expect(salvarAnamnese).toHaveBeenCalledTimes(1);
});

it('não descarta seção e campo digitados ao salvar antes de adicioná-los', async () => {
  const raiz = document.createElement('div');
  const salvarAnamnese = vi.fn().mockResolvedValue({ versao: 1, secoes: [] });
  montarAnamnese(
    raiz,
    'paciente',
    { consultarAnamnese: vi.fn().mockResolvedValue(null), salvarAnamnese },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const [secao, campo] = raiz.querySelectorAll('input');
  if (!secao || !campo) throw new Error('Campos ausentes');
  secao.value = 'História';
  campo.value = 'Rotina';
  raiz.querySelector('form')?.requestSubmit();
  expect(salvarAnamnese).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('Adicione o campo preenchido');
  expect(secao.value).toBe('História');
  expect(campo.value).toBe('Rotina');
  [...raiz.querySelectorAll('button')]
    .find((botao) => botao.textContent === 'Adicionar campo')
    ?.click();
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(salvarAnamnese).toHaveBeenCalledOnce());
  expect(salvarAnamnese.mock.calls[0]?.[1].secoes[0]).toMatchObject({
    id: 'História',
    camposEsperados: ['Rotina'],
  });
});

it('navega histórico sem substituir rascunho nem interpretar conteúdo como HTML', async () => {
  const raiz = document.createElement('div');
  const consultarHistoricoAnamnese = vi
    .fn()
    .mockResolvedValueOnce({
      versao: 2,
      criado_em: '2026-11-04T12:00:00Z',
      criado_por_usuario_id: 'autor',
      secoes: [
        {
          id: 'História',
          camposEsperados: ['Relato'],
          respostas: [
            {
              campo: 'Relato',
              estado: 'informado',
              valor: '<img src=x>',
              fonte: 'Família',
              data: '2026-01-01',
            },
          ],
        },
      ],
    })
    .mockResolvedValueOnce(null);
  montarAnamnese(
    raiz,
    'paciente',
    {
      consultarAnamnese: vi.fn().mockResolvedValue({ versao: 2, secoes: [] }),
      salvarAnamnese: vi.fn(),
      consultarHistoricoAnamnese,
    },
    vi.fn(),
    () => {},
    true,
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Consultar histórico'));
  const botao = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Consultar histórico',
  );
  if (!botao) throw new Error('Histórico ausente');
  botao.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('<img src=x>'));
  expect(raiz.querySelector('img')).toBeNull();
  expect(raiz.querySelector('form')).not.toBeNull();
  botao.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Não há outras versões.'));
  expect(consultarHistoricoAnamnese).toHaveBeenLastCalledWith('paciente', 2);
});

it('não oferece histórico enquanto integração não está habilitada', async () => {
  const raiz = document.createElement('div');
  montarAnamnese(
    raiz,
    'paciente',
    {
      consultarAnamnese: vi.fn().mockResolvedValue(null),
      salvarAnamnese: vi.fn(),
      consultarHistoricoAnamnese: vi.fn(),
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Nenhuma pergunta registrada ainda.'));
  expect(raiz.textContent).not.toContain('Consultar histórico');
});

it('abre formulário durante consulta de disponibilidade e preserva rascunho ao habilitar histórico', async () => {
  const raiz = document.createElement('div');
  let resolver!: (valor: boolean) => void;
  const disponibilidade = new Promise<boolean>((resolve) => {
    resolver = resolve;
  });
  montarAnamnese(
    raiz,
    'paciente',
    {
      consultarAnamnese: vi.fn().mockResolvedValue(null),
      salvarAnamnese: vi.fn(),
      consultarHistoricoAnamnese: vi.fn(),
    },
    vi.fn(),
    () => {},
    disponibilidade,
  );
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const campo = raiz.querySelector<HTMLInputElement>('input');
  if (!campo) throw new Error('Campo ausente');
  campo.value = 'rascunho';
  resolver(true);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Consultar histórico'));
  expect(campo.value).toBe('rascunho');
  expect(raiz.contains(campo)).toBe(true);
});

it('mantém formulário disponível quando consulta de disponibilidade falha', async () => {
  const raiz = document.createElement('div');
  montarAnamnese(
    raiz,
    'paciente',
    {
      consultarAnamnese: vi.fn().mockResolvedValue(null),
      salvarAnamnese: vi.fn(),
      consultarHistoricoAnamnese: vi.fn(),
    },
    vi.fn(),
    () => {},
    Promise.reject(new Error('indisponível')),
  );
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  expect(raiz.textContent).not.toContain('Consultar histórico');
});

it('ignora disponibilidade tardia após desmontar e trocar paciente', async () => {
  const raiz = document.createElement('div');
  let resolver!: (valor: boolean) => void;
  const disponibilidade = new Promise<boolean>((resolve) => {
    resolver = resolve;
  });
  const servico = {
    consultarAnamnese: vi.fn().mockResolvedValue(null),
    salvarAnamnese: vi.fn(),
    consultarHistoricoAnamnese: vi.fn(),
  };
  const desmontar = montarAnamnese(
    raiz,
    'paciente-antigo',
    servico,
    vi.fn(),
    () => {},
    disponibilidade,
  );
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  desmontar();
  montarAnamnese(raiz, 'paciente-novo', servico, vi.fn());
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  resolver(true);
  await disponibilidade;
  await Promise.resolve();
  expect(raiz.textContent).not.toContain('Consultar histórico');
  expect(servico.consultarHistoricoAnamnese).not.toHaveBeenCalled();
});

it('lê o roteiro do catálogo e ignora linha torta sem derrubar a tela', () => {
  expect(
    lerRoteiroAnamnese([
      'Motivo e expectativa :: O que trouxe a família',
      'Rotina e autonomia::O que faz sozinho',
      'sem separador',
      ' :: pergunta sem seção',
      'Seção sem pergunta :: ',
      'Motivo e expectativa :: O que trouxe a família',
    ]),
  ).toEqual([
    { secao: 'Motivo e expectativa', campo: 'O que trouxe a família' },
    { secao: 'Rotina e autonomia', campo: 'O que faz sozinho' },
  ]);
});

it('oferece as perguntas do roteiro que vem do servidor, não uma lista fixa', async () => {
  const raiz = document.createElement('div');
  montarAnamnese(
    raiz,
    'paciente',
    {
      consultarAnamnese: vi.fn().mockResolvedValue({ versao: 1, secoes: [] }),
      salvarAnamnese: vi.fn(),
    },
    vi.fn(),
    () => {},
    false,
    Promise.resolve(['Pontos fortes e barreiras :: O que funciona bem']),
  );
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Pontos fortes e barreiras — O que funciona bem'),
  );
});

it('não sugere nada quando o catálogo está vazio, e a anamnese continua utilizável', async () => {
  const raiz = document.createElement('div');
  montarAnamnese(
    raiz,
    'paciente',
    {
      consultarAnamnese: vi.fn().mockResolvedValue({ versao: 1, secoes: [] }),
      salvarAnamnese: vi.fn(),
    },
    vi.fn(),
    () => {},
    false,
    Promise.resolve([]),
  );
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  expect(raiz.textContent).not.toContain('Perguntas sugeridas');
  expect(raiz.textContent).toContain('Outra seção');
});
