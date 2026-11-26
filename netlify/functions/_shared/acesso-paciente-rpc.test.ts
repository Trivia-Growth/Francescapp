import { expect, it } from 'vitest';
import { executarRpcAcessoPaciente } from './acesso-paciente-rpc.ts';

it('encaminha ambas operações ao wrapper privado com parâmetro SQL correto', async () => {
  const chamadas: unknown[] = [];
  const cliente = {
    rpc: async (nome: string, parametros: unknown) => {
      chamadas.push({ nome, parametros });
      return { data: { ok: true }, error: null };
    },
  };
  const transporte = {
    entrada: { request_id: 'ficticio' },
    entrada_canonica: '{}',
    dados_canonicos: '{}',
  };
  await executarRpcAcessoPaciente(cliente, 'criarAcessoPaciente', transporte);
  await executarRpcAcessoPaciente(cliente, 'revogarAcessoPaciente', transporte);
  expect(chamadas).toEqual([
    { nome: 'conceder_acesso_paciente_privado', parametros: { p_transporte: transporte } },
    { nome: 'revogar_acesso_paciente_privado', parametros: { p_transporte: transporte } },
  ]);
});
