// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { montarRelatoTextual } from './relato-textual.ts';

describe('preparação local do relato', () => {
  it('valida campos obrigatórios e revisa conteúdo fictício como texto, sem envio', () => {
    const raiz = document.createElement('div');
    const desmontar = montarRelatoTextual(raiz);
    const form = raiz.querySelector('form');
    if (!form) throw new Error('Formulário ausente');
    const status = raiz.querySelector('[role=status]');
    if (!status) throw new Error('Estado ausente');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(status.textContent).toContain('Informe uma data válida');
    const data = raiz.querySelector('input[type=date]') as HTMLInputElement;
    const descricao = raiz.querySelector('textarea') as HTMLTextAreaElement;
    data.value = '2026-11-04';
    descricao.value = '<img src=x onerror=alert(1)>';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(status.textContent).toContain('Nada foi salvo ou enviado');
    expect(raiz.querySelector('section')?.textContent).toContain(descricao.value);
    expect(raiz.querySelector('img')).toBeNull();
    descricao.dispatchEvent(new Event('input', { bubbles: true }));
    expect(raiz.querySelector('section')?.textContent).toBe('');
    desmontar();
    expect(raiz.childElementCount).toBe(0);
  });
});
