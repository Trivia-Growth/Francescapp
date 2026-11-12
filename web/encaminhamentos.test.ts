// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarEncaminhamentos } from './encaminhamentos';

const registro = (sobrepor: Record<string, unknown> = {}) => ({
  encaminhamento_id: '00000000-0000-4000-8000-000000000001',
  versao: 2,
  etapa: 'retorno_pendente' as const,
  destino: 'Serviço fictício',
  motivo: 'Motivo fictício',
  responsavel: 'Profissional fictício',
  ...sobrepor,
});

it('traduz a etapa do banco para o rótulo da equipe e revisa com a versão vigente', async () => {
  const raiz = document.createElement('div');
  const consultar = vi.fn(async () => [registro()]);
  const salvar = vi.fn(async () => registro({ versao: 3, etapa: 'concluido' }));
  const encerrar = montarEncaminhamentos(
    raiz,
    '40000000-0000-4000-8000-000000000001',
    { consultar, salvar },
    () => {
      throw new Error('acesso não deveria cair');
    },
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('retorno pendente'));

  (raiz.querySelector('li button') as HTMLButtonElement).click();
  (raiz.querySelector('select') as HTMLSelectElement).value = 'concluído';
  (raiz.querySelector('form') as HTMLFormElement).dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  // Versão 2 é a vigente lida na consulta: revisar sem ela viraria conflito no banco.
  await vi.waitFor(() =>
    expect(salvar).toHaveBeenCalledWith(
      '40000000-0000-4000-8000-000000000001',
      expect.objectContaining({
        encaminhamento_id: '00000000-0000-4000-8000-000000000001',
        versao_esperada: 2,
        etapa: 'concluido',
      }),
    ),
  );
  encerrar();
  expect(raiz.childNodes).toHaveLength(0);
});

it('cria com versão esperada zero e sem identificador', async () => {
  const raiz = document.createElement('div');
  const consultar = vi.fn(async () => []);
  const salvar = vi.fn(async () => registro({ versao: 1, etapa: 'sugerido' }));
  montarEncaminhamentos(
    raiz,
    '40000000-0000-4000-8000-000000000001',
    { consultar, salvar },
    () => {},
  );
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const campos = raiz.querySelectorAll('input');
  campos[0].value = 'Serviço fictício';
  campos[1].value = 'Motivo fictício';
  campos[2].value = 'Profissional fictício';
  (raiz.querySelector('form') as HTMLFormElement).dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await vi.waitFor(() => expect(salvar).toHaveBeenCalled());
  const entrada = salvar.mock.calls[0]?.[1] as Record<string, unknown>;
  expect(entrada.versao_esperada).toBe(0);
  expect(entrada).not.toHaveProperty('encaminhamento_id');
});

it('mostra falha de carregamento sem derrubar o acesso', async () => {
  const raiz = document.createElement('div');
  const acessoPerdido = vi.fn();
  montarEncaminhamentos(
    raiz,
    '40000000-0000-4000-8000-000000000001',
    {
      consultar: async () => {
        throw new Error('indisponível');
      },
      salvar: async () => registro(),
    },
    acessoPerdido,
  );
  await vi.waitFor(() => expect(raiz.textContent).not.toContain('Carregando'));
  expect(acessoPerdido).not.toHaveBeenCalled();
  expect(raiz.querySelector('[role="status"]')?.textContent).toBeTruthy();
});
