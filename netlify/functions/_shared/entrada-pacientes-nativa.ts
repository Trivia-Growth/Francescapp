import {
  criarErroPublicoSemCampos,
  statusErroHttp,
} from '../../../packages/contracts/src/erros.ts';
import { contratosBarreiraHttp } from '../../../packages/contracts/src/barreira-http.ts';
import { contratosRotas } from '../../../packages/contracts/src/rotas.ts';
import type { FonteDeConfiguracao } from '../../../supabase/functions/_shared/configuracao.ts';
import { configurarPacientesNativo } from './configurar-pacientes-nativo.ts';

type Rota = Parameters<ReturnType<typeof configurarPacientesNativo>['executar']>[1];

function identificarRota(request: Request): Rota | undefined {
  const caminho = new URL(request.url).pathname;
  if (caminho === '/api/familiar/pacientes' && request.method === 'GET') return 'carteira-familiar';
  if (caminho === contratosRotas.listarPacientes.caminho) {
    if (request.method === 'GET') return 'carteira';
    if (request.method === 'POST') return 'cadastro';
  }
  for (const [operacao, contrato] of Object.entries(contratosBarreiraHttp)) {
    if (caminho === contrato.caminho && request.method === contrato.metodo) return operacao as Rota;
  }
  return undefined;
}

function falha(codigo: 'nao_encontrado' | 'configuracao_indisponivel'): Response {
  return Response.json(criarErroPublicoSemCampos(codigo, crypto.randomUUID()), {
    status: statusErroHttp[codigo],
    headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** Entrada interna: requer registro explícito após aprovação S-02; não publica rotas. */
export function criarEntradaPacientesNativa(fonte: FonteDeConfiguracao) {
  let configurada: ReturnType<typeof configurarPacientesNativo> | undefined;
  return {
    async atender(request: Request): Promise<Response> {
      const rota = identificarRota(request);
      if (!rota) return falha('nao_encontrado');
      try {
        configurada ??= configurarPacientesNativo(fonte);
      } catch {
        return falha('configuracao_indisponivel');
      }
      return configurada.executar(request, rota);
    },
    async encerrar(): Promise<void> {
      const anterior = configurada;
      configurada = undefined;
      await anterior?.encerrar();
    },
  };
}
