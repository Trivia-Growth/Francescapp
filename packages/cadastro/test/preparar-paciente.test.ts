/// <reference lib="dom" />

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.js';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.js';
import { prepararComandoCriarPaciente, prepararPacienteCifrado } from '../src/preparar-paciente.js';

const cifra = criarCifraAutenticada({
  keyIdAtiva: 'teste',
  chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
  chaveHmac: new Uint8Array(32).fill(2),
});
const idempotencia = {
  async calcularDigestIdempotencia(comando: string) {
    return createHmac('sha256', Buffer.alloc(32, 4)).update(comando).digest('base64url');
  },
};
const reserva = { reserva_id: 'd0000000-0000-4000-8000-000000000001', geracao_reserva: 1 };

describe('preparação interna de paciente', () => {
  it('usa o snapshot assinado mesmo que o objeto de entrada seja alterado após assinatura', async () => {
    const real = criarAtestadorOperacao({ keyId: 'atestado', chave: new Uint8Array(32).fill(3) });
    const atestador = {
      canonicalizar: real.canonicalizar,
      async atestarEntrada(dados: unknown, entrada: Record<string, unknown>) {
        const prova = await real.atestarEntrada(dados, entrada);
        entrada.paciente_id = '10000000-0000-4000-8000-000000000099';
        prova.atestado.usuario_id = '10000000-0000-4000-8000-000000000099';
        return prova;
      },
    };
    const resultado = await prepararComandoCriarPaciente(
      {
        corpo: { nome: 'Pessoa fictícia' },
        reserva,
        cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
        contexto: {
          key_id: 'atestado',
          usuario_id: '10000000-0000-4000-8000-000000000001',
          session_id: '10000000-0000-4000-8000-000000000002',
          request_id: '10000000-0000-4000-8000-000000000003',
          emitido_em: '2026-10-29T12:00:00Z',
          expira_em: '2026-10-29T12:01:00Z',
        },
      },
      { cifra, atestador, idempotencia },
    );
    const snapshot = JSON.parse(resultado.p_entrada.entrada_canonica) as { paciente_id: string };
    expect(resultado.p_entrada.entrada.paciente_id).toBe(snapshot.paciente_id);
    expect(snapshot.paciente_id).not.toBe('10000000-0000-4000-8000-000000000099');
    expect(resultado.p_entrada.entrada.atestado.usuario_id).toBe(
      '10000000-0000-4000-8000-000000000001',
    );
  });
  it('atesta tentativa cifrada e mantém HMAC lógico entre tentativas equivalentes', async () => {
    const atestador = criarAtestadorOperacao({
      keyId: 'atestado',
      chave: new Uint8Array(32).fill(3),
    });
    const contexto = {
      key_id: 'atestado',
      usuario_id: 'a0000000-0000-4000-8000-000000000001',
      session_id: 'b0000000-0000-4000-8000-000000000002',
      request_id: 'c0000000-0000-4000-8000-000000000003',
      emitido_em: '2026-10-29T12:00:00Z',
      expira_em: '2026-10-29T12:01:00Z',
    };
    const input = {
      corpo: { nome: ' Pessoa fictícia ' },
      reserva,
      cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
      contexto,
    };
    const primeira = await prepararComandoCriarPaciente(input, { cifra, atestador, idempotencia });
    const segunda = await prepararComandoCriarPaciente(input, { cifra, atestador, idempotencia });
    const outraCaixa = await prepararComandoCriarPaciente(
      {
        ...input,
        contexto: {
          ...contexto,
          usuario_id: contexto.usuario_id.toUpperCase(),
          session_id: contexto.session_id.toUpperCase(),
          request_id: contexto.request_id.toUpperCase(),
        },
      },
      { cifra, atestador, idempotencia },
    );
    const outroConteudo = await prepararComandoCriarPaciente(
      { ...input, corpo: { nome: 'Outro nome fictício' } },
      { cifra, atestador, idempotencia },
    );
    const outraReserva = await prepararComandoCriarPaciente(
      { ...input, reserva: { ...reserva, reserva_id: 'd0000000-0000-4000-8000-000000000002' } },
      { cifra, atestador, idempotencia },
    );
    const outroAtor = await prepararComandoCriarPaciente(
      { ...input, contexto: { ...contexto, usuario_id: '10000000-0000-4000-8000-000000000004' } },
      { cifra, atestador, idempotencia },
    );
    expect(JSON.stringify(primeira)).not.toContain('Pessoa fictícia');
    expect(primeira.p_entrada.entrada.reserva_id).toBe(reserva.reserva_id);
    expect(primeira.p_entrada.entrada.geracao_reserva).toBe(reserva.geracao_reserva);
    expect(JSON.parse(primeira.p_entrada.entrada_canonica)).toMatchObject(reserva);
    expect(primeira.p_entrada.entrada.digest_idempotencia).toBe(
      segunda.p_entrada.entrada.digest_idempotencia,
    );
    expect(primeira.p_entrada.entrada.digest_idempotencia).toBe(
      outraCaixa.p_entrada.entrada.digest_idempotencia,
    );
    expect(outraCaixa.p_entrada.entrada.atestado.session_id).toBe(contexto.session_id);
    expect(outraCaixa.p_entrada.entrada.request_id).toBe(contexto.request_id);
    expect(primeira.p_entrada.entrada.digest_idempotencia).not.toBe(
      outroConteudo.p_entrada.entrada.digest_idempotencia,
    );
    expect(primeira.p_entrada.entrada.digest_idempotencia).not.toBe(
      outraReserva.p_entrada.entrada.digest_idempotencia,
    );
    expect(primeira.p_entrada.entrada.digest_idempotencia).not.toBe(
      outroAtor.p_entrada.entrada.digest_idempotencia,
    );
    expect(primeira.p_entrada.entrada.paciente_id).not.toBe(segunda.p_entrada.entrada.paciente_id);
    expect(primeira.p_entrada.entrada.atestado.digest_entrada).not.toBe(
      segunda.p_entrada.entrada.atestado.digest_entrada,
    );
    expect(JSON.parse(primeira.p_entrada.entrada_canonica)).toEqual(
      Object.fromEntries(
        Object.entries(primeira.p_entrada.entrada).filter(([k]) => k !== 'atestado'),
      ),
    );
  });
  it('cifra nome e campos opcionais com AAD do registro gerado', async () => {
    const resultado = await prepararPacienteCifrado(
      {
        nome: ' Pessoa fictícia ',
        nome_preferencia: ' Nome fictício ',
        data_nascimento: '2000-01-01',
      },
      cifra,
    );
    expect(JSON.stringify(resultado)).not.toContain('Pessoa fictícia');
    const aad = {
      tabela: 'cadastro.paciente',
      registro_id: resultado.paciente_id,
      formato: 1,
    } as const;
    expect(resultado.aad).toEqual({
      nome: { ...aad, campo: 'nome' },
      nome_preferencia: { ...aad, campo: 'nome_preferencia' },
      data_nascimento: { ...aad, campo: 'data_nascimento' },
    });
    await expect(cifra.decifrar(resultado.nome, { ...aad, campo: 'nome' })).resolves.toBe(
      'Pessoa fictícia',
    );
    if (!resultado.nome_preferencia || !resultado.data_nascimento)
      throw new Error('Campos ausentes.');
    await expect(
      cifra.decifrar(resultado.nome_preferencia, { ...aad, campo: 'nome_preferencia' }),
    ).resolves.toBe('Nome fictício');
    await expect(
      cifra.decifrar(resultado.data_nascimento, { ...aad, campo: 'data_nascimento' }),
    ).resolves.toBe('2000-01-01');
    await expect(
      cifra.decifrar(resultado.nome, { ...aad, campo: 'nome_preferencia' }),
    ).rejects.toThrow();
  });

  it('aceita apenas nome e não inventa campos opcionais', async () => {
    const resultado = await prepararPacienteCifrado({ nome: 'Pessoa fictícia' }, cifra);
    expect(resultado).not.toHaveProperty('nome_preferencia');
    expect(resultado).not.toHaveProperty('data_nascimento');
    expect(resultado.aad).not.toHaveProperty('nome_preferencia');
    expect(resultado.aad).not.toHaveProperty('data_nascimento');
    expect(Object.isFrozen(resultado.aad)).toBe(true);
    expect(Object.isFrozen(resultado.aad.nome)).toBe(true);
  });

  it('rejeita entrada inválida e não expõe detalhes de falha da cifra', async () => {
    await expect(prepararPacienteCifrado({ nome: ' ' }, cifra)).rejects.toThrow(
      'Não foi possível preparar o cadastro.',
    );
    const cifraIndisponivel = {
      async cifrar() {
        throw new Error('Paciente fictício e segredo fictício');
      },
    };
    await expect(
      prepararPacienteCifrado({ nome: 'Pessoa fictícia' }, cifraIndisponivel),
    ).rejects.toThrow('Não foi possível preparar o cadastro.');
  });
});
