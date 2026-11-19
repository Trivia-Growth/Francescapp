import { describe, expect, it } from 'vitest';
import { acessoSchema, criarAcessoSchema } from '../src/acessos.ts';

const acesso = {
  operacao_id: '10000000-0000-4000-8000-000000000001',
  usuario_id: null,
  nome: 'Pessoa fictícia',
  email: 'pessoa@example.test',
  funcao: 'familia',
  metodo: 'google_workspace',
  estado: 'aguardando_google',
  criado_em: '2026-11-19T12:34:56.123456+00:00',
  criado_por_usuario_id: '10000000-0000-4000-8000-000000000002',
};

describe('acessos: fronteira nova SQL/Postgres', () => {
  // Postgres serializa timestamptz com offset. Sem offset:true a resposta real
  // seria recusada embora fixtures com Z passassem. PREPARADO, NÃO EXECUTADO.
  it('aceita offset explícito do Postgres e preserva os seis dígitos de fração', () => {
    expect(acessoSchema.safeParse(acesso).success).toBe(true);
    expect(acessoSchema.safeParse({ ...acesso, criado_em: '2026-11-19T12:34:56Z' }).success).toBe(
      true,
    );
  });

  it.each(['2026-99-19T12:34:56+00:00', '2026-11-19', 'amanhã', '2026-11-19T12:34:56'])(
    'recusa instante inválido %s',
    (criado_em) => {
      expect(acessoSchema.safeParse({ ...acesso, criado_em }).success).toBe(false);
    },
  );

  it('não aceita senha em consulta nem em cadastro Google', () => {
    expect(acessoSchema.safeParse({ ...acesso, senha: 'senha-ficticia-transitoria' }).success).toBe(
      false,
    );
    expect(
      criarAcessoSchema.safeParse({
        operacao_id: acesso.operacao_id,
        nome: acesso.nome,
        email: acesso.email,
        funcao: acesso.funcao,
        metodo: 'google_workspace',
        motivo: 'Fixture',
        senha: 'senha-ficticia-transitoria',
      }).success,
    ).toBe(false);
  });

  it('representa recusa definitiva sem reabrir a operação anterior', () => {
    expect(
      acessoSchema.safeParse({
        ...acesso,
        metodo: 'interno',
        usuario_id: acesso.criado_por_usuario_id,
        estado: 'falha_confirmada',
      }).success,
    ).toBe(true);
  });
});
