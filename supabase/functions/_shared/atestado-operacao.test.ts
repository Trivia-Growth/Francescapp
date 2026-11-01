import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { criarAtestadorOperacao } from './atestado-operacao.ts';

describe('atestado de operação', () => {
  const dadosBase = {
    key_id: 'v1',
    usuario_id: '10000000-0000-4000-8000-000000000001',
    session_id: '10000000-0000-4000-8000-000000000002',
    emitido_em: '2026-10-29T12:00:00Z',
    expira_em: '2026-10-29T12:01:00Z',
    request_id: '10000000-0000-4000-8000-000000000003',
    operacao: 'cadastro.criar_paciente',
    digest_entrada: 'vhk0vCy2vk_hdPSOY4XKpf7dWltgAOxqKNc3ybmfn0o',
  };
  it('calcula o digest da entrada antes de assiná-la, sem depender do chamador', async () => {
    const atestador = criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    const { digest_entrada: _digest, ...dados } = dadosBase;
    const resultado = await atestador.atestarEntrada(dados, { z: 'x', a: 1 });
    expect(resultado.entradaCanonica).toBe('{"a":1,"z":"x"}');
    expect(resultado.atestado.digest_entrada).toBe('vhk0vCy2vk_hdPSOY4XKpf7dWltgAOxqKNc3ybmfn0o');
  });
  it('fornece representação canônica estável do comando lógico para idempotência', () => {
    const atestador = criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    expect(atestador.canonicalizar({ corpo: { z: 'x', a: 1 }, operacao: 'teste' })).toBe(
      '{"corpo":{"a":1,"z":"x"},"operacao":"teste"}',
    );
  });
  it('recusa objetos com mais de dez mil chaves antes de ordenar', async () => {
    const atestador = criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    const entrada: Record<string, number> = {};
    for (let i = 0; i < 10001; i += 1) entrada[`campo${i}`] = i;
    await expect(atestador.atestar(dadosBase, entrada)).rejects.toThrow('Entrada inválida.');
  });
  it('aceita e assina objeto com exatamente dez mil chaves', async () => {
    const atestador = criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    const entrada: Record<string, number> = {};
    for (let i = 0; i < 10000; i += 1) entrada[`campo${i}`] = i;
    const resultado = await atestador.atestar(
      { ...dadosBase, digest_entrada: 'OtFTmeSJAowWkl56ci9vwpCAOSWgS2YgwfL1FFiYBmg' },
      entrada,
    );
    expect(resultado.atestado.digest_entrada).toBe('OtFTmeSJAowWkl56ci9vwpCAOSWgS2YgwfL1FFiYBmg');
  });
  it('recusa ciclos e profundidade excessiva com erro controlado', async () => {
    const atestador = criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    const ciclo: Record<string, unknown> = {};
    ciclo.proximo = ciclo;
    let profundo: unknown = null;
    for (let i = 0; i < 66; i += 1) profundo = [profundo];
    await expect(atestador.atestar(dadosBase, ciclo)).rejects.toThrow('Entrada inválida.');
    await expect(atestador.atestar(dadosBase, { profundo })).rejects.toThrow('Entrada inválida.');
  });
  it('ordena chaves por UTF-16 e preserva Unicode e números no formato JCS', async () => {
    const atestador = criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    const canonico = '{"a":[333333333.3333333,1e+30,4.5,0.002,1e-27],"é":"\\n","😀":"ok","דּ":true}';
    const dados = {
      ...dadosBase,
      digest_entrada: createHash('sha256').update(canonico).digest('base64url'),
    };
    const resultado = await atestador.atestar(dados, {
      דּ: true,
      '😀': 'ok',
      é: '\n',
      a: JSON.parse('[333333333.33333329,1e30,4.5,0.002,1e-27]') as number[],
    });
    expect(resultado.entradaCanonica).toBe(canonico);
  });
  it('recusa entrada acima do limite de bytes canônicos antes de verificar o digest', async () => {
    const atestador = criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    await expect(
      atestador.atestar(
        {
          key_id: 'v1',
          usuario_id: '10000000-0000-4000-8000-000000000001',
          session_id: '10000000-0000-4000-8000-000000000002',
          emitido_em: '2026-10-29T12:00:00Z',
          expira_em: '2026-10-29T12:01:00Z',
          request_id: '10000000-0000-4000-8000-000000000003',
          operacao: 'cadastro.criar_paciente',
          digest_entrada: 'vhk0vCy2vk_hdPSOY4XKpf7dWltgAOxqKNc3ybmfn0o',
        },
        { texto: 'a'.repeat(1048576) },
      ),
    ).rejects.toThrow('Entrada inválida.');
  });
  it('retorna snapshot canônico que não muda quando a entrada original é alterada', async () => {
    const atestador = criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    const dados = {
      key_id: 'v1',
      usuario_id: '10000000-0000-4000-8000-000000000001',
      session_id: '10000000-0000-4000-8000-000000000002',
      emitido_em: '2026-10-29T12:00:00Z',
      expira_em: '2026-10-29T12:01:00Z',
      request_id: '10000000-0000-4000-8000-000000000003',
      operacao: 'cadastro.criar_paciente',
      digest_entrada: 'vhk0vCy2vk_hdPSOY4XKpf7dWltgAOxqKNc3ybmfn0o',
    };
    const entrada = { z: 'x', a: 1 };
    const promessa = atestador.atestar(dados, entrada);
    entrada.a = 2;
    const resultado = await promessa;
    expect(resultado).toHaveProperty('entradaCanonica', '{"a":1,"z":"x"}');
  });
  it('recusa lista esparsa em vez de assiná-la como lista vazia', async () => {
    const atestador = criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    await expect(
      atestador.atestar(
        {
          key_id: 'v1',
          usuario_id: '10000000-0000-4000-8000-000000000001',
          session_id: '10000000-0000-4000-8000-000000000002',
          emitido_em: '2026-10-29T12:00:00Z',
          expira_em: '2026-10-29T12:01:00Z',
          request_id: '10000000-0000-4000-8000-000000000003',
          operacao: 'cadastro.criar_paciente',
          digest_entrada: 'fNIKzyYPe2A4KYsHLI20VBRjnQtanLAsrFfxSVN4p9M',
        },
        { itens: Array(1) },
      ),
    ).rejects.toThrow();
  });
  it('recusa propriedades com getters que podem mudar entre leitura e execução', async () => {
    const atestador = criarAtestadorOperacao({ keyId: 'v1', chave: new Uint8Array(32).fill(7) });
    const entrada = {
      get a() {
        return 1;
      },
      z: 'x',
    };
    await expect(
      atestador.atestar(
        {
          key_id: 'v1',
          usuario_id: '10000000-0000-4000-8000-000000000001',
          session_id: '10000000-0000-4000-8000-000000000002',
          emitido_em: '2026-10-29T12:00:00Z',
          expira_em: '2026-10-29T12:01:00Z',
          request_id: '10000000-0000-4000-8000-000000000003',
          operacao: 'cadastro.criar_paciente',
          digest_entrada: 'vhk0vCy2vk_hdPSOY4XKpf7dWltgAOxqKNc3ybmfn0o',
        },
        entrada,
      ),
    ).rejects.toThrow();
  });
  it('assina metadados e digest da entrada canônica com chave fictícia', async () => {
    const configuracao = { keyId: 'v1', chave: new Uint8Array(32).fill(7) };
    const atestador = criarAtestadorOperacao(configuracao);
    configuracao.keyId = 'outra';
    const dados = {
      key_id: 'v1',
      usuario_id: '10000000-0000-4000-8000-000000000001',
      session_id: '10000000-0000-4000-8000-000000000002',
      emitido_em: '2026-10-29T12:00:00Z',
      expira_em: '2026-10-29T12:01:00Z',
      request_id: '10000000-0000-4000-8000-000000000003',
      operacao: 'cadastro.criar_paciente',
      digest_entrada: 'vhk0vCy2vk_hdPSOY4XKpf7dWltgAOxqKNc3ybmfn0o',
    };
    const canonico =
      '{"digest_entrada":"vhk0vCy2vk_hdPSOY4XKpf7dWltgAOxqKNc3ybmfn0o","emitido_em":"2026-10-29T12:00:00Z","expira_em":"2026-10-29T12:01:00Z","key_id":"v1","operacao":"cadastro.criar_paciente","request_id":"10000000-0000-4000-8000-000000000003","session_id":"10000000-0000-4000-8000-000000000002","usuario_id":"10000000-0000-4000-8000-000000000001"}';
    const mac = createHmac('sha256', Buffer.alloc(32, 7))
      .update(`ffcmapp:atestado:v1:${canonico}`, 'utf8')
      .digest('base64url');
    await expect(atestador.atestar(dados, { z: 'x', a: 1 })).resolves.toEqual({
      atestado: { ...dados, mac },
      entradaCanonica: '{"a":1,"z":"x"}',
      dadosCanonicos: canonico,
    });
    await expect(atestador.atestar(dados, { z: 'x', a: 2 })).rejects.toThrow('Atestado inválido.');
  });
});
