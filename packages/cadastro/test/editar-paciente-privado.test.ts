import { createHmac } from 'node:crypto';
import { expect, it } from 'vitest';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.js';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.js';
import {
  executarEdicaoPacientePrivada,
  prepararEdicaoPacientePrivada,
} from '../src/editar-paciente-privado.js';

it('compõe tentativa cifrada, preserva idempotência lógica e valida retorno privado', async () => {
  const cifra = criarCifraAutenticada({
    keyIdAtiva: 'teste',
    chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
    chaveHmac: new Uint8Array(32).fill(2),
  });
  const atestador = criarAtestadorOperacao({
    keyId: 'atestado',
    chave: new Uint8Array(32).fill(3),
  });
  const idempotencia = {
    async calcularDigestIdempotencia(valor: string) {
      return createHmac('sha256', Buffer.alloc(32, 4)).update(valor).digest('base64url');
    },
  };
  const solicitacao = {
    pacienteId: 'a0000000-0000-4000-8000-000000000001',
    corpo: {
      nome: 'Pessoa fictícia',
      nome_preferencia: null,
      motivo: 'Correção fictícia',
      versao_esperada: 1,
    },
    cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
    contexto: {
      key_id: 'atestado',
      usuario_id: 'a0000000-0000-4000-8000-000000000002',
      session_id: 'a0000000-0000-4000-8000-000000000003',
      request_id: 'a0000000-0000-4000-8000-000000000004',
      emitido_em: '2026-10-29T12:00:00Z',
      expira_em: '2026-10-29T12:00:20Z',
    },
  };
  const primeira = await prepararEdicaoPacientePrivada(solicitacao, {
    cifra,
    atestador,
    idempotencia,
  });
  const segunda = await prepararEdicaoPacientePrivada(solicitacao, {
    cifra,
    atestador,
    idempotencia,
  });
  const a = JSON.parse(primeira.p_entrada.entrada_canonica);
  const b = JSON.parse(segunda.p_entrada.entrada_canonica);
  expect(a.digest_idempotencia).toBe(b.digest_idempotencia);
  expect(a.auditoria_id).not.toBe(b.auditoria_id);
  expect(a.aad.motivo.registro_id).toBe(a.auditoria_id);
  expect(a.nome_preferencia).toBeNull();
  expect(JSON.stringify(primeira)).not.toContain('fictícia');
  expect(primeira.p_entrada.entrada.atestado.operacao).toBe('api.editar_paciente');
  const resposta = {
    ok: true,
    dados: { paciente_id: solicitacao.pacienteId, versao: 2 },
    request_id: solicitacao.contexto.request_id,
    repeticao: false,
  };
  await expect(executarEdicaoPacientePrivada(primeira, async () => resposta)).resolves.toEqual(
    resposta,
  );
  await expect(
    executarEdicaoPacientePrivada(primeira, async () => ({
      ...resposta,
      dados: { ...resposta.dados, paciente_id: solicitacao.contexto.usuario_id },
    })),
  ).rejects.toThrow('Resultado da atualização incerto.');
  await expect(
    executarEdicaoPacientePrivada(primeira, async () => ({
      ...resposta,
      dados: { ...resposta.dados, versao: 3 },
    })),
  ).rejects.toThrow('Resultado da atualização incerto.');
});
