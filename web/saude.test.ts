// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { Saude, SalvarSaude } from '../packages/contracts/src/saude.ts';
import { montarSaude } from './saude.js';
import { criarServicoSaudeHttp } from './servico-saude-http.ts';

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

it('confirma escrita cuja resposta se perdeu e permite novo comando sem duplicar versão', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  sessionStorage.setItem('modo-acesso', 'google');
  sessionStorage.setItem('fluxo-google', 'AAAAAAAAAAAAAAAAAAAAAA');
  let atual: Saude = {
    versao: 1,
    registros: [
      {
        id: 'registro-ficticio',
        tipo: 'historico',
        descricao: 'Informação fictícia',
        origem: 'Documento fictício',
        natureza: 'documento',
        data: '2026-11-18',
        situacao: 'hipotese',
      },
    ],
  };
  const recibos = new Map<string, Saude>();
  let perderResposta = true;
  const resposta = (dados: Saude) => Response.json({ dados, request_id: id });
  // Fronteira HTTP fictícia: persiste antes de perder a primeira resposta e aplica
  // versão esperada/idempotência, como a operação SQL; não prova integração real.
  vi.stubGlobal('fetch', async (_url: string, opcoes: RequestInit) => {
    if (opcoes.method === 'GET') return resposta(atual);
    const chave = new Headers(opcoes.headers).get('x-chave-idempotencia');
    if (!chave) throw new Error('Chave ausente');
    const recibo = recibos.get(chave);
    if (recibo) return resposta(recibo);
    const entrada = JSON.parse(String(opcoes.body)) as SalvarSaude;
    if (entrada.versao_esperada !== atual.versao)
      return Response.json(
        { erro: { codigo: 'conflito_versao', mensagem: 'Conflito' }, request_id: id },
        { status: 409 },
      );
    atual = { versao: atual.versao + 1, registros: entrada.registros };
    recibos.set(chave, atual);
    if (perderResposta) {
      perderResposta = false;
      throw new Error('Resposta perdida após persistir');
    }
    return resposta(atual);
  });
  const servico = criarServicoSaudeHttp(() => ({ usuario_id: id, session_id: id }));
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const desmontar = montarSaude(raiz, id, servico, vi.fn());
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Não foi possível confirmar o salvamento'),
  );
  const confirmar = [...raiz.querySelectorAll('button')].find(
    (botao) => botao.textContent === 'Tentar confirmar salvamento',
  );
  confirmar?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Histórico de saúde salvo.'));
  expect((await servico.consultar(id))?.versao).toBe(2);
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(raiz.querySelector('form')?.querySelector('[role="status"]')?.textContent).toBe(
      'Histórico de saúde salvo.',
    ),
  );
  expect((await servico.consultar(id))?.versao).toBe(3);
  desmontar();
});
