import { createHmac, randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { assinaturasRpc } from '@ffcmapp/contratos';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { prepararComandoCriarContato } from '../src/preparar-contato.ts';

const socket = process.env.FFCM_CONTATO_SOCKET;
const porta = Number(process.env.FFCM_CONTATO_PORTA);

describe.skipIf(!socket || !porta)('contato com PostgreSQL experimental', () => {
  it('transporta cifra real e atestado JCS até a operação SQL fictícia', async () => {
    if (!socket || !/^\/tmp\/ffcm-admissao\.[A-Za-z0-9]+$/.test(socket) || !Number.isInteger(porta))
      throw new Error('Cluster descartável obrigatório.');
    const diretorio = lstatSync(socket);
    if (
      !diretorio.isDirectory() ||
      diretorio.uid !== process.getuid?.() ||
      (diretorio.mode & 0o777) !== 0o700
    )
      throw new Error('Cluster descartável obrigatório.');
    const client = new Client({ host: socket, port: porta, database: 'postgres' });
    await client.connect();
    try {
      const ambiente = await client.query<{ local: boolean }>(
        "select current_database()='postgres' and inet_server_addr() is null and current_setting('unix_socket_directories')=$1 and current_setting('data_directory')=$1 || '/data' as local",
        [socket],
      );
      if (!ambiente.rows[0]?.local) throw new Error('Cluster descartável obrigatório.');
      await client.query('begin');
      const usuario = '61000000-0000-4000-8000-000000000001';
      const sessao = '63000000-0000-4000-8000-000000000001';
      await client.query(
        "select set_config('ffcm_fixture.usuario',$1,true),set_config('ffcm_fixture.sessao',$2,true),set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$3,true)",
        [usuario, sessao, JSON.stringify({ session_id: sessao })],
      );
      const agora = Date.now();
      const cifra = criarCifraAutenticada({
        keyIdAtiva: 'v1',
        chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
        chaveHmac: new Uint8Array(32).fill(43),
      });
      const comando = await prepararComandoCriarContato(
        {
          pacienteId: '66000000-0000-4000-8000-000000000099',
          corpo: { tipo: 'email', valor: 'ficticio@example.test' },
          cabecalhos: { 'x-chave-idempotencia': `contato-${randomUUID()}` },
          contexto: {
            key_id: 'v1',
            usuario_id: usuario,
            session_id: sessao,
            request_id: randomUUID(),
            emitido_em: new Date(agora - 1000).toISOString(),
            expira_em: new Date(agora + 30000).toISOString(),
          },
        },
        {
          cifra,
          atestador: criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) }),
          idempotencia: {
            async calcularDigestIdempotencia(logico: string) {
              return createHmac('sha256', Buffer.alloc(32, 4)).update(logico).digest('base64url');
            },
          },
        },
      );
      const resposta = await client.query<{ resultado: unknown }>(
        'select experimento_atestado.criar_contato_com_prova_fixture($1::jsonb,1,$2::bytea) as resultado',
        [JSON.stringify(comando.p_entrada), Buffer.alloc(32, 1)],
      );
      const resultado = assinaturasRpc.criarContato.saida.parse(resposta.rows[0]?.resultado);
      expect(resultado.ok).toBe(true);
      const registro = await client.query<{ valor_cifrado: unknown }>(
        'select valor_cifrado from cadastro.contato_paciente where id=$1',
        [comando.p_entrada.entrada.contato_id],
      );
      expect(registro.rows[0]?.valor_cifrado).toEqual(comando.p_entrada.entrada.valor);
      expect(JSON.stringify(registro.rows[0])).not.toContain('ficticio@example.test');
      await expect(
        cifra.decifrar(comando.p_entrada.entrada.valor, comando.p_entrada.entrada.aad),
      ).resolves.toBe('ficticio@example.test');
      const adulterado = structuredClone(comando.p_entrada);
      adulterado.entrada.aad.registro_id = randomUUID();
      const negado = await client.query<{ resultado: unknown }>(
        'select experimento_atestado.criar_contato_com_prova_fixture($1::jsonb,1,$2::bytea) as resultado',
        [JSON.stringify(adulterado), Buffer.alloc(32, 1)],
      );
      const negativa = assinaturasRpc.criarContato.saida.parse(negado.rows[0]?.resultado);
      expect(negativa.ok).toBe(false);
      if (negativa.ok) throw new Error('Adulteração aceita.');
      expect(negativa.erro.codigo).toBe('sem_permissao');
      expect(negativa).not.toHaveProperty('dados');
      const contagem = await client.query<{ contatos: number; requisicoes: number }>(
        'select (select count(*)::int from cadastro.contato_paciente where id=$1) as contatos, (select count(*)::int from operacao.requisicao where chave_idempotencia=$2) as requisicoes',
        [comando.p_entrada.entrada.contato_id, comando.p_entrada.entrada.chave_idempotencia],
      );
      expect(contagem.rows[0]).toEqual({ contatos: 1, requisicoes: 1 });
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
  });

  it.each([
    ['sessão', false],
    ['sessão', true],
    ['concessão', false],
    ['concessão', true],
  ] as const)(
    'nega contato e repetição após revogar %s (criado antes: %s)',
    async (tipo, criado) => {
      if (
        !socket ||
        !/^\/tmp\/ffcm-admissao\.[A-Za-z0-9]+$/.test(socket) ||
        !Number.isInteger(porta)
      )
        throw new Error('Cluster descartável obrigatório.');
      const diretorio = lstatSync(socket);
      if (
        !diretorio.isDirectory() ||
        diretorio.uid !== process.getuid?.() ||
        (diretorio.mode & 0o777) !== 0o700
      )
        throw new Error('Cluster descartável obrigatório.');
      const client = new Client({ host: socket, port: porta, database: 'postgres' });
      await client.connect();
      try {
        const ambiente = await client.query<{ local: boolean }>(
          "select current_database()='postgres' and inet_server_addr() is null and current_setting('unix_socket_directories')=$1 and current_setting('data_directory')=$1 || '/data' as local",
          [socket],
        );
        if (!ambiente.rows[0]?.local) throw new Error('Cluster descartável obrigatório.');
        await client.query('begin');
        const usuario = '61000000-0000-4000-8000-000000000001';
        const sessao = '63000000-0000-4000-8000-000000000001';
        await client.query(
          "select set_config('ffcm_fixture.usuario',$1,true),set_config('ffcm_fixture.sessao',$2,true),set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$3,true)",
          [usuario, sessao, JSON.stringify({ session_id: sessao })],
        );
        const agora = Date.now();
        const comando = await prepararComandoCriarContato(
          {
            pacienteId: '66000000-0000-4000-8000-000000000099',
            corpo: { tipo: 'email', valor: 'ficticio@example.test' },
            cabecalhos: { 'x-chave-idempotencia': `contato-${randomUUID()}` },
            contexto: {
              key_id: 'v1',
              usuario_id: usuario,
              session_id: sessao,
              request_id: randomUUID(),
              emitido_em: new Date(agora - 1000).toISOString(),
              expira_em: new Date(agora + 30000).toISOString(),
            },
          },
          {
            cifra: criarCifraAutenticada({
              keyIdAtiva: 'v1',
              chavesDeCifra: { v1: new Uint8Array(32).fill(17) },
              chaveHmac: new Uint8Array(32).fill(43),
            }),
            atestador: criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) }),
            idempotencia: {
              async calcularDigestIdempotencia(logico: string) {
                return createHmac('sha256', Buffer.alloc(32, 4)).update(logico).digest('base64url');
              },
            },
          },
        );
        const chamar = async () => {
          const resultado = await client.query<{ resultado: unknown }>(
            'select experimento_atestado.criar_contato_com_prova_fixture($1::jsonb,1,$2::bytea) as resultado',
            [JSON.stringify(comando.p_entrada), Buffer.alloc(32, 1)],
          );
          return assinaturasRpc.criarContato.saida.parse(resultado.rows[0]?.resultado);
        };
        const autoridade = await client.query<{ valida: boolean }>(
          'select saida_fixture.autorizar_prova(1,$1::bytea) and experimento_atestado.verificar_criar_contato_fixture($2::jsonb) as valida',
          [Buffer.alloc(32, 1), JSON.stringify(comando.p_entrada)],
        );
        expect(autoridade.rows[0]?.valida).toBe(true);
        if (criado) expect((await chamar()).ok).toBe(true);
        const motivo = { formato: 1, key_id: 'v1', nonce: 'fake', ciphertext: 'fake', tag: 'fake' };
        const revogada = await client.query(
          'update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=$2,motivo_revogacao_cifrado=$3::jsonb where session_id=$1 and revogada_em is null',
          [sessao, usuario, JSON.stringify(motivo)],
        );
        expect(revogada.rowCount).toBe(1);
        if (tipo === 'concessão') {
          // O trigger exige revogar primeiro as sessões; não se testa concessão
          // revogada com sessão ativa, pois esse estado é recusado pelo banco.
          const concessao = await client.query(
            "update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=$2,motivo_revogacao_cifrado=$3::jsonb where id=$1 and estado='vinculada'",
            ['62000000-0000-4000-8000-000000000001', usuario, JSON.stringify(motivo)],
          );
          expect(concessao.rowCount).toBe(1);
        }
        const resultado = await chamar();
        expect(resultado.ok).toBe(false);
        if (resultado.ok) throw new Error('Revogação ignorada.');
        expect(resultado.erro.codigo).toBe('sem_permissao');
        expect(resultado).not.toHaveProperty('dados');
        const registro = await client.query<{ quantidade: number }>(
          'select count(*)::int as quantidade from cadastro.contato_paciente where id=$1',
          [comando.p_entrada.entrada.contato_id],
        );
        expect(registro.rows[0]?.quantidade).toBe(criado ? 1 : 0);
        const requisicoes = await client.query<{ quantidade: number }>(
          'select count(*)::int as quantidade from operacao.requisicao where chave_idempotencia=$1',
          [comando.p_entrada.entrada.chave_idempotencia],
        );
        expect(requisicoes.rows[0]?.quantidade).toBe(criado ? 1 : 0);
        const auditoria = await client.query<{ existe: boolean }>(
          "select exists(select 1 from auditoria.evento where request_id=$1 and resultado='negado') as existe",
          [comando.p_entrada.entrada.request_id],
        );
        expect(auditoria.rows[0]?.existe).toBe(true);
      } finally {
        await client.query('rollback').catch(() => undefined);
        await client.end();
      }
    },
  );
});
