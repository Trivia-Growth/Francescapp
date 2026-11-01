/// <reference lib="dom" />
import { describe, expect, it } from 'vitest';
import { criarHandlerReconciliacaoExperimental } from '../src/http-reconciliacao-experimental.js';
import { criarCursorReconciliacao } from '../src/cursor-reconciliacao.ts';

const identidade = {
  usuario_id: '10000000-0000-4000-8000-000000000001',
  session_id: '10000000-0000-4000-8000-000000000002',
};
const url = 'https://ffcmapp.example/api/cadastro/operacoes?limite=25';
const cursores = criarCursorReconciliacao(new Uint8Array(32).fill(7));

describe('handler experimental de reconciliação', () => {
  it('protege cursor entre páginas e recusa cursor adulterado sem consultar', async () => {
    const id = '30000000-0000-4000-8000-000000000001';
    let chamadas = 0;
    let recebido: string | undefined;
    const handler = criarHandlerReconciliacaoExperimental({
      autorizar: async () => ({ estado: 'autorizado', identidade }),
      cursores: criarCursorReconciliacao(new Uint8Array(32).fill(7)),
      consultar: async (_identidade, { consulta, request_id }) => {
        chamadas++;
        recebido = consulta.cursor;
        return {
          ok: true,
          request_id,
          dados: { itens: [], proximo_cursor: chamadas === 1 ? id : null },
        };
      },
    });
    const primeira = await handler(new Request(url));
    const token = (await primeira.json()).dados.proximo_cursor as string;
    expect(token).not.toBe(id);
    expect(token).not.toContain(id);
    const segunda = await handler(new Request(`${url}&cursor=${token}`));
    expect(segunda.status).toBe(200);
    expect(recebido).toBe(id);
    const adulterado = `${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`;
    const rejeicao = await handler(new Request(`${url}&cursor=${adulterado}`));
    expect(rejeicao.status).toBe(422);
    expect(chamadas).toBe(2);
  });
  it('recusa cursor de outra sessão ou usuário antes de consultar', async () => {
    const token = await cursores.emitir('30000000-0000-4000-8000-000000000001', {
      usuarioId: identidade.usuario_id,
      sessaoId: identidade.session_id,
    });
    for (const outra of [
      { ...identidade, session_id: '10000000-0000-4000-8000-000000000003' },
      { ...identidade, usuario_id: '10000000-0000-4000-8000-000000000003' },
    ]) {
      let chamadas = 0;
      const handler = criarHandlerReconciliacaoExperimental({
        cursores,
        autorizar: async () => ({ estado: 'autorizado', identidade: outra }),
        consultar: async () => {
          chamadas++;
          return {};
        },
      });
      expect((await handler(new Request(`${url}&cursor=${token}`))).status).toBe(422);
      expect(chamadas).toBe(0);
    }
  });
  it('devolve página validada com no-store após duas verificações de autoridade', async () => {
    let verificacoes = 0;
    let requestInterno = '';
    const handler = criarHandlerReconciliacaoExperimental({
      cursores,
      autorizar: async () => {
        verificacoes++;
        return { estado: 'autorizado', identidade };
      },
      consultar: async (_identidade, { request_id }) => {
        requestInterno = request_id;
        return { ok: true, request_id, dados: { itens: [], proximo_cursor: null } };
      },
    });
    const resposta = await handler(new Request(url));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('cache-control')).toBe('no-store');
    const corpo = await resposta.json();
    expect(corpo.dados).toEqual({ itens: [], proximo_cursor: null });
    expect(corpo.request_id).toBe(requestInterno);
    expect(verificacoes).toBe(2);
  });
  it('mantém as portas originais mesmo que sejam substituídas durante a consulta', async () => {
    const portas: Parameters<typeof criarHandlerReconciliacaoExperimental>[0] = {
      cursores,
      autorizar: async () => ({ estado: 'autorizado', identidade }),
      consultar: async (_identidade, { request_id }) => ({
        ok: true,
        request_id,
        dados: { itens: [], proximo_cursor: null },
      }),
    };
    const real = portas.autorizar;
    portas.autorizar = async (request) => {
      portas.autorizar = async () => ({ estado: 'sem_permissao' });
      portas.consultar = async () => {
        throw new Error('substituída');
      };
      return real(request);
    };
    const resposta = await criarHandlerReconciliacaoExperimental(portas)(new Request(url));
    expect(resposta.status).toBe(200);
  });
  it('nega sem autenticação ou permissão e não consulta o adapter', async () => {
    for (const [estado, status] of [
      ['nao_autenticado', 401],
      ['sem_permissao', 403],
    ] as const) {
      let consultas = 0;
      const handler = criarHandlerReconciliacaoExperimental({
        cursores,
        autorizar: async () => ({ estado }),
        consultar: async () => {
          consultas++;
          return {};
        },
      });
      const resposta = await handler(new Request(url));
      expect(resposta.status).toBe(status);
      expect(resposta.headers.get('cache-control')).toBe('no-store');
      expect(consultas).toBe(0);
    }
  });
  it('não devolve dados se sessão ou autorização mudar durante consulta', async () => {
    for (const seguinte of [
      { estado: 'sem_permissao' } as const,
      { estado: 'nao_autenticado' } as const,
      {
        estado: 'autorizado',
        identidade: { ...identidade, session_id: '10000000-0000-4000-8000-000000000003' },
      } as const,
      {
        estado: 'autorizado',
        identidade: { ...identidade, usuario_id: '10000000-0000-4000-8000-000000000003' },
      } as const,
    ]) {
      let vezes = 0;
      const handler = criarHandlerReconciliacaoExperimental({
        cursores,
        autorizar: async () => (++vezes === 1 ? { estado: 'autorizado', identidade } : seguinte),
        consultar: async (_identidade, { request_id }) => ({
          ok: true,
          request_id,
          dados: {
            itens: [{ operacao_id: identidade.usuario_id, situacao: { estado: 'pendente' } }],
            proximo_cursor: null,
          },
        }),
      });
      const resposta = await handler(new Request(url));
      expect([401, 403]).toContain(resposta.status);
      expect(resposta.headers.get('cache-control')).toBe('no-store');
      expect(await resposta.text()).not.toContain(identidade.usuario_id);
    }
  });
  it('não devolve dados se acesso for revogado durante emissão do cursor', async () => {
    let autorizado = true;
    const handler = criarHandlerReconciliacaoExperimental({
      cursores: {
        ...cursores,
        emitir: async (cursor, vinculo) => {
          const token = await cursores.emitir(cursor, vinculo);
          autorizado = false;
          return token;
        },
      },
      autorizar: async () =>
        autorizado ? { estado: 'autorizado', identidade } : { estado: 'sem_permissao' },
      consultar: async (_identidade, { request_id }) => ({
        ok: true,
        request_id,
        dados: {
          itens: [{ operacao_id: identidade.usuario_id, situacao: { estado: 'pendente' } }],
          proximo_cursor: '30000000-0000-4000-8000-000000000001',
        },
      }),
    });
    const resposta = await handler(new Request(url));
    expect(resposta.status).toBe(403);
    expect(await resposta.text()).not.toContain(identidade.usuario_id);
  });
  it('recusa filtros inválidos sem consultar e sanitiza falhas do adapter', async () => {
    let consultas = 0;
    const handler = criarHandlerReconciliacaoExperimental({
      cursores,
      autorizar: async () => ({ estado: 'autorizado', identidade }),
      consultar: async () => {
        consultas++;
        throw new Error('Pessoa fictícia');
      },
    });
    for (const query of [
      'usuario_id=10000000-0000-4000-8000-000000000001',
      'limite=1&limite=2',
      '__proto__=x',
    ]) {
      const resposta = await handler(
        new Request(`https://ffcmapp.example/api/cadastro/operacoes?${query}`),
      );
      expect(resposta.status).toBe(422);
      expect(resposta.headers.get('cache-control')).toBe('no-store');
    }
    expect(consultas).toBe(0);
    const indisponivel = await handler(new Request(url));
    expect(indisponivel.status).toBe(503);
    expect(indisponivel.headers.get('cache-control')).toBe('no-store');
    expect(await indisponivel.text()).not.toContain('Pessoa fictícia');
  });
});
