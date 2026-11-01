import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarDesafiosGoogle, ErroDesafioGoogleInvalido } from './desafio-google.ts';

function preparar() {
  const registros = new Map<string, { hash: string; expira: number }>();
  return criarDesafiosGoogle({
    chave: new Uint8Array(32).fill(7),
    ttlSegundos: 300,
    repositorio: {
      async registrar(id, hash, expira) {
        registros.set(id, { hash, expira });
      },
      async consumir(id, hash, agora) {
        const registro = registros.get(id);
        if (!registro || registro.hash !== hash || registro.expira <= agora) return false;
        registros.delete(id);
        return true;
      },
    },
  });
}

afterEach(() => vi.useRealTimers());

describe('desafio Google', () => {
  it('distingue replay confirmado de falha incerta do repositório', async () => {
    const desafios = preparar();
    const criado = await desafios.emitir();
    await desafios.consumir(criado.publico.desafio_id, criado.nonceSelado);
    await expect(
      desafios.consumir(criado.publico.desafio_id, criado.nonceSelado),
    ).rejects.toBeInstanceOf(ErroDesafioGoogleInvalido);
    const indisponivel = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(7),
      ttlSegundos: 300,
      repositorio: {
        async registrar() {},
        async consumir() {
          throw new Error('segredo fictício');
        },
      },
    });
    const outro = await indisponivel.emitir();
    const falha = await indisponivel
      .consumir(outro.publico.desafio_id, outro.nonceSelado)
      .catch((erro: unknown) => erro);
    expect(falha).not.toBeInstanceOf(ErroDesafioGoogleInvalido);
    expect(String(falha)).not.toContain('segredo fictício');
    const erroTipado = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(7),
      ttlSegundos: 300,
      repositorio: {
        async registrar() {},
        async consumir() {
          throw new ErroDesafioGoogleInvalido();
        },
      },
    });
    const terceiro = await erroTipado.emitir();
    const incerto = await erroTipado
      .consumir(terceiro.publico.desafio_id, terceiro.nonceSelado)
      .catch((erro: unknown) => erro);
    expect(incerto).not.toBeInstanceOf(ErroDesafioGoogleInvalido);
  });
  it('não devolve prova quando consumo confirma somente após expiração', async () => {
    vi.useFakeTimers();
    const desafios = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(7),
      ttlSegundos: 30,
      repositorio: {
        async registrar() {},
        async consumir() {
          vi.advanceTimersByTime(30_000);
          return true;
        },
      },
    });
    const criado = await desafios.emitir();
    await expect(desafios.consumir(criado.publico.desafio_id, criado.nonceSelado)).rejects.toThrow(
      'Desafio Google indisponível ou inválido.',
    );
  });
  it.each(['registrar', 'consumir'])(
    'não entrega desafio ou prova quando %s não termina no prazo',
    async (etapa) => {
      const controlador = new AbortController();
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controlador.signal);
      let liberar: () => void = () => {};
      let iniciou = false;
      let chamadas = 0;
      const repositorio = {
        async registrar() {
          if (etapa === 'registrar') {
            iniciou = true;
            chamadas += 1;
            await new Promise<void>((resolve) => {
              liberar = resolve;
            });
          }
        },
        async consumir() {
          iniciou = true;
          chamadas += 1;
          if (etapa === 'consumir')
            await new Promise<void>((resolve) => {
              liberar = resolve;
            });
          return true;
        },
      };
      try {
        const desafios = criarDesafiosGoogle({
          chave: new Uint8Array(32).fill(7),
          ttlSegundos: 30,
          repositorio,
        });
        const criado = etapa === 'consumir' ? await desafios.emitir() : undefined;
        const operacao = (
          criado
            ? desafios.consumir(criado.publico.desafio_id, criado.nonceSelado)
            : desafios.emitir()
        ).then(
          () => 'aceito',
          () => 'rejeitado',
        );
        await vi.waitFor(() => expect(iniciou).toBe(true));
        controlador.abort();
        expect(
          await Promise.race([
            operacao,
            new Promise<string>((resolve) => setTimeout(() => resolve('travado'), 150)),
          ]),
        ).toBe('rejeitado');
        liberar();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(await operacao).toBe('rejeitado');
        expect(chamadas).toBe(1);
      } finally {
        timeout.mockRestore();
      }
    },
  );
  it.each(['false', {}, 1])('nega resultado não booleano do consumo: %s', async (resposta) => {
    const desafios = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(7),
      ttlSegundos: 300,
      repositorio: {
        async registrar() {},
        async consumir() {
          return resposta as unknown as boolean;
        },
      },
    });
    const criado = await desafios.emitir();
    await expect(desafios.consumir(criado.publico.desafio_id, criado.nonceSelado)).rejects.toThrow(
      'Desafio Google indisponível ou inválido.',
    );
  });

  it('mantém prazo validado quando configuração original é alterada', async () => {
    vi.useFakeTimers();
    const configuracao = {
      chave: new Uint8Array(32).fill(7),
      ttlSegundos: 30,
      repositorio: {
        async registrar() {},
        async consumir() {
          return true;
        },
      },
    };
    const desafios = criarDesafiosGoogle(configuracao);
    configuracao.ttlSegundos = 6000;
    const criado = await desafios.emitir();
    vi.advanceTimersByTime(30_000);
    await expect(desafios.consumir(criado.publico.desafio_id, criado.nonceSelado)).rejects.toThrow(
      'Desafio Google indisponível ou inválido.',
    );
  });
  it('emite nonce cifrado e permite consumo uma única vez', async () => {
    const desafios = preparar();
    const criado = await desafios.emitir();
    const prova = await desafios.consumir(criado.publico.desafio_id, criado.nonceSelado);
    expect(prova.nonce_hash).toBe(criado.publico.nonce_hash);
    expect(createHash('sha256').update(prova.nonce).digest('hex')).toBe(criado.publico.nonce_hash);
    expect(criado.nonceSelado).not.toContain(prova.nonce);
    await expect(
      desafios.consumir(criado.publico.desafio_id, criado.nonceSelado),
    ).rejects.toThrow();
  });

  it('nega cookie adulterado e cookie pertencente a outro desafio', async () => {
    const desafios = preparar();
    const primeiro = await desafios.emitir();
    const segundo = await desafios.emitir();
    await expect(
      desafios.consumir(primeiro.publico.desafio_id, segundo.nonceSelado),
    ).rejects.toThrow();
    const partes = primeiro.nonceSelado.split('.');
    const cifra = partes[3] ?? '';
    partes[3] = `${cifra[0] === 'A' ? 'B' : 'A'}${cifra.slice(1)}`;
    await expect(
      desafios.consumir(primeiro.publico.desafio_id, partes.join('.')),
    ).rejects.toThrow();
    await expect(
      desafios.consumir(primeiro.publico.desafio_id, primeiro.nonceSelado),
    ).resolves.toBeDefined();
  });

  it('nega desafio expirado, inclusive no instante de expiração', async () => {
    vi.useFakeTimers();
    const desafios = preparar();
    const criado = await desafios.emitir();
    vi.advanceTimersByTime(300_000);
    await expect(
      desafios.consumir(criado.publico.desafio_id, criado.nonceSelado),
    ).rejects.toThrow();
  });

  it('permite no máximo uma resposta de consumos concorrentes no adapter fictício', async () => {
    const desafios = preparar();
    const criado = await desafios.emitir();
    const resultados = await Promise.allSettled([
      desafios.consumir(criado.publico.desafio_id, criado.nonceSelado),
      desafios.consumir(criado.publico.desafio_id, criado.nonceSelado),
    ]);
    expect(resultados.filter((resultado) => resultado.status === 'fulfilled')).toHaveLength(1);
  });

  it('gera desafios e hashes distintos para emissões sucessivas', async () => {
    const desafios = preparar();
    const primeiro = await desafios.emitir();
    const segundo = await desafios.emitir();
    expect(primeiro.publico.desafio_id).not.toBe(segundo.publico.desafio_id);
    expect(primeiro.publico.nonce_hash).not.toBe(segundo.publico.nonce_hash);
  });

  it('fecha a emissão quando o banco falha sem expor a mensagem interna', async () => {
    const desafios = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(7),
      ttlSegundos: 300,
      repositorio: {
        async registrar() {
          throw new Error('detalhe interno fictício');
        },
        async consumir() {
          return false;
        },
      },
    });
    await expect(desafios.emitir()).rejects.toThrow('Desafio Google indisponível ou inválido.');
  });

  it('rejeita entrada de tipos inválidos com erro sanitizado', async () => {
    const desafios = preparar();
    const criado = await desafios.emitir();
    for (const [id, cookie] of [
      [null, criado.nonceSelado],
      [criado.publico.desafio_id, null],
      [criado.publico.desafio_id, { valor: 'fictício' }],
    ] as unknown as Array<[string, string]>) {
      await expect(desafios.consumir(id, cookie)).rejects.toThrow(
        'Desafio Google indisponível ou inválido.',
      );
    }
  });

  it('fecha consumo quando o banco falha sem expor detalhes internos', async () => {
    const desafios = criarDesafiosGoogle({
      chave: new Uint8Array(32).fill(7),
      ttlSegundos: 300,
      repositorio: {
        async registrar() {},
        async consumir() {
          throw new Error('detalhe interno fictício');
        },
      },
    });
    const criado = await desafios.emitir();
    await expect(desafios.consumir(criado.publico.desafio_id, criado.nonceSelado)).rejects.toThrow(
      'Desafio Google indisponível ou inválido.',
    );
  });
});
