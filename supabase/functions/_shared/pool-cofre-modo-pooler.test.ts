import { expect, it } from 'vitest';
import { criarPoolCofre } from './pool-cofre.ts';
import { ErroCofreIndisponivel } from './cofre-vault.ts';

/** Em 22/11/2026 a produção apontava para a porta 5432 do Supavisor, que é **session mode**,
 * com teto de 15 clientes no projeto inteiro. Cada instância de função guarda uma conexão e
 * são dezenas de funções: o teto estourava, a leitura de configuração falhava com XX000 e
 * cada rota caía no padrão de ambiente, `false`.
 *
 * Quem usava não via erro nenhum — via a tela dizer que avisos, documentos ou acessos
 * estavam desligados, variando a cada recarga, com todas as chaves do banco em `true`.
 *
 * Dados fictícios. */

const base = {
  banco: 'postgres',
  usuario: 'executor_ficticio',
  senha: 'senha-ficticia',
  certificadoCa: '-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----',
};

it('recusa o pooler na porta de session mode', () => {
  expect(() =>
    criarPoolCofre({ ...base, host: 'aws-1-us-west-2.pooler.supabase.com', porta: 5432 }),
  ).toThrow(ErroCofreIndisponivel);
});

it('aceita o pooler na porta de transaction mode', () => {
  const pool = criarPoolCofre({
    ...base,
    host: 'aws-1-us-west-2.pooler.supabase.com',
    porta: 6543,
  });
  expect(pool.options.port).toBe(6543);
  void pool.end();
});

it('não atrapalha conexão direta ao banco, que não é pooler', () => {
  // `db.<ref>.supabase.co:5432` é conexão direta, sem teto de pooler: continua válida.
  const pool = criarPoolCofre({ ...base, host: 'db.projeto-ficticio.supabase.co', porta: 5432 });
  expect(pool.options.port).toBe(5432);
  void pool.end();
});
