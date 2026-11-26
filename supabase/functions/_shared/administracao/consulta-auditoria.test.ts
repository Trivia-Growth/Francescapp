import { describe, expect, it } from 'vitest';
import { contratosRotas } from '../../../../packages/contracts/src/index.ts';
import { consultarAuditoriaExperimental } from './consulta-auditoria.ts';

describe('consulta administrativa de auditoria', () => {
  it('bloqueia a página quando o operador ainda não foi comprovado', async () => {
    await expect(
      consultarAuditoriaExperimental({ limite: 10 }, async (_consulta, requestId) => ({
        ok: true,
        dados: {
          itens: [
            {
              id: '10000000-0000-4000-8000-000000000001',
              instante: '2026-10-29T12:00:00Z',
              acao: 'bootstrap.tecnico',
              tipo_objeto: 'usuario',
              objeto_id: null,
              paciente_id: null,
              resultado: 'permitido',
              ator_usuario_id: null,
              operador_restrito: 'texto fictício que não deve aparecer',
            },
          ],
          proximo_cursor: null,
        },
        request_id: requestId,
      })),
    ).rejects.toThrow(/^Não foi possível consultar a auditoria\.$/);
  });
  it('aceita somente os campos previstos em um evento não vazio', async () => {
    const evento = {
      id: '10000000-0000-4000-8000-000000000001',
      instante: '2026-10-29T12:00:00Z',
      acao: 'api.criar_paciente',
      tipo_objeto: 'paciente',
      objeto_id: null,
      paciente_id: null,
      resultado: 'permitido',
      ator_usuario_id: '10000000-0000-4000-8000-000000000002',
      operador_restrito: null,
    };
    const consultar = async (_consulta: unknown, requestId: string) => ({
      ok: true,
      dados: { itens: [evento], proximo_cursor: null },
      request_id: requestId,
    });
    const resultado = await consultarAuditoriaExperimental({ limite: 10 }, consultar);
    if (!resultado.ok) throw new Error('Consulta recusada.');
    expect(resultado.dados.itens).toEqual([evento]);
    await expect(
      consultarAuditoriaExperimental({ limite: 10 }, async (_consulta, requestId) => ({
        ok: true,
        dados: { itens: [{ ...evento, corpo_clinico: 'ficticio' }], proximo_cursor: null },
        request_id: requestId,
      })),
    ).rejects.toThrow('Não foi possível consultar a auditoria.');
  });
  it('distingue autor individual e operador e recusa identidade ausente ou dupla', () => {
    const evento = {
      id: '10000000-0000-4000-8000-000000000001',
      instante: '2026-10-29T12:00:00Z',
      acao: 'api.criar_paciente',
      tipo_objeto: 'paciente',
      objeto_id: null,
      paciente_id: null,
      resultado: 'permitido',
    };
    const validar = (ator_usuario_id: string | null, operador_restrito: string | null) =>
      contratosRotas.consultarAuditoria.saida.safeParse({
        itens: [{ ...evento, ator_usuario_id, operador_restrito }],
        proximo_cursor: null,
      }).success;
    expect(validar('10000000-0000-4000-8000-000000000002', null)).toBe(true);
    expect(validar(null, 'operador autorizado')).toBe(true);
    expect(validar(null, null)).toBe(false);
    expect(validar('10000000-0000-4000-8000-000000000002', 'operador autorizado')).toBe(false);
    expect(validar(null, '   ')).toBe(false);
  });
  it('preserva identidade Auth não admitida sem aceitar mais de um autor', async () => {
    const evento = {
      id: '10000000-0000-4000-8000-000000000001',
      instante: '2026-10-29T12:00:00Z',
      acao: 'api.listar_pacientes',
      tipo_objeto: 'carteira',
      objeto_id: null,
      paciente_id: null,
      resultado: 'negado',
      ator_usuario_id: null,
      ator_auth_id: '10000000-0000-4000-8000-000000000099',
      operador_restrito: null,
    };
    const consultar = async (_consulta: unknown, requestId: string) => ({
      ok: true,
      dados: { itens: [evento], proximo_cursor: null },
      request_id: requestId,
    });
    const resultado = await consultarAuditoriaExperimental({ limite: 10 }, consultar);
    if (!resultado.ok) throw new Error('Consulta recusada.');
    expect(resultado.dados.itens).toEqual([evento]);
    expect(
      contratosRotas.consultarAuditoria.saida.safeParse({
        itens: [{ ...evento, ator_usuario_id: evento.ator_auth_id }],
        proximo_cursor: null,
      }).success,
    ).toBe(false);
  });
  it('retorna a página da RPC com o identificador gerado pelo servidor', async () => {
    const resultado = await consultarAuditoriaExperimental(
      { limite: 10 },
      async (consulta, requestId) => ({
        ok: true,
        dados: { itens: [], proximo_cursor: null },
        request_id: requestId,
      }),
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error('Consulta recusada.');
    expect(resultado.dados).toEqual({ itens: [], proximo_cursor: null });
  });
  it('preserva negação sem convertê-la em lista vazia', async () => {
    const resultado = await consultarAuditoriaExperimental(
      { limite: 10 },
      async (_consulta, requestId) => ({
        ok: false,
        erro: { codigo: 'sem_permissao' },
        request_id: requestId,
      }),
    );
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error('Negação perdida.');
    expect(resultado.erro.codigo).toBe('sem_permissao');
  });
  it('recusa filtro extra antes de consultar', async () => {
    let chamado = false;
    await expect(
      consultarAuditoriaExperimental({ limite: 10, perfil: 'administrador' }, async () => {
        chamado = true;
        return {};
      }),
    ).rejects.toThrow('Não foi possível consultar a auditoria.');
    expect(chamado).toBe(false);
  });
  it('recusa request divergente e conteúdo extra na resposta', async () => {
    await expect(
      consultarAuditoriaExperimental({ limite: 10 }, async () => ({
        ok: true,
        dados: { itens: [], proximo_cursor: null },
        request_id: crypto.randomUUID(),
      })),
    ).rejects.toThrow('Não foi possível consultar a auditoria.');
    await expect(
      consultarAuditoriaExperimental({ limite: 10 }, async (_consulta, requestId) => ({
        ok: true,
        dados: { itens: [], proximo_cursor: null, segredo: 'ficticio' },
        request_id: requestId,
      })),
    ).rejects.toThrow('Não foi possível consultar a auditoria.');
  });
  it('não expõe detalhes de falha da RPC', async () => {
    await expect(
      consultarAuditoriaExperimental({ limite: 10 }, async () => {
        throw new Error('informação fictícia sensível');
      }),
    ).rejects.toThrow(/^Não foi possível consultar a auditoria\.$/);
  });
});
