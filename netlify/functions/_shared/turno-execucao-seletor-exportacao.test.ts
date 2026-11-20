import { describe, it, expect } from 'vitest';
import {
  incluirSeletorExportacao,
  conferirVersaoExportacao,
} from './turno-execucao-seletor-exportacao.ts';
const registro_id_exportacao = 'd0000000-0000-4000-8000-000000000004';
describe('seletor privado de versão exata', () => {
  it('inclui par validado antes de assinar e confere resposta exata', () => {
    const comando = { registro_id_exportacao, versao_exportacao: 2 };
    const entrada = { paciente_id: 'ficticio' };
    incluirSeletorExportacao(comando, entrada);
    expect(entrada).toMatchObject(comando);
    expect(() =>
      conferirVersaoExportacao(comando, {
        itens: [{ registro_id: registro_id_exportacao, versao: 2 }],
      }),
    ).not.toThrow();
  });
  it.each([
    { registro_id_exportacao },
    { versao_exportacao: 2 },
    { registro_id_exportacao, versao_exportacao: 0 },
  ])('rejeita par incompleto/inválido', (comando) => {
    expect(() => incluirSeletorExportacao(comando, {})).toThrow();
  });
  it.each([
    null,
    [],
    [{ registro_id: registro_id_exportacao, versao: 3 }],
    [{ registro_id: 'a0000000-0000-4000-8000-000000000001', versao: 2 }],
    [
      { registro_id: registro_id_exportacao, versao: 2 },
      { registro_id: registro_id_exportacao, versao: 3 },
    ],
  ])('não aceita fallback latest, outro registro ou mais de uma versão', (dados) => {
    expect(() =>
      conferirVersaoExportacao({ registro_id_exportacao, versao_exportacao: 2 }, dados),
    ).toThrow();
  });
});
