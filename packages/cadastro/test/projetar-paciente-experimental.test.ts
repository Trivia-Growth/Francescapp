import { describe, expect, it } from 'vitest';

import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import {
  projetarPacienteAdministrativoExperimental,
  projetarPacienteBasicoExperimental,
  projetarPacienteEdicaoExperimental,
} from '../src/projetar-paciente-experimental.ts';

const pacienteId = 'd3bc7baf-8868-44ca-97a2-a5dfe73e567a';
const cifra = criarCifraAutenticada({
  keyIdAtiva: 'ficticia',
  chavesDeCifra: { ficticia: new Uint8Array(32).fill(17) },
  chaveHmac: new Uint8Array(32).fill(43),
});

describe('projeção experimental de paciente autorizado', () => {
  it('converte resposta básica sem incluir dados administrativos', async () => {
    const nome = await cifra.cifrar('Paciente Fictício', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome',
      formato: 1,
    });
    const preferencia = await cifra.cifrar('Pessoa', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome_preferencia',
      formato: 1,
    });
    await expect(
      projetarPacienteBasicoExperimental(
        {
          paciente_id: pacienteId,
          nome,
          nome_preferencia: preferencia,
          versao: 1,
        },
        cifra,
      ),
    ).resolves.toEqual({
      id: pacienteId,
      nome: 'Paciente Fictício',
      nome_preferencia: 'Pessoa',
      versao: 1,
    });
  });
  it('recusa resposta básica com dados administrativos ou cifra de outro paciente', async () => {
    const nome = await cifra.cifrar('Paciente Fictício', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome',
      formato: 1,
    });
    const basico = { paciente_id: pacienteId, nome, nome_preferencia: null, versao: 1 };
    await expect(
      projetarPacienteBasicoExperimental({ ...basico, contatos: [] }, cifra),
    ).rejects.toThrow('Não foi possível processar o cadastro.');
    await expect(
      projetarPacienteBasicoExperimental(
        {
          ...basico,
          paciente_id: 'a3bc7baf-8868-44ca-97a2-a5dfe73e567a',
        },
        cifra,
      ),
    ).rejects.toThrow('Não foi possível processar o cadastro.');
  });
  it('converte cadastro fictício cifrado em DTO administrativo', async () => {
    const nome = await cifra.cifrar('Paciente Fictício', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome',
      formato: 1,
    });
    await expect(
      projetarPacienteAdministrativoExperimental(
        {
          paciente_id: pacienteId,
          nome,
          nome_preferencia: null,
          data_nascimento: null,
          contatos: [],
          versao: 1,
        },
        cifra,
      ),
    ).resolves.toEqual({
      id: pacienteId,
      nome: 'Paciente Fictício',
      nome_preferencia: null,
      data_nascimento: null,
      contatos: [],
      versao: 1,
    });
  });

  it('não devolve dados parciais quando o envelope pertence a outro paciente', async () => {
    const nome = await cifra.cifrar('Paciente Fictício', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome',
      formato: 1,
    });
    await expect(
      projetarPacienteAdministrativoExperimental(
        {
          paciente_id: 'a3bc7baf-8868-44ca-97a2-a5dfe73e567a',
          nome,
          nome_preferencia: null,
          data_nascimento: null,
          contatos: [],
          versao: 1,
        },
        cifra,
      ),
    ).rejects.toThrow('Não foi possível processar o cadastro.');
  });

  it('converte opcionais e contato cifrado com identidade e campo próprios', async () => {
    const contatoId = 'e3bc7baf-8868-44ca-97a2-a5dfe73e567a';
    const nome = await cifra.cifrar('Paciente Fictício', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome',
      formato: 1,
    });
    const preferencia = await cifra.cifrar('Pessoa', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome_preferencia',
      formato: 1,
    });
    const nascimento = await cifra.cifrar('2000-01-01', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'data_nascimento',
      formato: 1,
    });
    const contato = await cifra.cifrar('ficticio@example.test', {
      tabela: 'cadastro.contato_paciente',
      registro_id: contatoId,
      campo: 'valor',
      formato: 1,
    });
    await expect(
      projetarPacienteAdministrativoExperimental(
        {
          paciente_id: pacienteId,
          nome,
          nome_preferencia: preferencia,
          data_nascimento: nascimento,
          contatos: [{ contato_id: contatoId, tipo: 'email', valor: contato, versao: 1 }],
          versao: 2,
        },
        cifra,
      ),
    ).resolves.toEqual({
      id: pacienteId,
      nome: 'Paciente Fictício',
      nome_preferencia: 'Pessoa',
      data_nascimento: '2000-01-01',
      contatos: [{ id: contatoId, tipo: 'email', valor: 'ficticio@example.test', versao: 1 }],
      versao: 2,
    });
  });

  it('rejeita contato associado a outra identidade sem devolver paciente parcial', async () => {
    const nome = await cifra.cifrar('Paciente Fictício', {
      tabela: 'cadastro.paciente',
      registro_id: pacienteId,
      campo: 'nome',
      formato: 1,
    });
    const valor = await cifra.cifrar('ficticio@example.test', {
      tabela: 'cadastro.contato_paciente',
      registro_id: 'e3bc7baf-8868-44ca-97a2-a5dfe73e567a',
      campo: 'valor',
      formato: 1,
    });
    await expect(
      projetarPacienteAdministrativoExperimental(
        {
          paciente_id: pacienteId,
          nome,
          nome_preferencia: null,
          data_nascimento: null,
          contatos: [
            { contato_id: 'f3bc7baf-8868-44ca-97a2-a5dfe73e567a', tipo: 'email', valor, versao: 1 },
          ],
          versao: 1,
        },
        cifra,
      ),
    ).rejects.toThrow('Não foi possível processar o cadastro.');
  });
});

describe('projeção da leitura de edição com o histórico do caso', () => {
  const auditoriaId = '7f2c1c0e-3b0e-4d6e-9d3e-2c6a1f4b8a10';
  const base = async () => {
    const aad = (campo: string) => ({
      tabela: 'cadastro.paciente' as const,
      registro_id: pacienteId,
      campo,
      formato: 1 as const,
    });
    return {
      paciente_id: pacienteId,
      nome: await cifra.cifrar('Paciente Fictício', aad('nome')),
      nome_preferencia: null,
      data_nascimento: null,
      contatos: [],
      versao: 3,
    };
  };
  const mudanca = async (registroId = auditoriaId) => ({
    versao: 3,
    situacao: 'ativo',
    responsavel_id: '10000000-0000-4000-8000-000000000002',
    responsavel_ativo: true,
    ator_id: '10000000-0000-4000-8000-000000000001',
    criado_em: '2026-11-08T22:15:31.123456+00:00',
    auditoria_id: auditoriaId,
    motivo: await cifra.cifrar('Início do acompanhamento fictício', {
      tabela: 'auditoria.evento',
      registro_id: registroId,
      campo: 'motivo',
      formato: 1,
    }),
  });

  it('decifra o motivo com o AAD do evento e devolve o histórico sem identificadores internos', async () => {
    const projetado = await projetarPacienteEdicaoExperimental(
      { ...(await base()), acompanhamento: [await mudanca()] },
      cifra,
    );
    expect(projetado.acompanhamento).toEqual([
      {
        versao: 3,
        situacao: 'ativo',
        responsavel_id: '10000000-0000-4000-8000-000000000002',
        responsavel_ativo: true,
        ator_id: '10000000-0000-4000-8000-000000000001',
        criado_em: '2026-11-08T22:15:31.123456+00:00',
        motivo: 'Início do acompanhamento fictício',
      },
    ]);
    expect(JSON.stringify(projetado)).not.toContain(auditoriaId);
    expect(projetado.nome).toBe('Paciente Fictício');
  });

  it('aceita caso sem nenhuma mudança registrada', async () => {
    const projetado = await projetarPacienteEdicaoExperimental(
      { ...(await base()), acompanhamento: [] },
      cifra,
    );
    expect(projetado.acompanhamento).toEqual([]);
  });

  it('recusa motivo trocado de outro evento, campo extra e situação fora do conjunto', async () => {
    const outroEvento = await mudanca('9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d');
    await expect(
      projetarPacienteEdicaoExperimental(
        { ...(await base()), acompanhamento: [outroEvento] },
        cifra,
      ),
    ).rejects.toThrow('Não foi possível processar o cadastro.');
    await expect(
      projetarPacienteEdicaoExperimental(
        { ...(await base()), acompanhamento: [{ ...(await mudanca()), nota: 'x' }] },
        cifra,
      ),
    ).rejects.toThrow('Não foi possível processar o cadastro.');
    await expect(
      projetarPacienteEdicaoExperimental(
        { ...(await base()), acompanhamento: [{ ...(await mudanca()), situacao: 'qualquer' }] },
        cifra,
      ),
    ).rejects.toThrow('Não foi possível processar o cadastro.');
    await expect(projetarPacienteEdicaoExperimental(await base(), cifra)).rejects.toThrow(
      'Não foi possível processar o cadastro.',
    );
  });
});
