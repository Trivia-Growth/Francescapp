import { afterEach, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { esquecerConfiguracaoServidor } from '../../../../netlify/functions/_shared/configuracao-servidor.ts';
import {
  decidirServicoAtivo,
  interruptorDeAmbiente,
  lerAmbienteDoIsolate,
} from './ambiente-isolate.ts';

afterEach(() => esquecerConfiguracaoServidor());

/** Pool que nunca conecta: é a falha de leitura que o teste precisa reproduzir. */
const poolQueFalha = {
  connect: () => Promise.reject(new Error('conexao-ficticia-recusada')),
} as unknown as Pool;

it('devolve fonte vazia quando o ambiente do isolate é ilegível, sem lançar', () => {
  const fonte = lerAmbienteDoIsolate({
    toObject: () => {
      throw new Error('permissao-ficticia-negada');
    },
  });
  expect(fonte).toEqual({});
  expect(interruptorDeAmbiente(fonte, 'FFCM_EXEMPLO_ATIVADO')).toBe(false);
});

it('só liga o interruptor no literal "true"', () => {
  const fonte = lerAmbienteDoIsolate({
    toObject: () => ({
      FFCM_LIGADO: 'true',
      FFCM_QUASE: 'TRUE',
      FFCM_OUTRO: '1',
      FFCM_VAZIO: '',
    }),
  });
  expect(interruptorDeAmbiente(fonte, 'FFCM_LIGADO')).toBe(true);
  expect(interruptorDeAmbiente(fonte, 'FFCM_QUASE')).toBe(false);
  expect(interruptorDeAmbiente(fonte, 'FFCM_OUTRO')).toBe(false);
  expect(interruptorDeAmbiente(fonte, 'FFCM_VAZIO')).toBe(false);
  expect(interruptorDeAmbiente(fonte, 'FFCM_AUSENTE')).toBe(false);
});

it('mantém o que o ambiente dizia quando a leitura de configuração do banco falha', async () => {
  const ligado = lerAmbienteDoIsolate({ toObject: () => ({ FFCM_EXEMPLO_ATIVADO: 'true' }) });
  await expect(
    decidirServicoAtivo(poolQueFalha, 'ffcm.exemplo.ativo', ligado, 'FFCM_EXEMPLO_ATIVADO'),
  ).resolves.toBe(true);
});

it('falha de leitura nunca LIGA um serviço que o ambiente mantinha desligado', async () => {
  const desligado = lerAmbienteDoIsolate({ toObject: () => ({ FFCM_EXEMPLO_ATIVADO: 'false' }) });
  await expect(
    decidirServicoAtivo(poolQueFalha, 'ffcm.exemplo.ativo', desligado, 'FFCM_EXEMPLO_ATIVADO'),
  ).resolves.toBe(false);
  esquecerConfiguracaoServidor();
  // Ambiente ilegível é o pior caso: continua desligado, nunca ligado.
  const ilegivel = lerAmbienteDoIsolate({
    toObject: () => {
      throw new Error('permissao-ficticia-negada');
    },
  });
  await expect(
    decidirServicoAtivo(poolQueFalha, 'ffcm.exemplo.ativo', ilegivel, 'FFCM_EXEMPLO_ATIVADO'),
  ).resolves.toBe(false);
});
