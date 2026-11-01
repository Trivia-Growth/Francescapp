import { describe, expect, it } from 'vitest';

import { assinaturasRpc } from '@ffcmapp/contratos';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.js';
import { prepararCamposPacienteCifradosParciais } from '../src/atualizar-paciente-cifrado.js';

const cifra = criarCifraAutenticada({
  keyIdAtiva: 'teste',
  chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
  chaveHmac: new Uint8Array(32).fill(2),
});
const pacienteId = 'a0000000-0000-4000-8000-000000000001';

describe('preparação de atualização do paciente', () => {
  it('cifra nome para o paciente correto e preserva limpeza explícita', async () => {
    const resultado = await prepararCamposPacienteCifradosParciais(
      pacienteId,
      { nome: ' Pessoa fictícia ', nome_preferencia: null, versao_esperada: 2, motivo: 'Correção' },
      cifra,
    );
    expect(resultado.nome_preferencia).toBeNull();
    expect(resultado).not.toHaveProperty('data_nascimento');
    expect(resultado.versao_esperada).toBe(2);
    expect(JSON.stringify(resultado)).not.toContain('Pessoa fictícia');
    expect(resultado).not.toHaveProperty('motivo');
    expect(resultado.aad).toEqual({
      nome: { tabela: 'cadastro.paciente', registro_id: pacienteId, campo: 'nome', formato: 1 },
    });
    if (!resultado.nome) throw new Error('Nome cifrado ausente.');
    if (!resultado.aad.nome) throw new Error('AAD do nome ausente.');
    expect(await cifra.decifrar(resultado.nome, resultado.aad.nome)).toBe('Pessoa fictícia');
    expect(
      await cifra.decifrar(resultado.nome, {
        tabela: 'cadastro.paciente',
        registro_id: pacienteId,
        campo: 'nome',
        formato: 1,
      }),
    ).toBe('Pessoa fictícia');
    await expect(
      cifra.decifrar(resultado.nome, {
        tabela: 'cadastro.paciente',
        registro_id: 'a0000000-0000-4000-8000-000000000002',
        campo: 'nome',
        formato: 1,
      }),
    ).rejects.toThrow();
  });

  it('preserva limpeza sem inventar metadados de cifra', async () => {
    const resultado = await prepararCamposPacienteCifradosParciais(
      pacienteId,
      { nome_preferencia: null, versao_esperada: 1, motivo: 'Correção' },
      cifra,
    );
    expect(resultado.nome_preferencia).toBeNull();
    expect(resultado.aad).toEqual({});
  });

  it('rejeita atualização inválida sem revelar conteúdo no erro', async () => {
    await expect(
      prepararCamposPacienteCifradosParciais(
        pacienteId,
        { nome: '   ', versao_esperada: 1, motivo: 'Dado fictício sensível' },
        cifra,
      ),
    ).rejects.toThrow('Não foi possível preparar a atualização do cadastro.');
  });

  it('cifra data e nome de preferência para campos distintos', async () => {
    const resultado = await prepararCamposPacienteCifradosParciais(
      pacienteId,
      {
        nome_preferencia: 'Nome fictício',
        data_nascimento: '2000-01-01',
        versao_esperada: 1,
        motivo: 'Correção',
      },
      cifra,
    );
    expect(resultado).not.toHaveProperty('nome');
    expect(resultado.aad).toEqual({
      nome_preferencia: {
        tabela: 'cadastro.paciente',
        registro_id: pacienteId,
        campo: 'nome_preferencia',
        formato: 1,
      },
      data_nascimento: {
        tabela: 'cadastro.paciente',
        registro_id: pacienteId,
        campo: 'data_nascimento',
        formato: 1,
      },
    });
    if (!resultado.data_nascimento || !resultado.nome_preferencia)
      throw new Error('Campos cifrados ausentes.');
    expect(
      await cifra.decifrar(resultado.data_nascimento, {
        tabela: 'cadastro.paciente',
        registro_id: pacienteId,
        campo: 'data_nascimento',
        formato: 1,
      }),
    ).toBe('2000-01-01');
    await expect(
      cifra.decifrar(resultado.nome_preferencia, {
        tabela: 'cadastro.paciente',
        registro_id: pacienteId,
        campo: 'data_nascimento',
        formato: 1,
      }),
    ).rejects.toThrow();
  });

  it('não aceita campos parciais como entrada RPC sem motivo cifrado', async () => {
    const parcial = await prepararCamposPacienteCifradosParciais(
      pacienteId,
      { nome: 'Pessoa fictícia', versao_esperada: 1, motivo: 'Correção' },
      cifra,
    );
    const resultado = assinaturasRpc.atualizarPaciente.entrada.safeParse(parcial);
    expect(resultado.success).toBe(false);
    if (resultado.success) throw new Error('Entrada RPC parcial aceita.');
    expect(resultado.error.issues.some((erro) => erro.path[0] === 'motivo')).toBe(true);
  });
});
