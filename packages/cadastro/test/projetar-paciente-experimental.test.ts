import { describe, expect, it } from 'vitest';

import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import {
  projetarPacienteAdministrativoExperimental,
  projetarPacienteBasicoExperimental,
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
