import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import {
  prepararComandoCriarContato,
  prepararNovoContatoCifrado,
} from '../src/preparar-contato.ts';

const cifra = criarCifraAutenticada({
  keyIdAtiva: 'v1',
  chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
  chaveHmac: new Uint8Array(32).fill(43),
});

describe('preparo de contato de paciente', () => {
  it('assina dados cifrados e preserva o digest lógico em repetições', async () => {
    const solicitacao = {
      pacienteId: 'a0000000-0000-4000-8000-000000000001',
      corpo: { tipo: 'email', valor: 'pessoa@example.test' },
      cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
      contexto: {
        key_id: 'atestado',
        usuario_id: 'b0000000-0000-4000-8000-000000000001',
        session_id: '10000000-0000-4000-8000-000000000002',
        request_id: '10000000-0000-4000-8000-000000000003',
        emitido_em: '2026-10-29T12:00:00Z',
        expira_em: '2026-10-29T12:01:00Z',
      },
    };
    const dependencias = {
      cifra,
      atestador: criarAtestadorOperacao({ keyId: 'atestado', chave: new Uint8Array(32).fill(3) }),
      idempotencia: {
        async calcularDigestIdempotencia(comando: string) {
          return createHmac('sha256', Buffer.alloc(32, 4)).update(comando).digest('base64url');
        },
      },
    };
    const primeiro = await prepararComandoCriarContato(solicitacao, dependencias);
    const repeticao = await prepararComandoCriarContato(solicitacao, dependencias);
    const outraCaixa = await prepararComandoCriarContato(
      {
        ...solicitacao,
        pacienteId: solicitacao.pacienteId.toUpperCase(),
        contexto: {
          ...solicitacao.contexto,
          usuario_id: solicitacao.contexto.usuario_id.toUpperCase(),
        },
      },
      dependencias,
    );
    const outroPaciente = await prepararComandoCriarContato(
      { ...solicitacao, pacienteId: '20000000-0000-4000-8000-000000000002' },
      dependencias,
    );
    expect(JSON.stringify(primeiro)).not.toContain('pessoa@example.test');
    expect(primeiro.p_entrada.entrada.digest_idempotencia).toBe(
      repeticao.p_entrada.entrada.digest_idempotencia,
    );
    expect(primeiro.p_entrada.entrada.digest_idempotencia).toBe(
      outraCaixa.p_entrada.entrada.digest_idempotencia,
    );
    expect(primeiro.p_entrada.entrada.digest_idempotencia).not.toBe(
      outroPaciente.p_entrada.entrada.digest_idempotencia,
    );
    expect(primeiro.p_entrada.entrada.paciente_id).toBe(solicitacao.pacienteId);
    expect(JSON.parse(primeiro.p_entrada.entrada_canonica).aad).toEqual(
      primeiro.p_entrada.entrada.aad,
    );
    expect(primeiro.p_entrada.entrada.aad.registro_id).toBe(primeiro.p_entrada.entrada.contato_id);
  });
  it('valida e cifra e-mail usando a identidade do contato', async () => {
    const contato = await prepararNovoContatoCifrado(
      { tipo: 'email', valor: 'pessoa@example.test' },
      cifra,
    );
    expect(JSON.stringify(contato)).not.toContain('pessoa@example.test');
    await expect(
      cifra.decifrar(contato.valor, {
        tabela: 'cadastro.contato_paciente',
        registro_id: contato.contato_id,
        campo: 'valor',
        formato: 1,
      }),
    ).resolves.toBe('pessoa@example.test');
    expect(contato.tipo).toBe('email');
  });
  it('cifra telefone e impede decifrá-lo com outra identidade', async () => {
    const contato = await prepararNovoContatoCifrado(
      { tipo: 'telefone', valor: '+55 11 99999-0000' },
      cifra,
    );
    await expect(
      cifra.decifrar(contato.valor, {
        tabela: 'cadastro.contato_paciente',
        registro_id: contato.contato_id,
        campo: 'valor',
        formato: 1,
      }),
    ).resolves.toBe('+55 11 99999-0000');
    await expect(
      cifra.decifrar(contato.valor, {
        tabela: 'cadastro.contato_paciente',
        registro_id: crypto.randomUUID(),
        campo: 'valor',
        formato: 1,
      }),
    ).rejects.toThrow();
  });
  it.each([
    { tipo: 'email', valor: 'sem-arroba' },
    { tipo: 'telefone', valor: 'abc' },
    { tipo: 'email', valor: 'pessoa@example.test', extra: 'ficticio' },
  ])('recusa contato inválido sem expor o valor', async (corpo) => {
    await expect(prepararNovoContatoCifrado(corpo, cifra)).rejects.toThrow(
      /^Não foi possível preparar o contato\.$/,
    );
  });
});
