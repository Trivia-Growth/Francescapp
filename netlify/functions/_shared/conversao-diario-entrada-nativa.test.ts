import { expect, it, vi } from 'vitest';
import { criarEntradaConversaoDiarioNativa } from './conversao-diario-entrada-nativa.ts';
const id = '11111111-1111-4111-8111-111111111111';
const entrada = {
  origem_versao: 1,
  tarefa_id: id,
  reserva_id: id,
  geracao_reserva: 1,
  motivo: 'Motivo fictício',
  data_atencao: '2026-11-18',
  encaminhamento: 'Encaminhamento fictício',
  responsavel: 'Pessoa fictícia',
  prazo: '2026-11-19',
  prioridade: 'media',
  area: 'Área fictícia',
};
const dependencias = {} as Parameters<typeof criarEntradaConversaoDiarioNativa>[0];
const pedido = (corpo: unknown) =>
  new Request(`https://example.test/api/pacientes/${id}/diario/${id}/conversao-tarefa`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sessao': id,
      'x-chave-idempotencia': 'chave-ficticia-123456789',
    },
    body: JSON.stringify(corpo),
  });
it('nega campos humanos ausentes e autoria enviada sem chamar composição', async () => {
  const operar = vi.fn<NonNullable<Parameters<typeof criarEntradaConversaoDiarioNativa>[1]>>();
  const handler = criarEntradaConversaoDiarioNativa(dependencias, operar);
  expect((await handler.atender(pedido({ ...entrada, motivo: undefined }))).status).toBe(422);
  expect((await handler.atender(pedido({ ...entrada, ator_usuario_id: id }))).status).toBe(422);
  expect(operar).not.toHaveBeenCalled();
});
it('propaga resultado incerto sem sucesso ou conteúdo clínico no erro', async () => {
  const operar = vi.fn<NonNullable<Parameters<typeof criarEntradaConversaoDiarioNativa>[1]>>(
    async () => ({ ok: false, erro: { codigo: 'pendencia_externa' }, request_id: id }) as const,
  );
  const resposta = await criarEntradaConversaoDiarioNativa(dependencias, operar).atender(
    pedido(entrada),
  );
  expect(resposta.status).toBe(503);
  const texto = await resposta.text();
  expect(texto).toContain('pendencia_externa');
  expect(texto).not.toContain(entrada.motivo);
});
