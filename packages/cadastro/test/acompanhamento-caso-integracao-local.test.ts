import { createHmac, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { dadosAtestadoSchema, resultadoAtestacaoSchema } from '@ffcmapp/contratos';
import { Client } from 'pg';
import { expect, it } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import {
  executarEdicaoPacientePrivada,
  prepararEdicaoPacientePrivada,
} from '../src/editar-paciente-privado.ts';
import { projetarPacienteEdicaoExperimental } from '../src/projetar-paciente-experimental.ts';

const socket = process.env.FFCM_ACOMPANHAMENTO_SOCKET;
const admin = '10000000-0000-4000-8000-000000000001';
const sessao = '20000000-0000-4000-8000-000000000001';
const profissional = '10000000-0000-4000-8000-000000000003';
const familia = '10000000-0000-4000-8000-000000000005';
// Paciente próprio da prova: cifrado pelo mesmo adaptador, para a leitura poder decifrá-lo.
const paciente = randomUUID();

// Prova a ligação TypeScript e SQL: o que a preparação assina é aceito pela função real, o motivo
// cifrado pelo servidor é decifrado com o AAD do evento e qualquer campo novo alterado após a
// assinatura é recusado. Chaves e Auth são fictícios; a fixture vem de acompanhamento_caso_local.sql.
it.skipIf(!socket)(
  'situação e responsável assinados chegam íntegros ao SQL e voltam com o motivo decifrado',
  async () => {
    if (!socket || !/ffcm-acompanhamento-caso\.[A-Za-z0-9]+$/.test(socket))
      throw new Error('fixture inválida');
    const cliente = new Client({
      host: socket,
      port: 5432,
      user: 'cadeia_fixture',
      database: 'ffcm_cadeia_local',
    });
    await cliente.connect();
    try {
      const alvo = await cliente.query(
        "select inet_server_addr() ip, current_setting('data_directory') dados",
      );
      if (
        alvo.rows[0].ip !== null ||
        ![resolve(socket), realpathSync(socket)].some(
          (raiz) => alvo.rows[0].dados === `${raiz}/data`,
        )
      )
        throw new Error(`fixture inválida: ${JSON.stringify(alvo.rows[0])} em ${socket}`);
      await cliente.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: admin, session_id: sessao, amr: [{ method: 'oauth' }] }),
      ]);
      const atestador = criarAtestadorOperacao({
        keyId: 'teste',
        chave: new Uint8Array(32).fill(0x42),
      });
      const cifra = criarCifraAutenticada({
        keyIdAtiva: 'teste',
        chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
        chaveHmac: new Uint8Array(32).fill(2),
      });
      const idempotencia = {
        async calcularDigestIdempotencia(valor: string) {
          return createHmac('sha256', Buffer.alloc(32, 4)).update(valor).digest('base64url');
        },
      };
      await cliente.query(
        'insert into cadastro.paciente(id, nome_cifrado, criado_por_usuario_id) values ($1, $2::jsonb, $3)',
        [
          paciente,
          JSON.stringify(
            await cifra.cifrar('Paciente Fictício', {
              tabela: 'cadastro.paciente',
              registro_id: paciente,
              campo: 'nome',
              formato: 1,
            }),
          ),
          admin,
        ],
      );
      const contexto = (requestId = randomUUID()) => ({
        key_id: 'teste',
        usuario_id: admin,
        session_id: sessao,
        request_id: requestId,
        emitido_em: new Date(Date.now() - 1000).toISOString(),
        expira_em: new Date(Date.now() + 20000).toISOString(),
      });
      const um = async (sql: string, parametros: unknown[]) =>
        (await cliente.query(sql, parametros)).rows[0];

      async function ciclo(corpoDe: (versao: number) => Record<string, unknown>) {
        const { epoca } = await um(
          'select coalesce((select epoca from operacao.barreira_edicao_paciente where ator_usuario_id=$1),1)::int epoca',
          [admin],
        );
        const { versao } = await um('select versao from cadastro.paciente where id=$1', [paciente]);
        const reserva = randomUUID();
        const { r } = await um('select operacao.reservar_edicao_paciente_privado($1,$2,$3,$4) r', [
          admin,
          epoca,
          reserva,
          paciente,
        ]);
        expect(r).toBe('aberta');
        const transporte = await prepararEdicaoPacientePrivada(
          {
            pacienteId: paciente,
            reservaId: reserva,
            geracaoReserva: epoca,
            corpo: { motivo: 'Mudança fictícia', versao_esperada: versao, ...corpoDe(versao) },
            cabecalhos: { 'x-chave-idempotencia': `chave-${randomUUID()}` },
            contexto: contexto(),
          },
          { cifra, atestador, idempotencia },
        );
        const executar = async (entrada: typeof transporte.p_entrada) =>
          (
            await cliente.query('select api.editar_paciente_privado($1::jsonb) resultado', [
              JSON.stringify(entrada),
            ])
          ).rows[0].resultado;
        const fechar = async () => {
          const comando = randomUUID();
          await um('select operacao.encerrar_edicao_paciente_privado($1,$2,$3,$4) r', [
            admin,
            epoca,
            reserva,
            comando,
          ]);
          await um('select operacao.reconhecer_barreira_edicao_paciente_privado($1,$2) r', [
            comando,
            randomUUID(),
          ]);
        };
        return { transporte, executar, fechar, versao };
      }

      // Alteração de situação ou responsável depois de assinada é recusada (digest cobre os campos novos).
      const adulterada = await ciclo(() => ({ situacao: 'ativo', responsavel_id: profissional }));
      const copia = structuredClone(adulterada.transporte.p_entrada);
      (copia.entrada as Record<string, unknown>).situacao = 'encerrado';
      await expect(adulterada.executar(copia)).rejects.toMatchObject({ code: '42501' });
      const outraCopia = structuredClone(adulterada.transporte.p_entrada);
      (outraCopia.entrada as Record<string, unknown>).responsavel_id = admin;
      await expect(adulterada.executar(outraCopia)).rejects.toMatchObject({ code: '42501' });
      await adulterada.fechar();

      // Responsável inelegível: resposta tipada, nada gravado.
      const antes = await um(
        'select count(*)::int n from cadastro.acompanhamento_caso where paciente_id=$1',
        [paciente],
      );
      const inelegivel = await ciclo(() => ({ responsavel_id: familia }));
      expect(
        await executarEdicaoPacientePrivada(inelegivel.transporte, inelegivel.executar),
      ).toMatchObject({
        ok: false,
        erro: { codigo: 'responsavel_invalido' },
      });
      await inelegivel.fechar();
      expect(
        (
          await um(
            'select count(*)::int n from cadastro.acompanhamento_caso where paciente_id=$1',
            [paciente],
          )
        ).n,
      ).toBe(antes.n);

      // Caminho feliz, com repetição idempotente que não duplica a linha.
      const gravacao = await ciclo(() => ({ situacao: 'pausado', responsavel_id: profissional }));
      expect(
        await executarEdicaoPacientePrivada(gravacao.transporte, gravacao.executar),
      ).toMatchObject({ ok: true, dados: { paciente_id: paciente, versao: gravacao.versao + 1 } });
      expect(
        await executarEdicaoPacientePrivada(gravacao.transporte, gravacao.executar),
      ).toMatchObject({ ok: true, repeticao: true });
      await gravacao.fechar();
      expect(
        (
          await um(
            'select count(*)::int n from cadastro.acompanhamento_caso where paciente_id=$1',
            [paciente],
          )
        ).n,
      ).toBe(antes.n + 1);

      // Leitura de edição: o servidor decifra o motivo com o AAD do evento de auditoria.
      const requestId = randomUUID();
      const entrada = { request_id: requestId, paciente_id: paciente };
      const prova = resultadoAtestacaoSchema.parse(
        await atestador.atestarEntrada(
          { ...contexto(requestId), operacao: 'api.consultar_paciente_edicao' },
          entrada,
        ),
      );
      const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
      const envelope = (
        await cliente.query('select api.consultar_paciente_edicao_privado($1::jsonb) resultado', [
          JSON.stringify({
            entrada: { ...entrada, atestado: { ...dados, mac: prova.atestado.mac } },
            entrada_canonica: prova.entradaCanonica,
            dados_canonicos: prova.dadosCanonicos,
          }),
        ])
      ).rows[0].resultado;
      expect(envelope.ok).toBe(true);
      const leitura = await projetarPacienteEdicaoExperimental(envelope.dados, cifra);
      expect(leitura.acompanhamento[0]).toMatchObject({
        versao: gravacao.versao + 1,
        situacao: 'pausado',
        responsavel_id: profissional,
        responsavel_ativo: true,
        ator_id: admin,
        motivo: 'Mudança fictícia',
      });
      expect(leitura.acompanhamento.length).toBe(antes.n + 1);
    } finally {
      await cliente.end();
    }
  },
);
