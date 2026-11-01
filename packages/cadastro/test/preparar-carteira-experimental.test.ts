import { describe, expect, it } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.js';
import { prepararCarteiraExperimental } from '../src/preparar-carteira-experimental.js';

const contexto = {
  key_id: 'teste',
  usuario_id: 'a0000000-0000-4000-8000-000000000001',
  session_id: 'b0000000-0000-4000-8000-000000000002',
  request_id: 'c0000000-0000-4000-8000-000000000003',
  emitido_em: '2026-10-29T12:00:00Z',
  expira_em: '2026-10-29T12:01:00Z',
};
const atestador = criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) });

describe('preparação experimental de carteira', () => {
  it('produz transporte assinado da consulta e normaliza identidade', async () => {
    const resultado = await prepararCarteiraExperimental(
      {
        contexto: { ...contexto, usuario_id: contexto.usuario_id.toUpperCase() },
        consulta: { limite: 10 },
      },
      atestador,
    );
    expect(resultado.p_entrada.entrada).toMatchObject({
      request_id: contexto.request_id,
      limite: 10,
      atestado: { operacao: 'api.listar_pacientes', usuario_id: contexto.usuario_id },
    });
    expect(JSON.parse(resultado.p_entrada.entrada_canonica)).toEqual({
      limite: 10,
      request_id: contexto.request_id,
    });
  });
  it('preserva o snapshot assinado quando a consulta muda durante a assinatura', async () => {
    const consulta = { limite: 10, cursor: 'cursor-ficticio' };
    let liberar!: () => void;
    const espera = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const preparando = prepararCarteiraExperimental(
      { contexto: { ...contexto }, consulta },
      {
        async atestarEntrada(dados, entrada) {
          await espera;
          return atestador.atestarEntrada(dados, entrada);
        },
      },
    );
    consulta.limite = 20;
    liberar();
    const resultado = await preparando;
    expect(resultado.p_entrada.entrada.limite).toBe(10);
    expect(resultado.p_entrada.entrada.cursor).toBe('cursor-ficticio');
  });
  it('recusa entrada inválida e não revela erro ou segredo do assinador', async () => {
    await expect(
      prepararCarteiraExperimental({ contexto, consulta: { limite: 0 } }, atestador),
    ).rejects.toThrow('Não foi possível preparar a carteira.');
    const segredo = 'segredo-ficticio';
    await expect(
      prepararCarteiraExperimental(
        { contexto, consulta: { limite: 10 } },
        {
          async atestarEntrada() {
            throw new Error(segredo);
          },
        },
      ),
    ).rejects.toThrow(/^Não foi possível preparar a carteira\.$/);
  });
  it.each(['cursor', 'ator', 'request', 'operacao'] as const)(
    'recusa assinatura válida com %s divergente',
    async (campo) => {
      await expect(
        prepararCarteiraExperimental(
          { contexto, consulta: { limite: 10, cursor: 'cursor-ficticio' } },
          {
            async atestarEntrada(dados, entrada) {
              const alterados = { ...(dados as typeof contexto & { operacao: string }) };
              const consulta = { ...entrada };
              if (campo === 'cursor') consulta.cursor = 'outro-cursor';
              if (campo === 'ator') alterados.usuario_id = 'd0000000-0000-4000-8000-000000000004';
              if (campo === 'request')
                alterados.request_id = 'd0000000-0000-4000-8000-000000000004';
              if (campo === 'operacao') alterados.operacao = 'api.criar_paciente';
              return atestador.atestarEntrada(alterados, consulta);
            },
          },
        ),
      ).rejects.toThrow('Não foi possível preparar a carteira.');
    },
  );
});
