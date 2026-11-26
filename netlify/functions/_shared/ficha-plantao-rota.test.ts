import { expect, it } from 'vitest';
import { config } from '../ficha-plantao.ts';
import { fichaPlantaoHttp } from '../../../packages/contracts/src/ficha-plantao-http.ts';

/** O roteamento da plataforma entrega **apenas** o que está em `config.path`. O regex de
 * `entrada-ficha-plantao-nativa.ts` atender um caminho não basta: se ele não estiver
 * declarado aqui, a requisição nunca chega à função.
 *
 * Por que este arquivo existe: `/pendencias` era atendido pelo handler e **não** estava em
 * `config.path`. Em produção a chamada morria no roteamento, e como o cliente engolia a
 * falha devolvendo lista vazia, a pendência escrita no plantão desaparecia da carteira sem
 * erro e sem aviso — quem lia concluía que ninguém havia escrito nenhuma.
 *
 * A asserção abaixo é genérica de propósito: ela cobre qualquer caminho que o contrato
 * declarar daqui em diante, não só o que faltou daquela vez. */

it('declara no roteamento todos os caminhos que o contrato da ficha anuncia', () => {
  const declarados = new Set(config.path);
  const doContrato = Object.values(fichaPlantaoHttp).map((rota) => rota.caminho);

  expect(doContrato.length).toBeGreaterThan(0);
  const ausentes = doContrato.filter((caminho) => !declarados.has(caminho));
  expect(ausentes, `caminhos do contrato ausentes de config.path: ${ausentes.join(', ')}`).toEqual(
    [],
  );
});

it('declara o caminho das pendências escritas no plantão', () => {
  // Guarda nominal do defeito original, para que a falha aponte direto a causa caso a
  // asserção genérica acima mude de forma algum dia.
  expect(config.path).toContain('/api/pacientes/:paciente_id/ficha-plantao/pendencias');
});
