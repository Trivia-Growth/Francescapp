// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { CATEGORIAS_CONTEXTO } from '../packages/contracts/src/contexto-cuidado.ts';
import { VINCULOS_REDE } from '../packages/contracts/src/rede-cuidado.ts';
import { FalhaApi } from './api.ts';
import { montarContextoCuidado } from './contexto-cuidado.ts';
import { montarRedeCuidado } from './rede-cuidado.ts';

const paciente = '33333333-3333-4333-8333-333333333333';
const objetivo = '44444444-4444-4444-8444-444444444444';
const esperar = () => new Promise((resolver) => setTimeout(resolver, 0));

describe('tela de contexto do cuidado (FR-005)', () => {
  it('oferece as seis categorias do requisito e salva o vínculo com objetivo', async () => {
    const salvar = vi.fn(async (_p: string, versao: number, conteudo: unknown) => ({
      versao: versao + 1,
      conteudo: conteudo as never,
    }));
    const raiz = document.createElement('div');
    montarContextoCuidado(
      raiz,
      paciente,
      { consultar: async () => null, salvar },
      () => {
        throw new Error('não deveria perder acesso');
      },
      () => {},
      [{ id: objetivo, titulo: 'Caminhar 20 minutos' }],
    );
    await esperar();
    const legendas = [...raiz.querySelectorAll('legend')].map((l) => l.textContent);
    expect(legendas).toHaveLength(CATEGORIAS_CONTEXTO.length);
    expect(legendas).toContain('O que o paciente considera importante');
    expect(raiz.textContent).toContain('Nenhum elemento registrado');

    const adicionar = [...raiz.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('Adicionar em rotina'),
    );
    if (!adicionar) throw new Error('Botão de adicionar ausente');
    adicionar.click();
    const descricao = raiz.querySelector('textarea') as HTMLTextAreaElement;
    // Todo campo tem rótulo associado: a tela precisa funcionar em leitor de tela.
    expect(raiz.querySelector(`label[for="${descricao.id}"]`)).not.toBeNull();
    const caixa = raiz.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(caixa.value).toBe(objetivo);
    caixa.checked = true;

    const form = raiz.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await esperar();
    // Elemento em branco não é enviado; o aviso pede preenchimento.
    expect(salvar).not.toHaveBeenCalled();
    expect(raiz.textContent).toContain('Preencha ou remova');

    descricao.value = 'Acorda às 6h';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await esperar();
    expect(salvar).toHaveBeenCalledOnce();
    const enviado = salvar.mock.calls[0]?.[2] as { categoria: string; objetivos: string[] }[];
    expect(enviado[0]).toMatchObject({ categoria: 'rotina', objetivos: [objetivo] });
  });

  it('preserva vínculo com objetivo que não tem caixa na tela', async () => {
    const salvar = vi.fn(async (_p: string, versao: number, conteudo: unknown) => ({
      versao: versao + 1,
      conteudo: conteudo as never,
    }));
    const raiz = document.createElement('div');
    // Montada sem a lista de objetivos (o caso de objetivo arquivado ou de lista
    // não carregada): salvar não pode apagar o vínculo que já estava guardado.
    montarContextoCuidado(
      raiz,
      paciente,
      {
        consultar: async () => ({
          versao: 3,
          conteudo: [
            {
              id: 'r1',
              categoria: 'rotina' as const,
              descricao: 'Acorda às 6h',
              objetivos: [objetivo],
            },
          ],
        }),
        salvar,
      },
      () => {
        throw new Error('não deveria perder acesso');
      },
    );
    await esperar();
    expect(raiz.querySelector('input[type=checkbox]')).toBeNull();
    expect(raiz.textContent).toContain('continuam guardados');
    (raiz.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await esperar();
    expect(salvar).toHaveBeenCalledOnce();
    expect(salvar.mock.calls[0]?.[1]).toBe(3);
    const enviado = salvar.mock.calls[0]?.[2] as { objetivos: string[] }[];
    expect(enviado[0]?.objetivos).toEqual([objetivo]);
  });

  it('avisa conflito de versão sem perder o rascunho da pessoa', async () => {
    const raiz = document.createElement('div');
    montarContextoCuidado(
      raiz,
      paciente,
      {
        consultar: async () => null,
        salvar: async () => {
          throw new FalhaApi('conflito_versao', 409);
        },
      },
      () => {
        throw new Error('não deveria perder acesso');
      },
    );
    await esperar();
    const adicionar = [...raiz.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('Adicionar em barreiras'),
    );
    adicionar?.click();
    const descricao = raiz.querySelector('textarea') as HTMLTextAreaElement;
    descricao.value = 'Mora longe do posto';
    (raiz.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await esperar();
    expect(raiz.textContent).toContain('alterado por outra pessoa');
    expect((raiz.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      'Mora longe do posto',
    );
  });
});

describe('tela de rede de cuidado (FR-002)', () => {
  it('oferece os sete vínculos, aceita mais de um por pessoa e avisa que não dá acesso', async () => {
    const salvar = vi.fn(async (_p: string, versao: number, conteudo: unknown) => ({
      versao: versao + 1,
      conteudo: conteudo as never,
    }));
    const raiz = document.createElement('div');
    montarRedeCuidado(raiz, paciente, { consultar: async () => null, salvar }, () => {
      throw new Error('não deveria perder acesso');
    });
    await esperar();
    const adicionar = [...raiz.querySelectorAll('button')].find(
      (b) => b.textContent === 'Adicionar pessoa',
    );
    if (!adicionar) throw new Error('Botão de adicionar ausente');
    adicionar.click();
    const caixas = [...raiz.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(caixas.map((c) => c.value)).toEqual([...VINCULOS_REDE]);
    expect(raiz.textContent).toContain('não dá acesso à ficha');

    const form = raiz.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await esperar();
    expect(salvar).not.toHaveBeenCalled();
    expect(raiz.textContent).toContain('Informe o nome');

    const nome = raiz.querySelector('input[type=text], input:not([type])') as HTMLInputElement;
    nome.value = 'Pessoa Fictícia';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await esperar();
    // Sem vínculo marcado a tela recusa: o requisito exige vínculo explícito.
    expect(salvar).not.toHaveBeenCalled();
    expect(raiz.textContent).toContain('ao menos um vínculo');

    for (const alvo of ['familiar', 'cuidador', 'responsavel_financeiro']) {
      const caixa = caixas.find((c) => c.value === alvo);
      if (caixa) caixa.checked = true;
    }
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await esperar();
    expect(salvar).toHaveBeenCalledOnce();
    const enviado = salvar.mock.calls[0]?.[2] as { nome: string; vinculos: string[] }[];
    expect(enviado[0]?.vinculos).toEqual(['familiar', 'cuidador', 'responsavel_financeiro']);
    // Nenhuma permissão acompanha o vínculo: a estrutura enviada não tem esse campo.
    expect(Object.keys(enviado[0] ?? {})).toEqual([
      'id',
      'nome',
      'vinculos',
      'contato',
      'observacao',
    ]);
  });
});
