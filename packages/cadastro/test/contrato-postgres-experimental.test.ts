import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { assinaturasRpc } from '@ffcmapp/contratos';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { projetarPacienteAdministrativoExperimental } from '../src/projetar-paciente-experimental.ts';

// Este teste requer a fixture SQL em um cluster local descartável, sem Supabase.
const socket = process.env.FFCM_CADASTRO_SOCKET;
const porta = Number(process.env.FFCM_CADASTRO_PORTA);

describe.skipIf(!socket || !porta)('contrato de cadastro com PostgreSQL experimental', () => {
  it('valida primeira criação e retry com projeção vigente pelo contrato real', async () => {
    if (
      !socket ||
      !/^\/tmp\/ffcm-cadastro\.[A-Za-z0-9]+$/.test(socket) ||
      !Number.isInteger(porta)
    ) {
      throw new Error('Cluster descartável obrigatório.');
    }
    const client = new Client({ host: socket, port: porta, database: 'ffcm_cadastro_teste_local' });
    await client.connect();
    try {
      const ambiente = await client.query<{ local: boolean }>(
        "select current_database() = 'ffcm_cadastro_teste_local' and inet_server_addr() is null and current_setting('unix_socket_directories') = $1 and current_setting('data_directory') = $1 || '/data' as local",
        [socket],
      );
      if (!ambiente.rows[0]?.local) throw new Error('Cluster descartável obrigatório.');
      await client.query('begin');
      await client.query(
        "select set_config('ffcm_teste.usuario',$1,true), set_config('ffcm_teste.sessao',$2,true), set_config('ffcm_teste.ativa','sim',true)",
        ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'],
      );
      const pacienteId = '20000000-0000-4000-8000-000000000071';
      const cifra = criarCifraAutenticada({
        keyIdAtiva: 'v1',
        chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
        chaveHmac: new Uint8Array(32).fill(43),
      });
      const aad = {
        tabela: 'cadastro.paciente' as const,
        registro_id: pacienteId,
        campo: 'nome',
        formato: 1 as const,
      };
      const envelope = await cifra.cifrar('Paciente Fictício', aad);
      const entrada = {
        request_id: '30000000-0000-4000-8000-000000000071',
        auditoria_id: '40000000-0000-4000-8000-000000000071',
        paciente_id: pacienteId,
        chave_idempotencia: 'chave_fixture_123456',
        digest_idempotencia: 'digestficticio',
        nome: envelope,
        aad: {
          nome: { tabela: 'cadastro.paciente', registro_id: pacienteId, campo: 'nome', formato: 1 },
        },
      };
      const executar = () =>
        client.query<{ resultado: unknown }>(
          'select experimento_atestado.criar_paciente(public.assinar_fixture($1::jsonb)) as resultado',
          [JSON.stringify(entrada)],
        );
      const primeira = assinaturasRpc.criarPaciente.saida.parse(
        (await executar()).rows[0]?.resultado,
      );
      expect(primeira.ok).toBe(true);
      if (!primeira.ok) throw new Error('Criação recusada.');
      expect(primeira.dados.paciente_id).toBe(pacienteId);
      expect(primeira.dados.versao).toBe(1);
      expect(primeira.dados.contatos).toEqual([]);
      expect(JSON.stringify(primeira.dados)).not.toContain('Paciente Fictício');
      const armazenado = await client.query<{ nome_cifrado: unknown }>(
        'select nome_cifrado from cadastro.paciente where id=$1',
        [pacienteId],
      );
      expect(armazenado.rows[0]?.nome_cifrado).toEqual(envelope);
      expect(JSON.stringify(armazenado.rows[0])).not.toContain('Paciente Fictício');
      expect(await projetarPacienteAdministrativoExperimental(primeira.dados, cifra)).toMatchObject(
        {
          id: pacienteId,
          nome: 'Paciente Fictício',
          versao: 1,
        },
      );
      const nomeAtualizado = await cifra.cifrar('Pessoa Atualizada', aad);
      await client.query(
        'update cadastro.paciente set versao=2, nome_cifrado=$2::jsonb where id=$1',
        [pacienteId, JSON.stringify(nomeAtualizado)],
      );
      const repeticao = assinaturasRpc.criarPaciente.saida.parse(
        (await executar()).rows[0]?.resultado,
      );
      expect(repeticao.ok).toBe(true);
      if (!repeticao.ok) throw new Error('Repetição recusada.');
      expect(repeticao.dados.paciente_id).toBe(pacienteId);
      expect(repeticao.dados.versao).toBe(2);
      expect(repeticao.dados.nome).toEqual(nomeAtualizado);
      expect(
        await projetarPacienteAdministrativoExperimental(repeticao.dados, cifra),
      ).toMatchObject({
        id: pacienteId,
        nome: 'Pessoa Atualizada',
        versao: 2,
      });
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
  });
});
