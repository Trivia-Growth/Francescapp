import { criarErroPublicoSemCampos } from '../../packages/contracts/src/erros.ts';
import { configurarDependenciasNativas } from './_shared/configurar-dependencias-nativas.ts';
import { criarEntradaConfiguracaoSistemaNativa } from './_shared/entrada-configuracao-sistema-nativa.ts';

export const config = { path: '/api/admin/configuracao-sistema' };

let entrada: ReturnType<typeof criarEntradaConfiguracaoSistemaNativa> | undefined;

export default async function configuracaoSistema(request: Request): Promise<Response> {
  // Esta rota NÃO lê a própria chave no banco, de propósito: é a tela que edita a
  // configuração. Se ela dependesse do banco, um valor errado gravado pela tela trancaria a
  // própria tela por fora. Continua em variável de ambiente, como interruptor de última
  // instância. Administrador-only; autorização real fica no banco. Não "corrija" isto migrando
  // para `servicoAtivo` (13/11/2026).
  if (process.env.FFCM_CONFIGURACAO_SISTEMA_ATIVO !== 'true') return falha('servico_indisponivel');
  try {
    entrada ??= criarEntradaConfiguracaoSistemaNativa(configurarDependenciasNativas(process.env));
  } catch {
    return falha('configuracao_indisponivel');
  }
  return entrada.atender(request);
}

function falha(codigo: 'servico_indisponivel' | 'configuracao_indisponivel'): Response {
  return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
