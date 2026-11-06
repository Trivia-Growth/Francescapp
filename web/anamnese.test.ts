// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { montarAnamnese } from './anamnese.js';
import { FalhaApi } from './api.js';

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
