import { describe, expect, it } from 'vitest';
import { arquivoItemExportacaoSchema, itemExportacaoSchema } from '../src/exportacao.ts';

/** FR-033: o manifesto precisa dizer QUAL arquivo buscar, sem carregar o conteúdo. Estes
 * testes existem porque um campo frouxo aqui vira ou anexo que ninguém acha, ou campo
 * extra que entra no pacote sem ninguém ter decidido. */

const ITEM_BASE = {
  fonte: 'documento' as const,
  registro_id: '33333333-3333-4333-8333-333333333333',
  versao: 2,
  tipo_evento: 'registro' as const,
  autor_usuario_id: null,
  registrado_em: '2026-11-11T09:00:00.000Z',
  aconteceu_em: null,
  disponibilidade: 'incluido' as const,
  motivo_indisponibilidade: null,
};

describe('arquivo do item de exportação', () => {
  it('aceita a ponte completa para os bytes do anexo', () => {
    const analise = itemExportacaoSchema.safeParse({
      ...ITEM_BASE,
      arquivo: {
        origem: 'documento',
        id: '33333333-3333-4333-8333-333333333333',
        nome: 'exame-ficticio.pdf',
        mime: 'application/pdf',
        tamanho_bytes: 1024,
      },
    });
    expect(analise.success).toBe(true);
  });

  it('aceita nome, mime e tamanho nulos, que é como o servidor os envia', () => {
    const analise = arquivoItemExportacaoSchema.safeParse({
      origem: 'anexo_turno',
      id: '44444444-4444-4444-8444-444444444444',
      nome: null,
      mime: null,
      tamanho_bytes: null,
    });
    expect(analise.success).toBe(true);
  });

  it('recusa campo desconhecido dentro do arquivo', () => {
    const analise = itemExportacaoSchema.safeParse({
      ...ITEM_BASE,
      arquivo: {
        origem: 'documento',
        id: '33333333-3333-4333-8333-333333333333',
        nome: null,
        mime: null,
        tamanho_bytes: null,
        url_assinada: 'https://exemplo.invalido/anexo',
      },
    });
    expect(analise.success).toBe(false);
  });

  it('recusa origem fora do vocabulário fechado', () => {
    expect(
      arquivoItemExportacaoSchema.safeParse({
        origem: 'drive_publico',
        id: '33333333-3333-4333-8333-333333333333',
        nome: null,
        mime: null,
        tamanho_bytes: null,
      }).success,
    ).toBe(false);
  });

  it('mantém válido o item sem arquivo, que é o manifesto já gravado', () => {
    expect(itemExportacaoSchema.safeParse(ITEM_BASE).success).toBe(true);
    expect(itemExportacaoSchema.safeParse({ ...ITEM_BASE, arquivo: null }).success).toBe(true);
  });

  it('continua recusando campo desconhecido no próprio item', () => {
    expect(
      itemExportacaoSchema.safeParse({ ...ITEM_BASE, conteudo_clinico: 'texto' }).success,
    ).toBe(false);
  });
});
