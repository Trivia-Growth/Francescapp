// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { TelaAvisos, type ServicoAvisos } from './avisos.js';
import type { ListaAvisos } from '../packages/contracts/src/aviso.js';

const paciente = '47000000-0000-4000-8000-000000000001';
const destinatario = '10000000-0000-4000-8000-000000000002';

const aviso = (parcial: Partial<ListaAvisos['itens'][number]> = {}) => ({
  tipo: 'passagem_sem_ciencia' as const,
  paciente_id: paciente,
  chave_origem: 'passagem:fictícia',
  instante: '2026-11-19T10:00:00.000Z',
  destinatario_usuario_id: destinatario,
  por_substituicao: false,
  lido: false,
  motivo: null,
  ...parcial,
});

afterEach(cleanup);

function montar(servico: Partial<ServicoAvisos>) {
  const completo: ServicoAvisos = {
    listar: servico.listar ?? (() => Promise.reject(new Error())),
    marcarLido: servico.marcarLido ?? (() => Promise.reject(new Error())),
  };
  const { container: raiz } = render(createElement(TelaAvisos, { servico: completo }));
  const sino = raiz.querySelector<HTMLButtonElement>('#avisos-sino');
  if (!sino) throw new Error('Sino de avisos indisponível.');
  return {
    raiz,
    abrirAvisos() {
      if (sino.getAttribute('aria-expanded') === 'true') sino.click();
      sino.click();
    },
  };
}

const indicador = () => document.getElementById('avisos-indicador') as HTMLElement;
const situacao = () => document.getElementById('avisos-situacao') as HTMLElement;

it('percorre os quatro estados sem confundir vazio com falha', async () => {
  let resolver!: (valor: ListaAvisos) => void;
  const listar = vi.fn(
    () =>
      new Promise<ListaAvisos>((ok) => {
        resolver = ok;
      }),
  );
  const { raiz, abrirAvisos } = montar({ listar });

  // Inicial: nada consultado ainda, nenhum indicador inventado.
  expect(situacao().textContent).toBe('');
  expect(indicador().hidden).toBe(true);

  abrirAvisos();
  expect(situacao().textContent).toContain('Carregando');
  expect(indicador().hidden).toBe(true);

  resolver({
    itens: [aviso(), aviso({ tipo: 'relato_em_atencao', chave_origem: 'relato:1' })],
    nao_lidos: 2,
  });
  await vi.waitFor(() => expect(situacao().textContent).toBe('2 aviso(s) na lista.'));
  expect(indicador().hidden).toBe(false);
  expect(indicador().textContent).toBe('2');
  expect(raiz.querySelectorAll('.avisos-item')).toHaveLength(2);

  // Vazio só depois de consulta real bem-sucedida, e sem indicador de quantidade.
  listar.mockImplementation(() => Promise.resolve({ itens: [], nao_lidos: 0 }));
  abrirAvisos();
  await vi.waitFor(() => expect(situacao().textContent).toContain('Nenhum aviso'));
  expect(indicador().hidden).toBe(true);

  // Falha: nem lista vazia apresentada como ausência, nem contagem da consulta anterior.
  listar.mockImplementation(() => Promise.resolve({ itens: [aviso()], nao_lidos: 1 }));
  abrirAvisos();
  await vi.waitFor(() => expect(indicador().textContent).toBe('1'));
  listar.mockImplementation(() => Promise.reject(new Error('rede')));
  abrirAvisos();
  await vi.waitFor(() => expect(situacao().textContent).toContain('Não foi possível carregar'));
  expect(situacao().textContent).not.toContain('Nenhum aviso');
  expect(indicador().hidden).toBe(true);
  expect(indicador().textContent).toBe('');
  expect(document.querySelectorAll('.avisos-item')).toHaveLength(0);
});

it('mostra a origem do aviso e nunca o seu teor, e separa lido de ciência', async () => {
  const lista: ListaAvisos = {
    itens: [
      aviso({
        tipo: 'pendencia_operacional',
        chave_origem: 'pendencia:revisao_proxima:revisao:2026-11-16',
        motivo: 'Revisão acordada para 16/11/2026, ainda não registrada.',
      }),
      aviso({ tipo: 'relato_em_atencao', chave_origem: 'relato:1', por_substituicao: true }),
      aviso({ tipo: 'sinal_atencao_operacional', chave_origem: 'sinal:x', lido: true }),
    ],
    nao_lidos: 2,
  };
  const marcarLido = vi.fn(() =>
    Promise.resolve({
      itens: lista.itens.map((item) => ({ ...item, lido: true })),
      nao_lidos: 0,
    }),
  );
  const { raiz, abrirAvisos } = montar({ listar: () => Promise.resolve(lista), marcarLido });
  abrirAvisos();
  await vi.waitFor(() => expect(raiz.querySelectorAll('.avisos-item')).toHaveLength(3));

  // O texto descreve a origem; nada do conteúdo do caso aparece.
  const textos = [...raiz.querySelectorAll('.avisos-item')].map((item) => item.textContent ?? '');
  expect(textos[0]).toContain('Pendência de acompanhamento em aberto');
  expect(textos[1]).toContain('Registro marcado como necessitando atenção');
  expect(textos[1]).toContain('recebido por substituição');
  expect(textos.join(' ')).not.toContain('ciphertext');

  // Lido permanece na lista, identificado, e sem botão de marcar de novo.
  const jaLido = raiz.querySelector('[data-tipo="sinal_atencao_operacional"]') as HTMLElement;
  expect(jaLido.dataset.lido).toBe('true');
  expect(jaLido.querySelector('.avisos-item-lido')).toBeNull();

  // Marcar como lido é ato local: o rótulo diz que não registra ciência nem encerra nada.
  const botao = raiz.querySelector('.avisos-item-lido') as HTMLButtonElement;
  expect(botao.title).toContain('Não registra ciência');
  botao.click();
  await vi.waitFor(() => expect(indicador().hidden).toBe(true));
  expect(marcarLido).toHaveBeenCalledWith({
    paciente_id: paciente,
    tipo: 'pendencia_operacional',
    chave_origem: 'pendencia:revisao_proxima:revisao:2026-11-16',
  });
  // Permanência: o aviso lido continua na lista.
  expect(raiz.querySelectorAll('.avisos-item')).toHaveLength(3);
  expect(situacao().textContent).toBe('3 aviso(s) na lista.');
});

it('não envia nada para fora do aplicativo nem registra token de dispositivo', () => {
  // Decisão 0.3: só o sino dentro do aplicativo. Qualquer chamada externa é achado.
  const fontes = ['web/avisos.tsx', 'web/servico-avisos-http.ts'].map((caminho) =>
    readFileSync(caminho, 'utf8'),
  );
  for (const fonte of fontes) {
    expect(fonte).not.toMatch(/Notification|serviceWorker|pushManager|getToken|messaging/);
    expect(fonte).not.toMatch(/https?:\/\//);
  }
  // O único destino de rede é a própria API, em caminho relativo e mesma origem.
  expect(fontes[1]).toContain("credentials: 'same-origin'");
  expect(fontes[1]).toContain("redirect: 'error'");
});
