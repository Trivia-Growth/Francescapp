// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { montarCamposSintese } from './modelo-sintese.ts';
import { montarDiario } from './diario.ts';

it('compartilha campos FR009 sem colidir IDs e preserva validação do contrato', () => {
  const diario = document.createElement('form');
  const passagem = document.createElement('form');
  const a = montarCamposSintese(diario, ['Área configurada'], 'diario');
  const b = montarCamposSintese(passagem, ['Área configurada'], 'passagem');
  expect(a.atividade.id).not.toBe(b.atividade.id);
  expect(a.ler()).toBeUndefined();
  a.data.value = '2026-11-18';
  a.atividade.value = 'Atividade fictícia';
  expect(a.ler()).toMatchObject({
    data: '2026-11-18',
    area: 'Área configurada',
    atividade: 'Atividade fictícia',
  });
  a.atividade.value = 'x'.repeat(2001);
  expect(a.ler()).toBeUndefined();
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
    (destino, confirmar) => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.textContent = 'Áudio fictício';
      botao.onclick = () => confirmar('Texto revisado fictício');
      destino.append(botao);
      return () => destino.replaceChildren();
    },
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
