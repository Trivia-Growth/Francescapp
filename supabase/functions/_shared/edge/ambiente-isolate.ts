import type { Pool } from 'pg';
import { servicoAtivo } from '../../../../netlify/functions/_shared/configuracao-servidor.ts';
import type { FonteDeConfiguracao } from '../configuracao.ts';

/** Leitura de ambiente dentro do isolate Deno, concentrada num único ponto.
 *
 * Preserva literalmente a regra de `netlify/functions/_shared/configuracao-servidor.ts`
 * (diretriz de 11/11/2026): o que é variável vem do banco; a variável de ambiente é o
 * PADRÃO e o interruptor de última instância. **Falha de leitura jamais LIGA um serviço** —
 * nem falha de leitura do banco, nem falha de leitura do próprio ambiente.
 *
 * Por isso esta camada não inventa um mecanismo novo: ela entrega a `FonteDeConfiguracao`
 * que o código compartilhado já consome e delega a decisão a `servicoAtivo`, sem duplicar
 * a regra (D3: nenhuma camada de abstração sobre a plataforma). */

type LeitorDeAmbiente = Readonly<{ toObject(): Record<string, string> }>;

function leitorPadrao(): LeitorDeAmbiente | undefined {
  // `Deno` não existe sob Node (funções Netlify, Vitest); o acesso é deliberadamente
  // defensivo para que o mesmo módulo seja carregável nos dois runtimes.
  const global = globalThis as { Deno?: { env?: LeitorDeAmbiente } };
  return global.Deno?.env;
}

/** Tira uma fotografia imutável do ambiente do isolate.
 *
 * Nunca lança: ambiente ilegível (permissão negada, API ausente) devolve fonte vazia. Fonte
 * vazia significa "nenhum interruptor ligado", que é o lado seguro da falha. */
export function lerAmbienteDoIsolate(
  leitor: LeitorDeAmbiente | undefined = leitorPadrao(),
): FonteDeConfiguracao {
  if (!leitor) return Object.freeze({});
  try {
    return Object.freeze({ ...leitor.toObject() });
  } catch {
    return Object.freeze({});
  }
}

/** Interruptor de ambiente: só o literal `'true'` liga. Ausente, ilegível ou qualquer outro
 * valor mantém o serviço desligado. */
export function interruptorDeAmbiente(fonte: FonteDeConfiguracao, nome: string): boolean {
  return fonte[nome] === 'true';
}

/** Decide disponibilidade do serviço: banco manda, ambiente é o padrão.
 *
 * Não é autorização. A rota continua validando sessão, concessão e atestado no banco. */
export function decidirServicoAtivo(
  pool: Pool,
  chave: string,
  fonte: FonteDeConfiguracao,
  nomeDaVariavel: string,
): Promise<boolean> {
  return servicoAtivo(pool, chave, interruptorDeAmbiente(fonte, nomeDaVariavel));
}
