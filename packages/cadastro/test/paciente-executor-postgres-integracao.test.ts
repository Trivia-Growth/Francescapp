import { createHash, createHmac, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { lstatSync } from 'node:fs';
import { Pool } from 'pg';
import { expect, it } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarExecutorPacientePostgresExperimental } from '../../../supabase/functions/_shared/paciente-postgres-experimental.ts';
import { executarCriacaoPacienteExperimental } from '../src/executor-paciente-experimental.ts';

const socket = process.env.FFCM_PACIENTE_SOCKET;
const admin = process.env.FFCM_PACIENTE_ADMIN;
it.skipIf(!socket || !admin)(
  'criação com reserva, rollback, auditoria e revogação em fixture local',
  async () => {
    if (!socket || !/^\/tmp\/ffcm-admissao\.[A-Za-z0-9]+$/.test(socket) || !admin)
      throw new Error('cluster inválido');
    const uid = process.getuid?.();
    const dir = lstatSync(socket);
    const sock = lstatSync(`${socket}/.s.PGSQL.5432`);
    if (
      uid === undefined ||
      !dir.isDirectory() ||
      dir.isSymbolicLink() ||
      dir.uid !== uid ||
      (dir.mode & 0o777) !== 0o700 ||
      !sock.isSocket() ||
      sock.isSymbolicLink() ||
      sock.uid !== uid ||
      (sock.mode & 0o777) !== 0o700
    )
      throw new Error('socket inválido');
    const opcoes = {
      host: socket,
      port: 5432,
      database: 'ffcm_reserva_paciente_fixture',
      connectionTimeoutMillis: 3000,
      query_timeout: 15000,
    };
    const controle = new Pool({ ...opcoes, user: admin });
    const executor = new Pool({ ...opcoes, user: 'ffcm_paciente_login_fixture' });
    const usuario = '61000000-0000-4000-8000-000000000001';
    const sessao = '63000000-0000-4000-8000-000000000001';
    const reserva = { reserva_id: '68000000-0000-4000-8000-000000000001', geracao_reserva: 1 };
    const cifra = criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(11) },
      chaveHmac: new Uint8Array(32).fill(12),
    });
    const atestador = criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    const idempotencia = {
      async calcularDigestIdempotencia(valor: string) {
        return createHmac('sha256', Buffer.alloc(32, 4)).update(valor).digest('base64url');
      },
    };
    const solicitacao = {
      corpo: { nome: 'Paciente Fictício' },
      cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
    };
    const contexto = (request_id: string) => ({
      key_id: 'v1',
      usuario_id: usuario,
      session_id: sessao,
      request_id,
      emitido_em: new Date(Date.now() - 1000).toISOString(),
      expira_em: new Date(Date.now() + 30000).toISOString(),
    });
    let pacienteRevertido: string | undefined;
    let papelObservado: string | undefined;
    async function executar(request_id: string, forcarRollback = false) {
      return executarCriacaoPacienteExperimental(solicitacao, contexto(request_id), {
        cifra,
        atestador,
        idempotencia,
        reserva,
        rpc: {
          async executar(transporte) {
            const cliente = await executor.connect();
            try {
              await cliente.query('begin');
              await cliente.query('set local role ffcm_paciente_executor_fixture');
              papelObservado = (await cliente.query('select current_user nome')).rows[0].nome;
              await cliente.query(
                "select set_config('ffcm_fixture.usuario',$1,true),set_config('ffcm_fixture.sessao',$2,true),set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$3,true)",
                [usuario, sessao, JSON.stringify({ session_id: sessao })],
              );
              const resultado = await cliente.query(
                'select reserva_fixture.criar_paciente_reservado_fixture($1::jsonb,$2::bigint,$3::bytea) resultado',
                [
                  JSON.stringify(transporte.p_entrada),
                  1,
                  createHash('sha256').update(Buffer.alloc(32)).digest(),
                ],
              );
              if (forcarRollback) {
                if (resultado.rows[0]?.resultado?.ok === true)
                  pacienteRevertido = resultado.rows[0].resultado.dados.paciente_id;
                throw new Error('rollback de teste');
              }
              if ((await cliente.query('commit')).command !== 'COMMIT')
                throw new Error('transação não confirmada');
              return resultado.rows[0]?.resultado;
            } catch (erro) {
              await cliente.query('rollback');
              throw erro;
            } finally {
              cliente.release();
            }
          },
        },
      });
    }
    try {
      const alvo = await controle.query(
        "select current_database() banco,current_setting('unix_socket_directories') socket,current_setting('data_directory') dados,inet_server_addr() ip,current_setting('ffcm_fixture.token_servidor',true) token,current_setting('ffcm_fixture.token_esperado',true) esperado",
      );
      expect(alvo.rows[0]).toEqual({
        banco: 'ffcm_reserva_paciente_fixture',
        socket,
        dados: `${socket}/data`,
        ip: null,
        token: socket.split('/').at(-1),
        esperado: socket.split('/').at(-1),
      });
      expect(
        (await controle.query("select to_regclass('cadastro.paciente')::text nome")).rows[0].nome,
      ).toBe('cadastro.paciente');
      const restrita = await executor.connect();
      try {
        await restrita.query('set role ffcm_paciente_executor_fixture');
        expect((await restrita.query('select current_user nome')).rows[0].nome).toBe(
          'ffcm_paciente_executor_fixture',
        );
        await expect(restrita.query('select * from cadastro.paciente')).rejects.toMatchObject({
          code: '42501',
        });
      } finally {
        restrita.release(true);
      }
      const tentativa = randomUUID();
      await expect(executar(tentativa, true)).rejects.toMatchObject({
        name: 'ResultadoCadastroIncerto',
      });
      expect(papelObservado).toBe('ffcm_paciente_executor_fixture');
      expect(pacienteRevertido).toMatch(/^[0-9a-f-]{36}$/);
      expect(
        (
          await controle.query('select count(*)::int n from cadastro.paciente where id=$1', [
            pacienteRevertido,
          ])
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await controle.query(
            'select count(*)::int n from operacao.requisicao where resultado_id=$1',
            [pacienteRevertido],
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await controle.query(
            'select count(*)::int n from reserva_fixture.efeito where reserva_id=$1',
            [reserva.reserva_id],
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await controle.query('select count(*)::int n from auditoria.evento where request_id=$1', [
            tentativa,
          ])
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await controle.query('select estado from reserva_fixture.reserva where id=$1', [
            reserva.reserva_id,
          ])
        ).rows[0].estado,
      ).toBe('aberta');
      const chaveJwt = new Uint8Array(64).fill(9);
      const issuer = 'https://ficticio.supabase.co/auth/v1';
      const jwt = await new SignJWT({ session_id: sessao })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(usuario)
        .setIssuer(issuer)
        .setAudience('authenticated')
        .setExpirationTime('5m')
        .sign(chaveJwt);
      const postgres = criarExecutorPacientePostgresExperimental(executor, {
        issuer,
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256'],
        chaveDeVerificacao: chaveJwt,
      });
      const repetir = (requestId: string) =>
        executarCriacaoPacienteExperimental(solicitacao, contexto(requestId), {
          cifra,
          atestador,
          idempotencia,
          reserva,
          rpc: {
            executar: (transporte) =>
              postgres({ jwt, prova: 'A'.repeat(43), geracao: 1, transporte }),
          },
        });
      const request = randomUUID();
      const resultado = await repetir(request);
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) throw new Error('cadastro negado');
      expect(resultado.dados.nome).toBe('Paciente Fictício');
      const gravado = await controle.query(
        'select nome_cifrado from cadastro.paciente where id=$1',
        [resultado.dados.id],
      );
      expect(gravado.rows).toHaveLength(1);
      expect(JSON.stringify(gravado.rows)).not.toContain('Paciente Fictício');
      const requestRepeticao = randomUUID();
      const repetido = await repetir(requestRepeticao);
      expect(repetido).toMatchObject({
        ok: true,
        dados: { id: resultado.dados.id, nome: 'Paciente Fictício' },
      });
      expect(
        (
          await controle.query(
            "select count(*)::int n from auditoria.evento where request_id=$1 and resultado='permitido' and acao='api.criar_paciente.repeticao' and objeto_id=$2",
            [requestRepeticao, resultado.dados.id],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await controle.query(
            "select count(*)::int n from auditoria.evento where request_id=$1 and resultado='permitido' and acao='api.criar_paciente' and objeto_id=$2",
            [request, resultado.dados.id],
          )
        ).rows[0].n,
      ).toBeGreaterThan(0);
      await controle.query(
        'update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=$2,motivo_revogacao_cifrado=$3::jsonb where session_id=$1',
        [
          sessao,
          usuario,
          JSON.stringify({ formato: 1, key_id: 'teste', nonce: 'n', ciphertext: 'c', tag: 't' }),
        ],
      );
      const revogada = randomUUID();
      const revogadaExecutor = randomUUID();
      expect(await repetir(revogadaExecutor)).toMatchObject({
        ok: false,
        erro: { codigo: 'sem_permissao' },
      });
      expect(
        (
          await controle.query(
            "select count(*)::int n from auditoria.evento where request_id=$1 and resultado='negado'",
            [revogadaExecutor],
          )
        ).rows[0].n,
      ).toBe(1);
      const resposta = await executar(revogada);
      expect(resposta).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
      expect(
        (
          await controle.query(
            "select count(*)::int n from auditoria.evento where request_id=$1 and resultado='negado'",
            [revogada],
          )
        ).rows[0].n,
      ).toBeGreaterThan(0);
    } finally {
      await executor.end();
      await controle.end();
    }
  },
);
