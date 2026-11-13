// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { RegistroExportacoes } from '../packages/contracts/src/exportacao.js';
import { montarExportacao } from './exportacao.js';

const PACIENTE = '2c9e1e16-33d1-4740-b428-ab75a4c6c937';

function registroCom(entregas: RegistroExportacoes['exportacoes'][number]['entregas']) {
  return {
    paciente_id: PACIENTE,
    exportacoes: [
      {
        id: '3f1d9f4e-0b2a-4c7d-9a1e-2b3c4d5e6f70',
        finalidade: 'portabilidade_titular' as const,
        criado_em: '2026-11-13T12:00:00.000Z',
        ator_usuario_id: '11111111-1111-4111-8111-111111111111',
        terceiros_reduzidos: false,
        itens: [],
        entregas,
      },
    ],
  };
}

function servicoCom(registro: RegistroExportacoes) {
  return {
    consultar: vi.fn().mockResolvedValue(registro),
    registrar: vi.fn(),
    confirmar: vi.fn().mockResolvedValue(registro),
  };
}

/** Decisão de 13/11/2026: o carimbo é declaração de quem entregou, nunca prova de
 *  recebimento. Estes testes existem porque esse texto é requisito — um carimbo que parece
 *  confirmação do destinatário é garantia falsa, e numa discussão de LGPD isso é pior que
 *  não ter carimbo nenhum. */
it('avisa que quem recebe não confirma nada no sistema', async () => {
  const raiz = document.createElement('div');
  montarExportacao(raiz, PACIENTE, servicoCom(registroCom([])), vi.fn());
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  expect(raiz.textContent).toContain('declaração de quem entregou');
  expect(raiz.textContent).toContain('Quem recebe não confirma nada neste sistema');
});

it('não promete recebimento em nenhum dos estados de entrega', async () => {
  const raiz = document.createElement('div');
  montarExportacao(
    raiz,
    PACIENTE,
    servicoCom(
      registroCom([
        {
          ato: 'entregue' as const,
          criado_em: '2026-11-13T13:00:00.000Z',
          ator_usuario_id: '11111111-1111-4111-8111-111111111111',
        },
        {
          ato: 'conferida' as const,
          criado_em: '2026-11-13T14:00:00.000Z',
          ator_usuario_id: '11111111-1111-4111-8111-111111111111',
        },
      ]),
    ),
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('conferido por quem entregou'));
  // O texto antigo dizia "Entregue e conferida.", que se lê como confirmação do outro lado.
  expect(raiz.textContent).not.toContain('Entregue e conferida');
});

it('rotula os botões como ato de quem entrega, não do destinatário', async () => {
  const raiz = document.createElement('div');
  montarExportacao(raiz, PACIENTE, servicoCom(registroCom([])), vi.fn());
  await vi.waitFor(() => expect(raiz.textContent).toContain('Registrar que entreguei'));
  expect(raiz.textContent).not.toContain('Marcar entregue');
});

it('oferece baixar o pacote de cada exportação registrada', async () => {
  const raiz = document.createElement('div');
  montarExportacao(raiz, PACIENTE, servicoCom(registroCom([])), vi.fn());
  await vi.waitFor(() => expect(raiz.textContent).toContain('Baixar pacote'));
});
