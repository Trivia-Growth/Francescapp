import { expect, it } from 'vitest';
import pg from 'pg';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import { operarPlanoCriseNativo } from './plano-crise-nativo.ts';
import { executarPlanoCriseNativo } from './executor-plano-crise-nativo.ts';
import { operarHabilitacaoCriseNativa } from './habilitacao-crise-nativa.ts';
import { executarHabilitacaoCriseNativa } from './executor-habilitacao-crise-nativo.ts';

it.skipIf(!process.env.FFCM_PG_SOCKET)(
  'integra plano de crise, marca de habilitação, cifra, atestado e PostgreSQL descartável',
  async () => {
    const pool = new pg.Pool({
      host: process.env.FFCM_PG_SOCKET,
      port: 55454,
      user: 'cadeia_fixture',
      database: 'ffcm_cadeia_local',
    });
    const administrador_id = '10000000-0000-4000-8000-000000000001';
    const sessao_admin_id = '20000000-0000-4000-8000-000000000001';
    const profissional_id = '10000000-0000-4000-8000-000000000002';
    const sessao_prof_id = '20000000-0000-4000-8000-000000000002';
    const concessao_prof_id = '30000000-0000-4000-8000-000000000002';
    const paciente_id = '40000000-0000-4000-8000-000000000001';
    const cifra = criarCifraAutenticada({
      keyIdAtiva: 'teste',
      chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
      chaveHmac: new Uint8Array(32).fill(4),
    });
    const chamar = (claims: Record<string, unknown>, funcao: string) => ({
      schema: () => ({
        rpc: async (_nome: string, args: { p_transporte: unknown }) => {
          const c = await pool.connect();
          try {
            await c.query('begin');
            await c.query("select set_config('request.jwt.claims', $1, true)", [
              JSON.stringify(claims),
            ]);
            await c.query('set local role authenticated');
            const result = await c.query(`select ${funcao}($1::jsonb) as dados`, [
              JSON.stringify(args.p_transporte),
            ]);
            await c.query('commit');
            return { data: result.rows[0].dados, error: null };
          } catch (error) {
            await c.query('rollback');
            return { data: null, error };
          } finally {
            c.release();
          }
        },
      }),
    });
    const atestador = criarAtestadorOperacao({
      keyId: 'teste',
      chave: new Uint8Array(32).fill(0x42),
    });
    const metadados = (request_id: string) => {
      const agora = Date.now();
      return {
        key_id: 'teste',
        request_id,
        emitido_em: new Date(agora - 1000).toISOString(),
        expira_em: new Date(agora + 20000).toISOString(),
      };
    };
    const portasPara = (usuario_id: string, session_id: string, chave: string) => {
      const request = new Request('https://example.test', {
        headers: { 'x-sessao': session_id, 'x-chave-idempotencia': chave },
      });
      const autorizado = async () => ({
        estado: 'autorizado' as const,
        identidade: { usuario_id, session_id },
      });
      const comuns = {
        autorizar: autorizado,
        revalidar: autorizado,
        cifra,
        atestador,
        metadados,
        idempotencia: criarIdempotenciaNativa(cifra),
      };
      const claims = { sub: usuario_id, session_id, amr: [{ method: 'oauth' }] };
      return {
        request,
        plano: {
          ...comuns,
          executar: (_req: Request, transporte: Parameters<typeof executarPlanoCriseNativo>[1]) =>
            executarPlanoCriseNativo(
              chamar(claims, 'api.plano_crise_operacao_privada') as never,
              transporte,
            ),
        },
        habilitacao: {
          ...comuns,
          executar: (
            _req: Request,
            transporte: Parameters<typeof executarHabilitacaoCriseNativa>[1],
          ) =>
            executarHabilitacaoCriseNativa(
              chamar(claims, 'api.habilitacao_plano_crise_privado') as never,
              transporte,
            ),
        },
      };
    };
    const conteudo = {
      responsaveis: [
        { id: 'r1', nome: 'Responsável fictícia', papel: 'Mãe', contato: '(11) 90000-0000' },
      ],
      contatos: [{ id: 'c1', descricao: 'Crise fora do horário', telefone: '(11) 90000-0001' }],
      limites_servico: 'A coordenação organiza o cuidado e não atende emergência presencial.',
      data_revisao: '2027-03-01',
    };
    try {
      // A listagem decifra o e-mail de cada concessão; os envelopes da fixture são
      // marcadores, então aqui eles viram envelopes reais antes de qualquer leitura.
      const conexao = await pool.connect();
      try {
        for (const [concessao, email] of [
          [concessao_prof_id, 'equipe.ficticia@example.test'],
          ['30000000-0000-4000-8000-000000000001', 'coordenacao.ficticia@example.test'],
        ] as const) {
          const envelope = await cifra.cifrar(email, {
            tabela: 'identidade.concessao_equipe',
            registro_id: concessao,
            campo: 'email',
            formato: 1,
          });
          await conexao.query(
            'update identidade.concessao_equipe set email_cifrado=$1 where id=$2',
            [JSON.stringify(envelope), concessao],
          );
        }
      } finally {
        conexao.release();
      }

      const prof = portasPara(profissional_id, sessao_prof_id, 'crise_ficticia_1');
      const vazio = await operarPlanoCriseNativo(
        prof.request,
        { operacao: 'ler', paciente_id },
        prof.plano,
      );
      expect(vazio).toMatchObject({ ok: true, dados: null });

      const criado = await operarPlanoCriseNativo(
        prof.request,
        { operacao: 'gravar', paciente_id, versao_esperada: 0, conteudo },
        prof.plano,
      );
      // Texto decifrado de volta prova que a cifra e o AAD fecham ponta a ponta.
      expect(criado).toMatchObject({
        ok: true,
        dados: { versao: 1, aprovacao: null, conteudo: { data_revisao: '2027-03-01' } },
      });
      const registro_id = criado.ok && criado.dados ? criado.dados.registro_id : '';
      expect(registro_id).toMatch(/^[0-9a-f-]{36}$/);

      // Sem a marca de habilitação, o profissional não aprova.
      const semMarca = await operarPlanoCriseNativo(
        portasPara(profissional_id, sessao_prof_id, 'crise_ficticia_2').request,
        { operacao: 'aprovar', paciente_id, registro_id, versao: 1 },
        prof.plano,
      );
      expect(semMarca).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });

      // Profissional também não administra a marca.
      const marcaNegada = await operarHabilitacaoCriseNativa(
        portasPara(profissional_id, sessao_prof_id, 'marca_ficticia_0').request,
        {
          operacao: 'gravar',
          concessao_id: concessao_prof_id,
          habilitado: true,
          versao_esperada: 0,
        },
        prof.habilitacao,
      );
      expect(marcaNegada).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });

      const admin = portasPara(administrador_id, sessao_admin_id, 'marca_ficticia_1');
      const equipe = await operarHabilitacaoCriseNativa(
        admin.request,
        { operacao: 'listar' },
        admin.habilitacao,
      );
      expect(equipe).toMatchObject({
        ok: true,
        dados: expect.arrayContaining([
          expect.objectContaining({
            concessao_id: concessao_prof_id,
            email: 'equipe.ficticia@example.test',
            habilitado: false,
          }),
        ]),
      });

      const marcado = await operarHabilitacaoCriseNativa(
        admin.request,
        {
          operacao: 'gravar',
          concessao_id: concessao_prof_id,
          habilitado: true,
          versao_esperada: 0,
        },
        admin.habilitacao,
      );
      expect(marcado).toMatchObject({
        ok: true,
        dados: { concessao_id: concessao_prof_id, habilitado: true, versao: 1 },
      });

      const aprovado = await operarPlanoCriseNativo(
        portasPara(profissional_id, sessao_prof_id, 'crise_ficticia_3').request,
        { operacao: 'aprovar', paciente_id, registro_id, versao: 1 },
        prof.plano,
      );
      expect(aprovado).toMatchObject({
        ok: true,
        dados: { versao: 1, aprovacao: { aprovador_usuario_id: profissional_id } },
      });

      // Editar cria versão nova, que volta a precisar de aprovação.
      const editado = await operarPlanoCriseNativo(
        portasPara(profissional_id, sessao_prof_id, 'crise_ficticia_4').request,
        {
          operacao: 'gravar',
          paciente_id,
          versao_esperada: 1,
          conteudo: { ...conteudo, data_revisao: '2027-06-01' },
        },
        prof.plano,
      );
      expect(editado).toMatchObject({ ok: true, dados: { versao: 2, aprovacao: null } });

      // Sessão encerrada perde o acesso mesmo com atestado válido.
      const encerrar = await pool.connect();
      try {
        await encerrar.query(
          'update identidade.sessao set encerrada_em = clock_timestamp() where session_id = $1',
          [sessao_prof_id],
        );
      } finally {
        encerrar.release();
      }
      const negado = await operarPlanoCriseNativo(
        prof.request,
        { operacao: 'ler', paciente_id },
        prof.plano,
      );
      expect(negado).toMatchObject({ ok: false, erro: { codigo: 'sem_permissao' } });
    } finally {
      await pool.end();
    }
  },
);
