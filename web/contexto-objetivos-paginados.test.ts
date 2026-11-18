// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarContextoCuidado, type ConsultaObjetivosContexto } from './contexto-cuidado.ts';
import { FalhaApi } from './api.ts';
const paciente = '33333333-3333-4333-8333-333333333333';
const primeiro = '44444444-4444-4444-8444-444444444444';
const segundo = '55555555-5555-4555-8555-555555555555';
const antigo = '66666666-6666-4666-8666-666666666666';
const esperar = () => new Promise((resolve) => setTimeout(resolve, 0));
function montar(consultarObjetivos: ConsultaObjetivosContexto, vinculados: string[] = []) {
  const raiz = document.createElement('div');
  const salvar = vi.fn(async (_paciente: string, versao: number, conteudo: unknown) => ({
    versao: versao + 1,
    conteudo: conteudo as never,
  }));
  const acessoPerdido = vi.fn();
  const desmontar = montarContextoCuidado(
    raiz,
    paciente,
    {
      consultar: async () => ({
        versao: 1,
        conteudo: [
          {
            id: 'rotina-ficticia',
            categoria: 'rotina' as const,
            descricao: 'Rotina fictícia',
            objetivos: vinculados,
          },
        ],
      }),
      salvar,
    },
    acessoPerdido,
    () => {},
    [],
    consultarObjetivos,
  );
  return { raiz, salvar, acessoPerdido, desmontar };
}
function botao(raiz: HTMLElement, texto: string) {
  const encontrado = [...raiz.querySelectorAll('button')].find(
    (button) => button.textContent === texto,
  );
  if (!encontrado) throw new Error(`Botão ausente: ${texto}`);
  return encontrado;
}
function enviar(raiz: HTMLElement) {
  raiz
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

it('busca apenas primeira página do mesmo caso e mantém seleção ao carregar mais', async () => {
  const consultar = vi
    .fn<ConsultaObjetivosContexto>()
    .mockResolvedValueOnce({
      itens: [{ id: primeiro, titulo: 'Primeiro objetivo' }],
      proximo_cursor: 'pagina-2',
    })
    .mockResolvedValueOnce({
      itens: [{ id: segundo, titulo: 'Segundo objetivo' }],
      proximo_cursor: null,
    });
  const { raiz, salvar } = montar(consultar);
  await esperar();
  expect(consultar).toHaveBeenCalledOnce();
  expect(consultar).toHaveBeenCalledWith(paciente, undefined);
  const caixa = raiz.querySelector<HTMLInputElement>(`input[value="${primeiro}"]`);
  if (!caixa) throw new Error('Primeira escolha ausente');
  caixa.checked = true;
  botao(raiz, 'Carregar mais objetivos').click();
  await esperar();
  expect(consultar).toHaveBeenNthCalledWith(2, paciente, 'pagina-2');
  expect(raiz.querySelector<HTMLInputElement>(`input[value="${primeiro}"]`)?.checked).toBe(true);
  expect(raiz.querySelector(`input[value="${segundo}"]`)).not.toBeNull();
  expect(botao(raiz, 'Carregar mais objetivos').hidden).toBe(true);
  enviar(raiz);
  await esperar();
  expect(salvar.mock.calls[0]?.[2]).toMatchObject([{ objetivos: [primeiro] }]);
});

it('falha de objetivos preserva rascunho/vínculos e permite tentar mesma página novamente', async () => {
  const consultar = vi
    .fn<ConsultaObjetivosContexto>()
    .mockRejectedValueOnce(new FalhaApi('servico_indisponivel', 503))
    .mockResolvedValue({ itens: [], proximo_cursor: null });
  const { raiz, salvar } = montar(consultar, [antigo]);
  await esperar();
  expect(raiz.textContent).toContain('Seus vínculos anteriores continuam guardados');
  const descricao = raiz.querySelector('textarea');
  if (!descricao) throw new Error('Descrição ausente');
  descricao.value = 'Rascunho preservado';
  botao(raiz, 'Tentar carregar objetivos novamente').click();
  await esperar();
  expect(consultar).toHaveBeenNthCalledWith(2, paciente, undefined);
  expect(descricao.value).toBe('Rascunho preservado');
  enviar(raiz);
  await esperar();
  expect(salvar.mock.calls[0]?.[2]).toMatchObject([
    { descricao: 'Rascunho preservado', objetivos: [antigo] },
  ]);
});

it('objetivo antes preservado vira escolha marcada e pode ser desvinculado explicitamente', async () => {
  const consultar = vi.fn<ConsultaObjetivosContexto>().mockResolvedValue({
    itens: [{ id: antigo, titulo: 'Objetivo existente' }],
    proximo_cursor: null,
  });
  const { raiz, salvar } = montar(consultar, [antigo]);
  await esperar();
  const caixa = raiz.querySelector<HTMLInputElement>(`input[value="${antigo}"]`);
  expect(caixa?.checked).toBe(true);
  if (!caixa) throw new Error('Escolha ausente');
  caixa.checked = false;
  enviar(raiz);
  await esperar();
  expect(salvar.mock.calls[0]?.[2]).toMatchObject([{ objetivos: [] }]);
});

it('mostra carregamento e ignora resposta depois de desmontar', async () => {
  let resolver!: (pagina: Awaited<ReturnType<ConsultaObjetivosContexto>>) => void;
  const consultar = vi.fn<ConsultaObjetivosContexto>(
    () =>
      new Promise((resolve) => {
        resolver = resolve;
      }),
  );
  const { raiz, desmontar, acessoPerdido } = montar(consultar);
  await esperar();
  expect(raiz.textContent).toContain('Carregando objetivos do plano');
  desmontar();
  resolver({ itens: [{ id: primeiro, titulo: 'Não reaparecer' }], proximo_cursor: null });
  await esperar();
  expect(raiz.childElementCount).toBe(0);
  expect(acessoPerdido).not.toHaveBeenCalled();
});

it('encerra editor em perda de acesso à consulta, sem preservar escolhas de outro acesso', async () => {
  const consultar = vi
    .fn<ConsultaObjetivosContexto>()
    .mockRejectedValue(new FalhaApi('nao_autenticado', 401));
  const { raiz, acessoPerdido, salvar } = montar(consultar);
  await esperar();
  expect(acessoPerdido).toHaveBeenCalledOnce();
  expect(raiz.childElementCount).toBe(0);
  expect(salvar).not.toHaveBeenCalled();
});
