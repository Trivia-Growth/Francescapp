import { expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { prepararAcessoPacientePrivado } from '../src/acesso-paciente-privado.ts';

it('vincula motivos cifrados aos registros distintos de acesso e auditoria', async () => {
  const cifra = criarCifraAutenticada({
    keyIdAtiva: 'v1',
    chavesDeCifra: { v1: new Uint8Array(32).fill(1) },
    chaveHmac: new Uint8Array(32).fill(2),
  });
  const id = 'a0000000-0000-4000-8000-000000000001';
  const resultado = await prepararAcessoPacientePrivado(
    {
      acao: 'revogar',
      pacienteId: id,
      acessoId: id,
      reservaId: id,
      geracaoReserva: 2,
      corpo: { versao_esperada: 1, motivo: 'Motivo fictício' },
      cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
      contexto: {
        key_id: 'atestado',
        usuario_id: id,
        session_id: id,
        request_id: id,
        emitido_em: '2026-10-29T12:00:00Z',
        expira_em: '2026-10-29T12:00:30Z',
      },
    },
    {
      cifra,
      atestador: criarAtestadorOperacao({ keyId: 'atestado', chave: new Uint8Array(32).fill(3) }),
      idempotencia: {
        async calcularDigestIdempotencia(valor) {
          return createHmac('sha256', Buffer.alloc(32, 4)).update(valor).digest('base64url');
        },
      },
    },
  );
  expect(JSON.parse(resultado.p_entrada.entrada_canonica)).toMatchObject({
    reserva_id: id,
    geracao_reserva: 2,
    versao_esperada: 1,
  });
  const entrada = resultado.p_entrada.entrada;
  if (!('motivo_auditoria' in entrada)) throw new Error('Motivo de auditoria ausente');
  await expect(
    cifra.decifrar(entrada.motivo, {
      tabela: 'cadastro.acesso_paciente',
      registro_id: id,
      campo: 'motivo_revogacao',
      formato: 1,
    }),
  ).resolves.toBe('Motivo fictício');
  await expect(
    cifra.decifrar(entrada.motivo_auditoria, {
      tabela: 'auditoria.evento',
      registro_id: entrada.auditoria_id,
      campo: 'motivo',
      formato: 1,
    }),
  ).resolves.toBe('Motivo fictício');
  await expect(
    cifra.decifrar(entrada.motivo, {
      tabela: 'auditoria.evento',
      registro_id: entrada.auditoria_id,
      campo: 'motivo',
      formato: 1,
    }),
  ).rejects.toThrow();
});

it('assina reserva e época junto à concessão e rejeita ausência de reserva', async () => {
  const id = 'a0000000-0000-4000-8000-000000000001';
  const cifra = criarCifraAutenticada({
    keyIdAtiva: 'v1',
    chavesDeCifra: { v1: new Uint8Array(32).fill(1) },
    chaveHmac: new Uint8Array(32).fill(2),
  });
  const dependencias = {
    cifra,
    atestador: criarAtestadorOperacao({ keyId: 'atestado', chave: new Uint8Array(32).fill(3) }),
    idempotencia: {
      async calcularDigestIdempotencia(valor: string) {
        return createHmac('sha256', Buffer.alloc(32, 4)).update(valor).digest('base64url');
      },
    },
  };
  const solicitacao = {
    acao: 'conceder' as const,
    pacienteId: id,
    acessoId: id,
    reservaId: id,
    geracaoReserva: 2,
    corpo: { usuario_id: id, motivo: 'Motivo fictício' },
    cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
    contexto: {
      key_id: 'atestado',
      usuario_id: id,
      session_id: id,
      request_id: id,
      emitido_em: '2026-10-29T12:00:00Z',
      expira_em: '2026-10-29T12:00:30Z',
    },
  };
  const resultado = await prepararAcessoPacientePrivado(solicitacao, dependencias);
  expect(JSON.parse(resultado.p_entrada.entrada_canonica)).toMatchObject({
    reserva_id: id,
    geracao_reserva: 2,
  });
  expect(JSON.stringify(resultado)).not.toContain('Motivo fictício');
  await expect(
    prepararAcessoPacientePrivado({ ...solicitacao, reservaId: undefined }, dependencias),
  ).rejects.toThrow();
});
