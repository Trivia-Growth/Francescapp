import type { Pool, PoolClient } from 'pg';
import {
  tipoConfiguracaoSchema,
  valorConfiguracaoSchema,
  valorCompativel,
  type TipoConfiguracao,
  type ValorConfiguracao,
} from '../../../packages/contracts/src/configuracao-sistema.ts';
import { causaDaFalha, registrarFalhaOperacional } from './falha-operacional.ts';

/** Leitura da configuração gravada no banco pelo processo do servidor.
 *
 * Diretriz do solicitante (11/11/2026): o que é variável vem do banco, preenchido pela tela.
 * A variável de ambiente continua existindo como PADRÃO e como interruptor de última
 * instância para quando o banco não responde — nunca o contrário: falha de leitura jamais
 * LIGA um serviço, só mantém o que o ambiente já dizia.
 *
 * Só enxerga chaves `exposicao = 'servidor'`, por `identidade.ler_configuracao_sistema_publica()`,
 * alcançada pela cadeia de papéis de `20261117420000_configuracao_sistema_leitor_servidor.sql`.
 * Esta leitura NÃO é autorização: decide disponibilidade do serviço, não permissão de quem
 * chama. A rota continua validando sessão, concessão e atestado no banco. */

const JANELA_MS = 30_000;
/** Uma segunda tentativa no processo FRIO, e só nele. Medido em produção em 13/11/2026: a
 * primeira requisição a um processo novo às vezes não conclui a leitura (conexão fria ao
 * PostgreSQL), e aí o serviço inteiro respondia "indisponível" porque o padrão de ambiente
 * passou a ser `false` quando as variáveis duplicadas saíram do Netlify. Uma falha passageira
 * não pode desligar uma tela. Quando já existe leitura anterior em cache, não há retentativa:
 * o valor conhecido vale, como antes. */
const ESPERA_RETENTATIVA_MS = 150;

type Linha = { valor: ValorConfiguracao; tipo: TipoConfiguracao; versao: number };

let cache: { em: number; valores: ReadonlyMap<string, Linha> } | undefined;
let emVoo: Promise<ReadonlyMap<string, Linha>> | undefined;

/** Só para testes: descarta a janela de cache entre casos. */
export function esquecerConfiguracaoServidor(): void {
  cache = undefined;
  emVoo = undefined;
}

async function ler(pool: Pool): Promise<ReadonlyMap<string, Linha>> {
  let cliente: PoolClient | undefined;
  let destruir = true;
  try {
    cliente = await pool.connect();
    await cliente.query('BEGIN');
    await cliente.query("SET LOCAL statement_timeout = '3s'");
    await cliente.query('SET LOCAL ROLE ffcmapp_configuracao_leitor_executor');
    const resultado = await cliente.query(
      'select identidade.ler_configuracao_sistema_publica() as configuracao',
    );
    await cliente.query('COMMIT');
    destruir = false;
    const bruto: unknown = resultado.rows[0]?.configuracao;
    if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) throw new Error();
    const valores = new Map<string, Linha>();
    for (const [chave, item] of Object.entries(bruto as Record<string, unknown>)) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
      const { valor, tipo, versao } = item as Record<string, unknown>;
      const tipoValidado = tipoConfiguracaoSchema.safeParse(tipo);
      const valorValidado = valorConfiguracaoSchema.safeParse(valor);
      if (!tipoValidado.success || !valorValidado.success) continue;
      if (!valorCompativel(tipoValidado.data, valorValidado.data)) continue;
      if (!Number.isInteger(versao)) continue;
      valores.set(chave, {
        valor: valorValidado.data,
        tipo: tipoValidado.data,
        versao: versao as number,
      });
    }
    return valores;
  } finally {
    cliente?.release(destruir);
  }
}

/** Primeira leitura do processo: tenta duas vezes antes de desistir. Já havendo cache, uma
 * falha mantém o valor conhecido e não custa uma segunda conexão. */
async function lerComRetentativaNoFrio(pool: Pool): Promise<ReadonlyMap<string, Linha>> {
  try {
    return await ler(pool);
  } catch (erro) {
    if (cache) throw erro;
    await new Promise((resolver) => setTimeout(resolver, ESPERA_RETENTATIVA_MS));
    return await ler(pool);
  }
}

/** Carrega (com janela curta de cache) o mapa de configuração do servidor. Devolve um mapa
 * vazio quando a leitura falha — quem chama decide o padrão. */
export async function carregarConfiguracaoServidor(
  pool: Pool,
): Promise<ReadonlyMap<string, Linha>> {
  const agora = Date.now();
  if (cache && agora - cache.em < JANELA_MS) return cache.valores;
  // Uma leitura em voo por processo: uma rajada de requisições não vira uma rajada de
  // conexões ao banco.
  emVoo ??= lerComRetentativaNoFrio(pool)
    .then((valores) => {
      cache = { em: Date.now(), valores };
      return valores;
    })
    .catch((erro: unknown) => {
      // Terceiro ponto cego, achado em 13/11/2026: quando esta leitura falha, cada rota cai no
      // padrão de ambiente e se declara indisponível — e nada registrava o porquê. Como o
      // padrão virou `false` ao tirar as variáveis duplicadas do Netlify, uma falha aqui apaga
      // uma tela inteira em silêncio. Sem mensagem do banco: só a causa reduzida a um
      // identificador curto.
      registrarFalhaOperacional({
        rota: 'configuracao-servidor',
        etapa: 'operacao',
        request_id: crypto.randomUUID(),
        causa: causaDaFalha(erro),
      });
      return cache?.valores ?? new Map<string, Linha>();
    })
    .finally(() => {
      emVoo = undefined;
    });
  return emVoo;
}

/** Lê uma chave de texto (FR-010 usa uma para o modelo de transcrição). `aceitos`, quando
 * informado, é a lista fechada do catálogo: valor fora dela cai no padrão em vez de ser
 * repassado ao provedor — identificador inválido viraria falha só em produção. */
export async function textoConfigurado(
  pool: Pool,
  chave: string,
  padrao: string,
  aceitos?: readonly string[],
): Promise<string> {
  try {
    const valores = await carregarConfiguracaoServidor(pool);
    const linha = valores.get(chave);
    if (!linha || linha.tipo !== 'texto' || typeof linha.valor !== 'string') return padrao;
    const valor = linha.valor.trim();
    if (!valor) return padrao;
    if (aceitos && !aceitos.includes(valor)) return padrao;
    return valor;
  } catch {
    return padrao;
  }
}

/** Lê uma chave numérica inteira. Fora de faixa, não inteira, ausente ou ilegível cai no
 * padrão — nunca em "sem limite", porque este número costuma ser um teto. */
export async function numeroConfigurado(
  pool: Pool,
  chave: string,
  padrao: number,
  minimo: number,
  maximo: number,
): Promise<number> {
  try {
    const valores = await carregarConfiguracaoServidor(pool);
    const linha = valores.get(chave);
    if (!linha || linha.tipo !== 'numero' || typeof linha.valor !== 'number') return padrao;
    if (!Number.isInteger(linha.valor) || linha.valor < minimo || linha.valor > maximo)
      return padrao;
    return linha.valor;
  } catch {
    return padrao;
  }
}

/** Lê uma chave de lista (FR-009 usa uma para as áreas da síntese). `padrao` vale sempre que
 * o banco não traz a chave, não traz lista ou não responde — pelo mesmo motivo de
 * `servicoAtivo`: falha de leitura não inventa configuração, mantém a que já valia. */
export async function listaConfigurada(
  pool: Pool,
  chave: string,
  padrao: readonly string[],
): Promise<string[]> {
  try {
    const valores = await carregarConfiguracaoServidor(pool);
    const linha = valores.get(chave);
    if (!linha || linha.tipo !== 'lista' || !Array.isArray(linha.valor)) return [...padrao];
    return [...linha.valor];
  } catch {
    return [...padrao];
  }
}

/** Decide um interruptor booleano. `padraoAmbiente` é o valor que a variável de ambiente já
 * dizia; ele vence sempre que o banco não traz a chave, não traz booleano, ou não responde. */
export async function servicoAtivo(
  pool: Pool,
  chave: string,
  padraoAmbiente: boolean,
): Promise<boolean> {
  try {
    const valores = await carregarConfiguracaoServidor(pool);
    const linha = valores.get(chave);
    if (!linha || linha.tipo !== 'booleano' || typeof linha.valor !== 'boolean')
      return padraoAmbiente;
    return linha.valor;
  } catch {
    return padraoAmbiente;
  }
}
