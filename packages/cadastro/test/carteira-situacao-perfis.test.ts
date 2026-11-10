import { expect, it, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { consultarCarteiraFamiliar } from '../../../netlify/functions/_shared/carteira-familiar-handler.ts';
import { consultarCarteiraNativa } from '../../../netlify/functions/_shared/carteira-handler-nativo.ts';
import { criarCursorCarteira } from '../src/cursor-carteira.ts';

const usuario_id = '61000000-0000-4000-8000-000000000001';
const session_id = '63000000-0000-4000-8000-000000000001';
const paciente_id = '66000000-0000-4000-8000-000000000001';
const identidade = { usuario_id, session_id };
const cifra = criarCifraAutenticada({
  keyIdAtiva: 'ficticia',
  chavesDeCifra: { ficticia: new Uint8Array(32).fill(17) },
  chaveHmac: new Uint8Array(32).fill(43),
});
const aad = {
  tabela: 'cadastro.paciente',
  registro_id: paciente_id,
  campo: 'nome',
  formato: 1,
} as const;
const pedido = (caminho: string) =>
  new Request(`https://exemplo.test${caminho}?limite=1`, { headers: { 'x-sessao': session_id } });
const paginaComSituacao = async (request_id: string) => ({
  ok: true,
  request_id,
  dados: {
    itens: [
      {
        paciente_id,
        nome: await cifra.cifrar('Paciente fictício', aad),
        nome_preferencia: null,
        versao: 1,
        situacao: 'ativo',
      },
    ],
    proximo_cursor: null,
  },
});

it('a lista nativa entrega a situação que o banco devolveu ao Administrador', async () => {
  const resposta = await consultarCarteiraNativa(pedido('/api/pacientes'), {
    autorizar: async () => ({ estado: 'autorizado' as const, identidade }),
    revalidar: async () => ({ estado: 'autorizado' as const, identidade }),
    metadados: (request_id: string) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-10-29T12:00:00Z',
      expira_em: '2026-10-29T12:01:00Z',
    }),
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    cursor: await criarCursorCarteira(new Uint8Array(32).fill(4)),
    executar: async (
      _request: Request,
      entrada: { p_entrada: { entrada: { request_id: string } } },
    ) => paginaComSituacao(entrada.p_entrada.entrada.request_id),
    cifra,
  });
  expect(resposta.status).toBe(200);
  const { dados } = await resposta.json();
  expect(dados.itens).toEqual([
    {
      id: paciente_id,
      nome: 'Paciente fictício',
      nome_preferencia: null,
      versao: 1,
      situacao: 'ativo',
    },
  ]);
});

it('a lista da Família recusa resposta que traga situação, sem divulgar dados', async () => {
  const resposta = await consultarCarteiraFamiliar(pedido('/api/familiar/pacientes'), {
    autorizar: async () => ({ estado: 'autorizado' as const, identidade }),
    consultar: async ({ request_id }) => paginaComSituacao(request_id),
    cifra,
    cursor: { abrir: vi.fn(), emitir: vi.fn() },
  });
  expect(resposta.status).toBe(503);
  const texto = JSON.stringify(await resposta.json());
  expect(texto).not.toContain('dados');
  expect(texto).not.toContain('situacao');
});
