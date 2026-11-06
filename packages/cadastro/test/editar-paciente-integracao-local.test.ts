import { createHmac, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, it } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { prepararBarreiraEdicaoPacientePrivada } from '../src/barreira-edicao-paciente-privada.ts';
import {
  executarEdicaoPacientePrivada,
  prepararEdicaoPacientePrivada,
} from '../src/editar-paciente-privado.ts';

const socket = process.env.FFCM_EDICAO_SOCKET;
it.skipIf(!socket)(
  'entrada assinada chega integral ao SQL e rejeita alteração posterior',
  async () => {
    if (!socket || !/^\/tmp\/ffcm-editar-paciente\.[A-Za-z0-9]+$/.test(socket))
      throw new Error('fixture inválida');
    const cliente = new Client({ host: socket, port: 5432, database: 'postgres' });
    await cliente.connect();
    try {
      const alvo = await cliente.query(
        "select inet_server_addr() ip, current_setting('data_directory') dados",
      );
      if (alvo.rows[0].ip !== null || alvo.rows[0].dados !== `${socket}/data`)
        throw new Error('fixture inválida');
      await cliente.query(`create extension if not exists pgcrypto;
      create or replace function identidade.verificar_assinatura_atestado(ec text, dc text, eu jsonb, du jsonb, mac text)
      returns boolean language sql as $$
        select ec::jsonb = eu and dc::jsonb = du
          and translate(rtrim(encode(public.digest(convert_to(ec,'UTF8'),'sha256'),'base64'),'='),'+/','-_') = du->>'digest_entrada'
          and translate(rtrim(encode(public.hmac(convert_to('ffcmapp:atestado:v1:' || dc,'UTF8'),decode(repeat('03',32),'hex'),'sha256'),'base64'),'='),'+/','-_') = mac
      $$;
      update identidade.sessao set metodo='google_workspace', revogada_em=null;
      update cadastro.paciente set versao=1;
      delete from operacao.requisicao;
      delete from operacao.recibo_barreira_edicao_paciente;
      delete from operacao.reserva_edicao_paciente;
      delete from operacao.barreira_edicao_paciente;
      select set_config('teste.ator','10000000-0000-4000-8000-000000000002',false),
        set_config('teste.jwt','{"session_id":"50000000-0000-4000-8000-000000000001","amr":[{"method":"oauth"}]}',false)`);
      const pacienteId = '60000000-0000-4000-8000-000000000001';
      const contexto = {
        key_id: 'teste',
        usuario_id: '10000000-0000-4000-8000-000000000002',
        session_id: '50000000-0000-4000-8000-000000000001',
        request_id: randomUUID(),
        emitido_em: new Date(Date.now() - 1000).toISOString(),
        expira_em: new Date(Date.now() + 20000).toISOString(),
      };
      const atestador = criarAtestadorOperacao({
        keyId: 'teste',
        chave: new Uint8Array(32).fill(3),
      });
      const reserva = await prepararBarreiraEdicaoPacientePrivada(
        {
          operacao: 'api.reservar_edicao_paciente',
          epoca: 1,
          reserva_id: '90000000-0000-4000-8000-000000000001',
          paciente_id: pacienteId,
        },
        contexto,
        atestador,
      );
      const adulterada = structuredClone(reserva);
      if (adulterada.entrada.operacao !== 'api.reservar_edicao_paciente') throw new Error();
      adulterada.entrada.epoca = 2;
      await expect(
        cliente.query('select operacao.edicao_paciente_composicao_privada($1::jsonb)', [
          JSON.stringify(adulterada),
        ]),
      ).rejects.toMatchObject({ code: '42501' });
      const reservada = await cliente.query(
        'select operacao.edicao_paciente_composicao_privada($1::jsonb) resultado',
        [JSON.stringify(reserva)],
      );
      expect(reservada.rows[0].resultado).toMatchObject({ ok: true, dados: { estado: 'aberta' } });
      const transporte = await prepararEdicaoPacientePrivada(
        {
          pacienteId,
          reservaId: '90000000-0000-4000-8000-000000000001',
          geracaoReserva: 1,
          corpo: { nome: 'Pessoa fictícia', motivo: 'Correção fictícia', versao_esperada: 1 },
          cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
          contexto: {
            key_id: 'teste',
            usuario_id: '10000000-0000-4000-8000-000000000002',
            session_id: '50000000-0000-4000-8000-000000000001',
            request_id: randomUUID(),
            emitido_em: new Date(Date.now() - 1000).toISOString(),
            expira_em: new Date(Date.now() + 20000).toISOString(),
          },
        },
        {
          cifra: criarCifraAutenticada({
            keyIdAtiva: 'teste',
            chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
            chaveHmac: new Uint8Array(32).fill(2),
          }),
          atestador,
          idempotencia: {
            async calcularDigestIdempotencia(valor) {
              return createHmac('sha256', Buffer.alloc(32, 4)).update(valor).digest('base64url');
            },
          },
        },
      );
      const executar = async (entrada: typeof transporte.p_entrada) =>
        (
          await cliente.query('select operacao.editar_paciente_privado($1::jsonb) resultado', [
            JSON.stringify(entrada),
          ])
        ).rows[0].resultado;
      const adulterado = structuredClone(transporte.p_entrada);
      adulterado.entrada.versao_esperada = 2;
      await expect(executar(adulterado)).rejects.toMatchObject({ code: '42501' });
      expect(await executarEdicaoPacientePrivada(transporte, executar)).toMatchObject({
        ok: true,
        dados: { paciente_id: pacienteId, versao: 2 },
      });
      expect(await executarEdicaoPacientePrivada(transporte, executar)).toMatchObject({
        ok: true,
        repeticao: true,
      });
    } finally {
      await cliente.end();
    }
  },
);
