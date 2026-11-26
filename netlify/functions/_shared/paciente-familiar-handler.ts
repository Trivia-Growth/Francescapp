import { projetarPacienteBasicoExperimental } from '../../../packages/cadastro/src/projetar-paciente-experimental.ts';
import {
  criarErroPublicoSemCampos,
  statusErroHttp,
  uuidSchema,
  pacienteBasicoRpcSaidaSchema,
  type AdaptadorCifra,
  type CodigoErro,
} from '../../../packages/contracts/src/index.ts';

type Identidade = { usuario_id: string; session_id: string };
type Autorizacao =
  | { estado: 'autorizado'; identidade: Identidade }
  | { estado: 'entrada_invalida' | 'nao_autenticado' | 'servico_indisponivel' };

/** Preparação server-only: depende de autorização e auditoria na RPC privada. */
export async function consultarPacienteFamiliar(
  request: Request,
  portas: {
    autorizar(): Promise<Autorizacao>;
    consultar(entrada: { request_id: string; paciente_id: string }): Promise<unknown>;
    cifra: Pick<AdaptadorCifra, 'decifrar'>;
  },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (codigo: CodigoErro) =>
    Response.json(criarErroPublicoSemCampos(codigo, requestId), {
      status: statusErroHttp[codigo],
      headers,
    });
  try {
    const url = new URL(request.url);
    const match = /^\/api\/familiar\/pacientes\/([^/]+)$/.exec(url.pathname);
    const paciente = uuidSchema.safeParse(match?.[1]);
    if (request.method !== 'GET' || !paciente.success || url.search || url.hash)
      return erro('entrada_invalida');
    const inicial = await portas.autorizar();
    if (inicial.estado !== 'autorizado') return erro(inicial.estado);
    if (
      request.signal.aborted ||
      request.headers.get('x-sessao')?.toLowerCase() !== inicial.identidade.session_id.toLowerCase()
    )
      return erro('nao_autenticado');
    const resposta = await portas.consultar({
      request_id: requestId,
      paciente_id: paciente.data.toLowerCase(),
    });
    if (request.signal.aborted) return erro('nao_autenticado');
    if (!resposta || typeof resposta !== 'object' || Array.isArray(resposta)) throw new Error();
    const valor = resposta as Record<string, unknown>;
    if (valor.request_id !== requestId) throw new Error();
    if (
      valor.ok === false &&
      Object.keys(valor).length === 3 &&
      valor.erro &&
      typeof valor.erro === 'object' &&
      !Array.isArray(valor.erro) &&
      Object.keys(valor.erro).length === 1 &&
      (valor.erro as Record<string, unknown>).codigo === 'sem_permissao'
    )
      return erro('sem_permissao');
    if (valor.ok !== true || Object.keys(valor).length !== 3) throw new Error();
    const cifrado = pacienteBasicoRpcSaidaSchema.parse(valor.dados);
    if (cifrado.paciente_id.toLowerCase() !== paciente.data.toLowerCase()) throw new Error();
    const dados = await projetarPacienteBasicoExperimental(cifrado, portas.cifra);
    const atual = await portas.autorizar();
    if (atual.estado !== 'autorizado') return erro(atual.estado);
    if (
      request.signal.aborted ||
      atual.identidade.usuario_id.toLowerCase() !== inicial.identidade.usuario_id.toLowerCase() ||
      atual.identidade.session_id.toLowerCase() !== inicial.identidade.session_id.toLowerCase()
    )
      return erro('nao_autenticado');
    return Response.json({ dados, request_id: requestId }, { headers });
  } catch {
    return erro('servico_indisponivel');
  }
}
