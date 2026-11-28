// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import type { RegistroExportacoes } from '../packages/contracts/src/exportacao.js';
import { FalhaApi } from './api.js';
import { TelaExportacao } from './exportacao.js';

function montarExportacao(
  raiz: HTMLElement,
  pacienteId: ComponentProps<typeof TelaExportacao>['pacienteId'],
  servico: ComponentProps<typeof TelaExportacao>['servico'],
  acessoPerdido: ComponentProps<typeof TelaExportacao>['acessoPerdido'],
  alteracaoPendente: ComponentProps<typeof TelaExportacao>['alteracaoPendente'] = () => {},
  pacienteRotulo: ComponentProps<typeof TelaExportacao>['pacienteRotulo'] = 'Pessoa acompanhada',
) {
  const painel = render(
    createElement(TelaExportacao, {
      pacienteId,
      servico,
      acessoPerdido,
      alteracaoPendente,
      pacienteRotulo,
    }),
    { container: raiz },
  );
  return () => painel.rerender(null);
}

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
  await vi.waitFor(() => expect(raiz.textContent).toContain('Baixar índice dos registros'));
});

/** FR-033: montar o pacote agora faz N downloads. A tela precisa dizer que está reunindo,
 *  e nunca anunciar sucesso limpo quando um anexo não veio. */
function registroComAnexo() {
  const registro = registroCom([]);
  registro.exportacoes[0].itens = [
    {
      fonte: 'documento' as const,
      registro_id: '33333333-3333-4333-8333-333333333333',
      versao: 1,
      tipo_evento: 'registro' as const,
      autor_usuario_id: null,
      registrado_em: '2026-11-11T09:00:00.000Z',
      aconteceu_em: null,
      disponibilidade: 'incluido' as const,
      motivo_indisponibilidade: null,
      arquivo: {
        origem: 'documento' as const,
        id: '33333333-3333-4333-8333-333333333333',
        nome: null,
        mime: null,
        tamanho_bytes: null,
      },
    },
  ];
  return registro;
}

it('avisa que está reunindo os anexos e declara o que não veio', async () => {
  const raiz = document.createElement('div');
  URL.createObjectURL = vi.fn().mockReturnValue('blob:ficticio');
  URL.revokeObjectURL = vi.fn();
  const servico = {
    ...servicoCom(registroComAnexo()),
    baixarArquivo: vi.fn().mockRejectedValue(new FalhaApi('servico_indisponivel')),
  };
  montarExportacao(raiz, PACIENTE, servico, vi.fn());
  await vi.waitFor(() => expect(raiz.textContent).toContain('Baixar pacote com índice e anexos'));
  raiz.querySelector<HTMLButtonElement>('.exportacao__baixar')?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('não puderam ser recuperados'));
  expect(servico.baixarArquivo).toHaveBeenCalledTimes(1);
});
