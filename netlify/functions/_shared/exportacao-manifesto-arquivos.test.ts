import { expect, it } from 'vitest';
import type { RegistroExportacoes } from '../../../packages/contracts/src/exportacao.ts';
import { registroExportacoesSchema } from '../../../packages/contracts/src/exportacao.ts';
import { manifestoComArquivos } from './exportacao-nativa.ts';

/** FR-033: a ponte para os bytes é derivada no servidor, sobre o manifesto que o banco já
 * devolveu. Estes testes guardam a parte que erra calado: apontar arquivo para item que não
 * tem arquivo, ou para item que a audiência já marcou indisponível. Dados fictícios. */

const PACIENTE = '2c9e1e16-33d1-4740-b428-ab75a4c6c937';
const DOCUMENTO = '33333333-3333-4333-8333-333333333333';

const item = (parcial: Partial<RegistroExportacoes['exportacoes'][number]['itens'][number]>) => ({
  fonte: 'documento' as const,
  registro_id: DOCUMENTO,
  versao: 1,
  tipo_evento: 'registro' as const,
  autor_usuario_id: null,
  registrado_em: '2026-11-11T09:00:00.000Z',
  aconteceu_em: null,
  disponibilidade: 'incluido' as const,
  motivo_indisponibilidade: null,
  ...parcial,
});

const registro = (itens: RegistroExportacoes['exportacoes'][number]['itens']) => ({
  paciente_id: PACIENTE,
  exportacoes: [
    {
      id: '3f1d9f4e-0b2a-4c7d-9a1e-2b3c4d5e6f70',
      finalidade: 'encerramento_uso' as const,
      criado_em: '2026-11-13T12:00:00.000Z',
      ator_usuario_id: '11111111-1111-4111-8111-111111111111',
      terceiros_reduzidos: false,
      itens,
      entregas: [],
    },
  ],
});

it('aponta o documento incluído para o identificador que a rota de arquivo recebe', () => {
  const saida = manifestoComArquivos(registro([item({})]));
  expect(saida.exportacoes[0]?.itens[0]?.arquivo).toEqual({
    origem: 'documento',
    id: DOCUMENTO,
    nome: null,
    mime: null,
    tamanho_bytes: null,
  });
  // O resultado continua sendo um manifesto válido pelo contrato.
  expect(registroExportacoesSchema.safeParse(saida).success).toBe(true);
});

it('não inventa arquivo para fonte sem arquivo nem para item indisponível', () => {
  const saida = manifestoComArquivos(
    registro([
      item({ fonte: 'diario' }),
      item({ disponibilidade: 'indisponivel', motivo_indisponibilidade: 'documento_indisponivel' }),
    ]),
  );
  expect(saida.exportacoes[0]?.itens[0]?.arquivo).toBeUndefined();
  expect(saida.exportacoes[0]?.itens[1]?.arquivo).toBeUndefined();
});

it('não transporta nome, mime nem tamanho, que vivem no envelope cifrado', () => {
  const saida = manifestoComArquivos(registro([item({})]));
  const arquivo = saida.exportacoes[0]?.itens[0]?.arquivo;
  expect(arquivo?.nome).toBeNull();
  expect(arquivo?.mime).toBeNull();
  expect(arquivo?.tamanho_bytes).toBeNull();
});
