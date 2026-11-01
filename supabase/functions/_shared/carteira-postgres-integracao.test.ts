import { randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { SignJWT } from 'jose';
import { Pool } from 'pg';
import { expect, it } from 'vitest';
import { prepararCarteiraExperimental } from '../../../packages/cadastro/src/preparar-carteira-experimental.ts';
import { criarHandlerCarteiraExperimental } from '../../../packages/cadastro/src/http-carteira-experimental.ts';
import { criarCursorCarteira } from '../../../packages/cadastro/src/cursor-carteira.ts';
import { criarAtestadorOperacao } from './atestado-operacao.ts';
import { criarCifraAutenticada } from './cifra-autenticada.ts';
import { criarAutorizadorCarteiraExperimental } from './sessao/autorizar-carteira-experimental.ts';
import { criarExecutorCarteiraPostgresExperimental } from './carteira-postgres-experimental.ts';

// Apenas com o runner local: identidade Auth e chave de atestado são fixtures.
const socket = process.env.FFCM_CARTEIRA_SOCKET;
const admin = process.env.FFCM_CARTEIRA_ADMIN;
it.skipIf(!socket || !admin)(
  'executor restrito consulta e audita; prova inválida e sessão revogada são negadas',
  async () => {
    if (!socket || !/^\/tmp\/ffcm-admissao\.[A-Za-z0-9]+$/.test(socket) || !admin)
      throw new Error('socket inválido');
    const uid = process.getuid?.();
    if (uid === undefined) throw new Error('identidade local indisponível');
    const diretorio = lstatSync(socket);
    const conexaoLocal = lstatSync(`${socket}/.s.PGSQL.5432`);
    if (
      !diretorio.isDirectory() ||
      diretorio.isSymbolicLink() ||
      diretorio.uid !== uid ||
      (diretorio.mode & 0o777) !== 0o700 ||
      !conexaoLocal.isSocket() ||
      conexaoLocal.isSymbolicLink() ||
      conexaoLocal.uid !== uid ||
      (conexaoLocal.mode & 0o777) !== 0o700
    )
      throw new Error('socket privado inválido');
    const opcoes = {
      host: socket,
      port: 5432,
      database: 'ffcm_carteira_fixture',
      connectionTimeoutMillis: 3000,
      query_timeout: 15000,
    };
    const controle = new Pool({ ...opcoes, user: admin });
    const restrito = new Pool({ ...opcoes, user: 'ffcm_carteira_login_fixture' });
    const usuario = '61000000-0000-4000-8000-000000000001';
    const sessao = '63000000-0000-4000-8000-000000000001';
    const chave = new Uint8Array(64).fill(9);
    const issuer = 'https://ficticio.supabase.co/auth/v1';
    const jwt = await new SignJWT({ session_id: sessao })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(chave);
    const executar = criarExecutorCarteiraPostgresExperimental(restrito, {
      issuer,
      audience: 'authenticated',
      algoritmosPermitidos: ['HS256'],
      chaveDeVerificacao: chave,
    });
    async function transporte(request: string, ator = usuario, sessaoAtual = sessao) {
      const agora = Date.now();
      return prepararCarteiraExperimental(
        {
          contexto: {
            key_id: 'v1',
            usuario_id: ator,
            session_id: sessaoAtual,
            request_id: request,
            emitido_em: new Date(agora - 1000).toISOString(),
            expira_em: new Date(agora + 30000).toISOString(),
          },
          consulta: { limite: 10 },
        },
        criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) }),
      );
    }
    try {
      const alvo = await controle.query(
        "select current_database() banco, current_setting('unix_socket_directories') socket, current_setting('data_directory') dados, inet_server_addr() ip, current_setting('ffcm_fixture.token_servidor',true) token, current_setting('ffcm_fixture.token_esperado',true) esperado",
      );
      expect(alvo.rows[0]).toEqual({
        banco: 'ffcm_carteira_fixture',
        socket,
        dados: `${socket}/data`,
        ip: null,
        token: socket.split('/').at(-1),
        esperado: socket.split('/').at(-1),
      });
      const role = await restrito.query(
        'select current_user nome, rolsuper, rolbypassrls from pg_roles where rolname=current_user',
      );
      expect(role.rows[0]).toEqual({
        nome: 'ffcm_carteira_login_fixture',
        rolsuper: false,
        rolbypassrls: false,
      });
      expect(
        (await controle.query("select to_regclass('cadastro.paciente')::text nome")).rows[0].nome,
      ).toBe('cadastro.paciente');
      await expect(restrito.query('select * from cadastro.paciente')).rejects.toMatchObject({
        code: '42501',
      });
      const conexao = await restrito.connect();
      try {
        await conexao.query('set role ffcm_carteira_executor_fixture');
        expect((await conexao.query('select current_user nome')).rows[0].nome).toBe(
          'ffcm_carteira_executor_fixture',
        );
        await expect(conexao.query('select * from cadastro.paciente')).rejects.toMatchObject({
          code: '42501',
        });
      } finally {
        conexao.release(true);
      }
      const permitido = randomUUID();
      const resultado = await executar({
        jwt,
        prova: 'A'.repeat(43),
        geracao: 1,
        transporte: await transporte(permitido),
      });
      expect(resultado.ok).toBe(true);
      if (!resultado.ok) throw new Error('consulta negada');
      expect(resultado.dados.itens.map((item) => item.paciente_id).sort()).toEqual([
        '66000000-0000-4000-8000-000000000001',
        '66000000-0000-4000-8000-000000000002',
      ]);
      const outroUsuario = '61000000-0000-4000-8000-000000000002';
      const outraSessao = '63000000-0000-4000-8000-000000000002';
      const outroJwt = await new SignJWT({ session_id: outraSessao })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(outroUsuario)
        .setIssuer(issuer)
        .setAudience('authenticated')
        .setExpirationTime('5m')
        .sign(chave);
      const outraConsulta = randomUUID();
      const outroResultado = await executar({
        jwt: outroJwt,
        prova: 'A'.repeat(43),
        geracao: 1,
        transporte: await transporte(outraConsulta, outroUsuario, outraSessao),
      });
      expect(outroResultado.ok).toBe(true);
      if (!outroResultado.ok) throw new Error('consulta negada');
      expect(outroResultado.dados.itens.map((item) => item.paciente_id)).toEqual([
        '66000000-0000-4000-8000-000000000001',
      ]);
      const cifra = criarCifraAutenticada({
        keyIdAtiva: 'ficticia',
        chavesDeCifra: { ficticia: new Uint8Array(32).fill(8) },
        chaveHmac: new Uint8Array(32).fill(5),
      });
      for (const [id, nome] of [
        ['66000000-0000-4000-8000-000000000001', 'Paciente Um'],
        ['66000000-0000-4000-8000-000000000002', 'Paciente Dois'],
      ] as const) {
        const envelope = await cifra.cifrar(nome, {
          tabela: 'cadastro.paciente',
          registro_id: id,
          campo: 'nome',
          formato: 1,
        });
        await controle.query('update cadastro.paciente set nome_cifrado=$1::jsonb where id=$2', [
          JSON.stringify(envelope),
          id,
        ]);
      }
      const autorizar = criarAutorizadorCarteiraExperimental({
        issuer,
        audience: 'authenticated',
        algoritmosPermitidos: ['HS256'],
        chaveDeVerificacao: chave,
      });
      const handler = criarHandlerCarteiraExperimental({
        autorizar,
        cifra,
        cursores: await criarCursorCarteira(new Uint8Array(32).fill(6)),
        async consultar(identidade, entrada) {
          const agora = Date.now();
          const assinado = await prepararCarteiraExperimental(
            {
              contexto: {
                key_id: 'v1',
                usuario_id: identidade.usuario_id,
                session_id: identidade.session_id,
                request_id: entrada.request_id,
                emitido_em: new Date(agora - 1000).toISOString(),
                expira_em: new Date(agora + 30000).toISOString(),
              },
              consulta: {
                limite: entrada.limite,
                ...(entrada.cursor === undefined ? {} : { cursor: entrada.cursor }),
              },
            },
            criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) }),
          );
          return executar({
            jwt: identidade.jwt,
            prova: identidade.prova,
            geracao: identidade.geracao,
            transporte: assinado,
          });
        },
      });
      const requisicao = (token: string, prova = 'A'.repeat(43)) =>
        new Request('https://ficticio.test/api/pacientes?limite=10', {
          headers: {
            authorization: `Bearer ${token}`,
            'x-ffcm-prova-sessao': prova,
            'x-ffcm-geracao-sessao': '1',
          },
        });
      const respostaAdmin = await handler(requisicao(jwt));
      expect(respostaAdmin.status).toBe(200);
      const corpoAdmin = await respostaAdmin.json();
      expect(corpoAdmin.dados.itens.map((item: { nome: string }) => item.nome).sort()).toEqual([
        'Paciente Dois',
        'Paciente Um',
      ]);
      const respostaProfissional = await handler(requisicao(outroJwt));
      expect(respostaProfissional.status).toBe(200);
      const corpoProfissional = await respostaProfissional.json();
      expect(corpoProfissional.dados.itens.map((item: { nome: string }) => item.nome)).toEqual([
        'Paciente Um',
      ]);
      const respostaProva = await handler(requisicao(jwt, `${'B'.repeat(42)}A`));
      expect(respostaProva.status).toBe(403);
      const corpoProva = await respostaProva.json();
      for (const [corpo, resultadoAuditoria] of [
        [corpoAdmin, 'permitido'],
        [corpoProfissional, 'permitido'],
        [corpoProva, 'negado'],
      ] as const) {
        const evento = await controle.query(
          'select resultado from auditoria.evento where request_id=$1',
          [corpo.request_id],
        );
        expect(evento.rows).toEqual([{ resultado: resultadoAuditoria }]);
      }
      const negado = randomUUID();
      expect(
        (
          await executar({
            jwt,
            prova: `${'B'.repeat(42)}A`,
            geracao: 1,
            transporte: await transporte(negado),
          })
        ).ok,
      ).toBe(false);
      await controle.query(
        'update identidade.sessao set revogada_em=clock_timestamp(), revogada_por_usuario_id=$2, motivo_revogacao_cifrado=$3::jsonb where session_id=$1',
        [
          sessao,
          usuario,
          JSON.stringify({ formato: 1, key_id: 'ficticio', nonce: 'n', ciphertext: 'c', tag: 't' }),
        ],
      );
      const revogado = randomUUID();
      const respostaRevogada = await handler(requisicao(jwt));
      expect(respostaRevogada.status).toBe(403);
      const corpoRevogado = await respostaRevogada.json();
      expect(
        (
          await controle.query('select resultado from auditoria.evento where request_id=$1', [
            corpoRevogado.request_id,
          ])
        ).rows,
      ).toEqual([{ resultado: 'negado' }]);
      expect(
        (
          await executar({
            jwt,
            prova: 'A'.repeat(43),
            geracao: 1,
            transporte: await transporte(revogado),
          })
        ).ok,
      ).toBe(false);
      const auditoria = await controle.query(
        'select request_id::text, resultado from auditoria.evento where request_id=any($1::uuid[]) order by request_id',
        [[permitido, outraConsulta, negado, revogado]],
      );
      expect(auditoria.rows).toHaveLength(4);
      expect(new Map(auditoria.rows.map((linha) => [linha.request_id, linha.resultado]))).toEqual(
        new Map([
          [permitido, 'permitido'],
          [outraConsulta, 'permitido'],
          [negado, 'negado'],
          [revogado, 'negado'],
        ]),
      );
    } finally {
      await restrito.end();
      await controle.end();
    }
  },
);
