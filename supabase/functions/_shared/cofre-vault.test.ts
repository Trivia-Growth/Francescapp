import { describe, expect, it } from 'vitest';

import {
  ErroCofreIndisponivel,
  carregarMaterialCriptograficoDoCofre,
  type ExecutorCofreInterno,
} from './cofre-vault.ts';
import { criarCifraAutenticada } from './cifra-autenticada.ts';

const chaveBase64 = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const chaveHmacBase64 = btoa(String.fromCharCode(...new Uint8Array(32).fill(19)));

function criarExecutor(
  respostas: Readonly<Record<string, string>>,
  chamadas: string[] = [],
): ExecutorCofreInterno {
  return {
    async executar(nome, argumentos) {
      if (nome !== 'identidade.ler_chave_cifra_vault') {
        throw new Error('RPC inesperada');
      }
      const referencia = argumentos.p_referencia;
      if (typeof referencia !== 'string' || respostas[referencia] === undefined) {
        throw new Error('referência indisponível');
      }
      chamadas.push(referencia);
      return respostas[referencia];
    },
  };
}

describe('adapter server-only do Vault', () => {
  it('permite leitura da versão anterior após rotação com chaves fictícias do adapter', async () => {
    const chaveNova = btoa(String.fromCharCode(...new Uint8Array(32).fill(23)));
    const executor = criarExecutor({
      'ffcmapp.cifra.pii-v1': chaveBase64,
      'ffcmapp.cifra.pii-v2': chaveNova,
      'ffcmapp.cifra.hmac-v1': chaveHmacBase64,
    });
    const materialAnterior = await carregarMaterialCriptograficoDoCofre(executor, {
      keyIdAtiva: 'pii-v1',
      referenciasCifra: { 'pii-v1': 'ffcmapp.cifra.pii-v1' },
      referenciaHmac: 'ffcmapp.cifra.hmac-v1',
    });
    const metadata = {
      tabela: 'cadastro.paciente',
      registro_id: 'd3bc7baf-8868-44ca-97a2-a5dfe73e567a',
      campo: 'nome',
      formato: 1,
    } as const;
    const envelope = await criarCifraAutenticada(materialAnterior).cifrar(
      'Paciente fictício',
      metadata,
    );
    expect(JSON.stringify(envelope)).not.toContain('Paciente fictício');
    const materialNovo = await carregarMaterialCriptograficoDoCofre(executor, {
      keyIdAtiva: 'pii-v2',
      referenciasCifra: { 'pii-v1': 'ffcmapp.cifra.pii-v1', 'pii-v2': 'ffcmapp.cifra.pii-v2' },
      referenciaHmac: 'ffcmapp.cifra.hmac-v1',
    });
    const cifraNova = criarCifraAutenticada(materialNovo);
    await expect(cifraNova.decifrar(envelope, metadata)).resolves.toBe('Paciente fictício');
    expect((await cifraNova.cifrar('Paciente fictício', metadata)).key_id).toBe('pii-v2');
  });
  it('carrega somente as referências configuradas e retorna bytes de 32 posições', async () => {
    const chamadas: string[] = [];
    const material = await carregarMaterialCriptograficoDoCofre(
      criarExecutor(
        {
          'ffcmapp.cifra.pii-v1': chaveBase64,
          'ffcmapp.cifra.hmac-v1': chaveHmacBase64,
        },
        chamadas,
      ),
      {
        keyIdAtiva: 'pii-v1',
        referenciasCifra: { 'pii-v1': 'ffcmapp.cifra.pii-v1' },
        referenciaHmac: 'ffcmapp.cifra.hmac-v1',
      },
    );

    expect(material.chavesDeCifra['pii-v1']).toHaveLength(32);
    expect(material.chaveHmac).toHaveLength(32);
    expect(chamadas).toEqual(['ffcmapp.cifra.pii-v1', 'ffcmapp.cifra.hmac-v1']);
  });

  it('falha fechada quando uma chave está ausente ou não tem 32 bytes', async () => {
    await expect(
      carregarMaterialCriptograficoDoCofre(criarExecutor({ 'ffcmapp.cifra.pii-v1': 'invalida' }), {
        keyIdAtiva: 'pii-v1',
        referenciasCifra: { 'pii-v1': 'ffcmapp.cifra.pii-v1' },
        referenciaHmac: 'ffcmapp.cifra.hmac-ausente',
      }),
    ).rejects.toThrow(ErroCofreIndisponivel);
  });
});
