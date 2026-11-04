// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarDocumentosLocais } from './documentos-locais';

it('registra e lista metadados fictícios sem interpretar HTML', async () => {
  const raiz = document.createElement('div');
  const documentos: { nome: string; categoria: string; metadados?: string }[] = [];
  const aoRegistrar = vi.fn(async () => {});
  montarDocumentosLocais(raiz, { documentos, aoRegistrar });
  expect(raiz.textContent).toContain('Nenhum documento registrado');
  const campos = raiz.querySelectorAll('input');
  campos[0].value = ' <img src=x> ';
  campos[1].value = ' Exame ';
  campos[2].value = ' Referência fictícia ';
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(documentos).toHaveLength(1));
  expect(documentos).toEqual([
    { nome: '<img src=x>', categoria: 'Exame', metadados: 'Referência fictícia' },
  ]);
  expect(aoRegistrar).toHaveBeenCalledWith(documentos[0]);
  expect(raiz.textContent).toContain('<img src=x>');
  expect(raiz.querySelector('img')).toBeNull();
});

it('rejeita campos obrigatórios compostos apenas por espaços', () => {
  const raiz = document.createElement('div');
  const documentos: { nome: string; categoria: string }[] = [];
  montarDocumentosLocais(raiz, { documentos, aoRegistrar: async () => {} });
  const campos = raiz.querySelectorAll('input');
  campos[0].value = '  ';
  campos[1].value = 'Exame';
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(documentos).toHaveLength(0);
  expect(raiz.textContent).toContain('Informe nome e categoria');
});

it('preserva rascunho após falha e só confirma depois da gravação', async () => {
  const raiz = document.createElement('div');
  const documentos: { nome: string; categoria: string }[] = [];
  const gravar = vi.fn().mockRejectedValueOnce(new Error('falha')).mockResolvedValueOnce(undefined);
  montarDocumentosLocais(raiz, { documentos, aoRegistrar: gravar });
  const campos = raiz.querySelectorAll('input');
  campos[0].value = 'Documento fictício';
  campos[1].value = 'Exame';
  const form = raiz.querySelector('form');
  form?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(raiz.textContent).toContain('rascunho foi preservado'));
  expect(documentos).toHaveLength(0);
  expect(campos[0].value).toBe('Documento fictício');
  form?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(raiz.textContent).toContain('Documento registrado'));
  expect(documentos).toHaveLength(1);
});
