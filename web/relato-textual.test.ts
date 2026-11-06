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
    expect(data.getAttribute('aria-invalid')).toBe('true');
    expect(descricao.getAttribute('aria-invalid')).toBe('true');
    data.value = '2026-11-04';
    data.dispatchEvent(new Event('input', { bubbles: true }));
    expect(data.hasAttribute('aria-invalid')).toBe(false);
    descricao.value = '   ';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(status.textContent).toContain('Informe uma descrição');
    expect(descricao.getAttribute('aria-invalid')).toBe('true');
    descricao.value = '<img src=x onerror=alert(1)>';
    descricao.dispatchEvent(new Event('input', { bubbles: true }));
    expect(descricao.hasAttribute('aria-invalid')).toBe(false);
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
