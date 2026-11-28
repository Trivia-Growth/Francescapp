// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { type ComponentProps, createElement } from 'react';
import { expect, it } from 'vitest';
import { CamposSintese, controleSintese, lerSintese } from './modelo-sintese.js';
import { TelaDiario } from './diario.js';

function montarDiario(
  raiz: HTMLElement,
  pacienteId: ComponentProps<typeof TelaDiario>['pacienteId'],
  usuarioId: ComponentProps<typeof TelaDiario>['usuarioId'],
  servico: ComponentProps<typeof TelaDiario>['servico'],
  obterAreas: ComponentProps<typeof TelaDiario>['obterAreas'],
  acessoPerdido: ComponentProps<typeof TelaDiario>['acessoPerdido'],
  alteracaoPendente: ComponentProps<typeof TelaDiario>['alteracaoPendente'] = () => {},
  converterEmTarefa: ComponentProps<typeof TelaDiario>['converterEmTarefa'] = undefined,
  montarEntradaPorAudio: ComponentProps<typeof TelaDiario>['montarEntradaPorAudio'] = undefined,
  ehFamilia: ComponentProps<typeof TelaDiario>['ehFamilia'] = false,
) {
  const painel = render(
    createElement(TelaDiario, {
      pacienteId,
      usuarioId,
      servico,
      obterAreas,
      acessoPerdido,
      alteracaoPendente,
      converterEmTarefa,
      montarEntradaPorAudio,
      ehFamilia,
    }),
    { container: raiz },
  );
  return () => painel.rerender(null);
}

it('compartilha campos FR009 sem colidir IDs e preserva validação do contrato', () => {
  const diario = document.createElement('form');
  const passagem = document.createElement('form');
  const areas = ['Área configurada'];
  render(createElement(CamposSintese, { areas, prefixo: 'diario' }), { container: diario });
  render(createElement(CamposSintese, { areas, prefixo: 'passagem' }), { container: passagem });
  const atividade = controleSintese(diario, 'diario', 'atividade');
  const data = controleSintese(diario, 'diario', 'data');
  const atividadePassagem = controleSintese(passagem, 'passagem', 'atividade');
  if (!atividade || !data || !atividadePassagem) throw new Error('Campos de síntese ausentes.');
  expect(atividade.id).not.toBe(atividadePassagem.id);
  expect(lerSintese(diario, 'diario')).toBeUndefined();
  data.value = '2026-11-18';
  atividade.value = 'Atividade fictícia';
  expect(lerSintese(diario, 'diario')).toMatchObject({
    data: '2026-11-18',
    area: 'Área configurada',
    atividade: 'Atividade fictícia',
  });
  atividade.value = 'x'.repeat(2001);
  expect(lerSintese(diario, 'diario')).toBeUndefined();
});
it('Diário mantém campos, rascunho, publicação e entrada por áudio após extração', async () => {
  const raiz = document.createElement('div');
  montarDiario(
    raiz,
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    {
      consultar: async () => [],
      salvar: async () => {
        throw new Error('Não deve salvar neste teste');
      },
    },
    () => ['Área configurada'],
    () => {},
    () => {},
    undefined,
    /* Dublê da entrada por áudio. Desde 27/11/2026 ela chega como componente, e não como
       função que escreve DOM no contêiner: o botão é o mesmo, a asserção é a mesma. */
    (confirmar) =>
      createElement(
        'button',
        { type: 'button', onClick: () => confirmar('Texto revisado fictício') },
        'Áudio fictício',
      ),
  );
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(raiz.textContent).toContain('Observações compartilháveis');
  expect(raiz.textContent).toContain('Salvar rascunho');
  expect(raiz.textContent).toContain('Publicar');
  const audio = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Áudio fictício',
  );
  if (!audio) throw new Error('Entrada por áudio ausente');
  audio.click();
  const atividade = raiz.querySelector<HTMLTextAreaElement>('[id$="-atividade"]');
  expect(atividade?.value).toBe('Texto revisado fictício');
});
