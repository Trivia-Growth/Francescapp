import { expect, it } from 'vitest';
import { operarSubstituicaoCmNativa } from './substituicao-cm-nativa.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import { metadadosAtestadoNativo } from './compor-pacientes-nativo.ts';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import type { CampoCifrado } from '../../../packages/contracts/src/rpc.ts';

/** FR-037: o motivo da substituição e o do encerramento antecipado atravessam o servidor
 * cifrados e voltam decifrados para a tela.
 *
 * Cifra, atestado e idempotência são os de produção. O único dublê é `executar`, que ocupa o
 * lugar do banco — é a fronteira certa para provar o que o servidor faz com o texto. Dados
 * fictícios apenas. */

const usuario = '11111111-1111-4111-8111-111111111111';
const sessao = '22222222-2222-4222-8222-222222222222';
const paciente = '40000000-0000-4000-8000-000000000001';
const substituta = '33333333-3333-4333-8333-333333333333';
const titular = '44444444-4444-4444-8444-444444444444';
const caminho = `https://app.example.test/api/pacientes/${paciente}/substituicao-case-manager`;

const cifra = criarCifraAutenticada({
  keyIdAtiva: 'sub-v1',
  chavesDeCifra: { 'sub-v1': new Uint8Array(32).fill(11) },
  chaveHmac: new Uint8Array(32).fill(29),
});
const atestador = criarAtestadorOperacao({ keyId: 'sub-v1', chave: new Uint8Array(32).fill(5) });

type Entrada = Record<string, unknown>;

/** Banco de mentira que GUARDA o que recebeu e devolve o painel privado, como a RPC real. */
function bancoFicticio() {
  const linhas: Record<string, Entrada> = {};
  let ultima: Entrada | undefined;
  return {
    get entrada() {
      return ultima;
    },
    get linhas() {
      return linhas;
    },
    executar: async (_pedido: Request, transporte: { p_transporte: { entrada: Entrada } }) => {
      const entrada = transporte.p_transporte.entrada;
      ultima = entrada;
      const id = entrada.substituicao_id as string | undefined;
      if (id && entrada.motivo_cifrado) {
        linhas[id] = {
          id,
          versao: 1,
          substituto_usuario_id: substituta,
          responsavel_usuario_id: titular,
          inicio: '2026-11-20T09:00:00.000Z',
          fim: '2026-11-27T09:00:00.000Z',
          encerrada_em: null,
          motivo_cifrado: entrada.motivo_cifrado,
          motivo_encerramento_cifrado: null,
          registrada_por_usuario_id: usuario,
          criado_em: '2026-11-19T09:00:00.000Z',
        };
      }
      if (id && entrada.motivo_encerramento_cifrado && linhas[id]) {
        linhas[id] = {
          ...linhas[id],
          encerrada_em: '2026-11-22T09:00:00.000Z',
          motivo_encerramento_cifrado: entrada.motivo_encerramento_cifrado,
        };
      }
      return {
        ok: true,
        dados: {
          paciente_id: paciente,
          titular_usuario_id: titular,
          case_manager_atual_id: titular,
          vigente: null,
          substituicoes: Object.values(linhas),
        },
        request_id: entrada.request_id,
      };
    },
  };
}

const portasCom = (banco: ReturnType<typeof bancoFicticio>) => ({
  autorizar: async () => ({
    estado: 'autorizado' as const,
    identidade: { usuario_id: usuario, session_id: sessao },
  }),
  revalidar: async () => ({
    estado: 'autorizado' as const,
    identidade: { usuario_id: usuario, session_id: sessao },
  }),
  metadados: (requestId: string) => metadadosAtestadoNativo('sub-v1', requestId, Date.now()),
  idempotencia: criarIdempotenciaNativa(cifra),
  cifra,
  atestador,
  executar: banco.executar,
});

const pedido = () =>
  new Request(caminho, {
    method: 'POST',
    headers: {
      'x-sessao': sessao,
      'x-chave-idempotencia': '55555555-5555-4555-8555-555555555555',
      'content-type': 'application/json',
    },
  });

it('grava o motivo cifrado e devolve o texto decifrado, sem vazar envelope', async () => {
  const banco = bancoFicticio();
  const resultado = await operarSubstituicaoCmNativa(
    pedido(),
    {
      operacao: 'registrar',
      paciente_id: paciente,
      substituto_usuario_id: substituta,
      inicio: '2026-11-20T09:00:00.000Z',
      fim: '2026-11-27T09:00:00.000Z',
      motivo: 'Titular em férias programadas.',
    },
    portasCom(banco),
  );
  expect(resultado.ok).toBe(true);
  // O que foi para o banco é envelope, não texto.
  const envelope = banco.entrada?.motivo_cifrado as CampoCifrado;
  expect(envelope.formato).toBe(1);
  expect(JSON.stringify(banco.entrada)).not.toContain('férias');
  // O que volta para a tela é texto, não envelope.
  const painel = (resultado as { dados: { substituicoes: { motivo: string }[] } }).dados;
  expect(painel.substituicoes[0]?.motivo).toBe('Titular em férias programadas.');
  expect(JSON.stringify(painel)).not.toContain('ciphertext');
});

it('preserva o motivo do encerramento antecipado ao lado do motivo do registro', async () => {
  const banco = bancoFicticio();
  const registro = await operarSubstituicaoCmNativa(
    pedido(),
    {
      operacao: 'registrar',
      paciente_id: paciente,
      substituto_usuario_id: substituta,
      inicio: '2026-11-20T09:00:00.000Z',
      fim: '2026-11-27T09:00:00.000Z',
      motivo: 'Titular em férias programadas.',
    },
    portasCom(banco),
  );
  const id = (registro as { dados: { substituicoes: { id: string }[] } }).dados.substituicoes[0]
    ?.id as string;
  const encerramento = await operarSubstituicaoCmNativa(
    pedido(),
    {
      operacao: 'encerrar',
      paciente_id: paciente,
      substituicao_id: id,
      motivo: 'Titular voltou antes do previsto.',
    },
    portasCom(banco),
  );
  expect(encerramento.ok).toBe(true);
  const item = (
    encerramento as {
      dados: { substituicoes: { motivo: string; motivo_encerramento: string | null }[] };
    }
  ).dados.substituicoes[0];
  expect(item?.motivo).toBe('Titular em férias programadas.');
  expect(item?.motivo_encerramento).toBe('Titular voltou antes do previsto.');
  expect(banco.entrada?.motivo_cifrado).toBeUndefined();
});

it('recusa registrar e encerrar sem motivo, antes de tocar no banco', async () => {
  const banco = bancoFicticio();
  const semMotivo = await operarSubstituicaoCmNativa(
    pedido(),
    {
      operacao: 'registrar',
      paciente_id: paciente,
      substituto_usuario_id: substituta,
      inicio: '2026-11-20T09:00:00.000Z',
      fim: '2026-11-27T09:00:00.000Z',
      motivo: '   ',
    },
    portasCom(banco),
  );
  expect(semMotivo).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
  const encerrarSemMotivo = await operarSubstituicaoCmNativa(
    pedido(),
    {
      operacao: 'encerrar',
      paciente_id: paciente,
      substituicao_id: '70000000-0000-4000-8000-000000000001',
      motivo: '',
    },
    portasCom(banco),
  );
  expect(encerrarSemMotivo).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
  expect(banco.entrada).toBeUndefined();
});

it('envelope de outra substituição derruba a resposta em vez de virar texto solto', async () => {
  const banco = bancoFicticio();
  await operarSubstituicaoCmNativa(
    pedido(),
    {
      operacao: 'registrar',
      paciente_id: paciente,
      substituto_usuario_id: substituta,
      inicio: '2026-11-20T09:00:00.000Z',
      fim: '2026-11-27T09:00:00.000Z',
      motivo: 'Titular em férias programadas.',
    },
    portasCom(banco),
  );
  // O banco devolve a linha com o id trocado: o AAD deixa de bater e a decifra falha fechada.
  const [chave] = Object.keys(banco.linhas);
  const linha = banco.linhas[chave as string] as Record<string, unknown>;
  banco.linhas[chave as string] = { ...linha, id: '70000000-0000-4000-8000-00000000000f' };
  const consulta = await operarSubstituicaoCmNativa(
    new Request(caminho, { headers: { 'x-sessao': sessao } }),
    { operacao: 'consultar', paciente_id: paciente },
    portasCom(banco),
  );
  expect(consulta).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
});
