import { projetarPacienteBasicoExperimental } from '../../../packages/cadastro/src/projetar-paciente-experimental.ts';
import type { AdaptadorCifra } from '../../../packages/contracts/src/index.ts';

type Identidade = Readonly<{ usuarioId: string; sessaoId: string; subjectGoogle: string }>;
type Credencial = Readonly<{ refresh: string; geracao: string }>;
type VinculoCifrado = Readonly<{ evento_id: string; paciente: unknown }>;

/** Resposta inclui apenas vínculos cujo acesso ao paciente foi conferido no banco. */
export async function consultarVinculosAgenda(
  request: Request,
  portas: {
    origem: string;
    autorizar(request: Request): Promise<Identidade | null>;
    lerCredencial(): Promise<Credencial | null>;
    consultarVinculos(
      eventos: readonly string[],
      subject: string,
      geracao: string,
    ): Promise<readonly VinculoCifrado[]>;
    cifra: Pick<AdaptadorCifra, 'decifrar'>;
  },
): Promise<Response> {
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const erro = (status: number) =>
    Response.json(
      {
        erro:
          status === 401
            ? 'nao_autenticado'
            : status === 422
              ? 'entrada_invalida'
              : 'servico_indisponivel',
      },
      { status, headers },
    );
  try {
    const url = new URL(request.url);
    if (
      request.method !== 'POST' ||
      url.origin !== portas.origem ||
      url.pathname !== '/api/agenda/google/vinculos/consulta' ||
      url.search ||
      url.hash ||
      request.headers.get('origin') !== portas.origem ||
      request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json' ||
      !request.body
    )
      return erro(422);
    const leitor = request.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let texto = '';
    let tamanho = 0;
    try {
      while (true) {
        const parte = await leitor.read();
        if (parte.done) break;
        tamanho += parte.value.length;
        if (tamanho > 262_144) {
          void leitor.cancel().catch(() => {});
          return erro(422);
        }
        texto += decoder.decode(parte.value, { stream: true });
      }
      texto += decoder.decode();
    } finally {
      leitor.releaseLock();
    }
    const dados: unknown = JSON.parse(texto);
    if (
      typeof dados !== 'object' ||
      dados === null ||
      Array.isArray(dados) ||
      Object.keys(dados).some((nome) => nome !== 'eventos_ids') ||
      !('eventos_ids' in dados) ||
      !Array.isArray(dados.eventos_ids) ||
      dados.eventos_ids.length < 1 ||
      dados.eventos_ids.length > 250 ||
      dados.eventos_ids.some(
        (v: unknown) => typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,1024}$/.test(v),
      ) ||
      new Set(dados.eventos_ids).size !== dados.eventos_ids.length
    )
      return erro(422);
    const eventos: string[] = dados.eventos_ids;
    const identidade = await portas.autorizar(request);
    if (!identidade) return erro(401);
    const credencial = await portas.lerCredencial();
    if (!credencial) return erro(503);
    const vinculos = await portas.consultarVinculos(
      eventos,
      identidade.subjectGoogle,
      credencial.geracao,
    );
    const saida = [];
    for (const vinculo of vinculos) {
      const paciente = await projetarPacienteBasicoExperimental(vinculo.paciente, portas.cifra);
      saida.push({
        evento_id: vinculo.evento_id,
        paciente_id: paciente.id,
        nome: paciente.nome_preferencia ?? paciente.nome,
      });
    }
    const atual = await portas.autorizar(request);
    if (
      !atual ||
      atual.usuarioId !== identidade.usuarioId ||
      atual.sessaoId !== identidade.sessaoId ||
      atual.subjectGoogle !== identidade.subjectGoogle
    )
      return erro(401);
    const confirmados = await portas.consultarVinculos(
      eventos,
      identidade.subjectGoogle,
      credencial.geracao,
    );
    const autorizados = new Set(
      confirmados.map((v) => {
        if (
          typeof v.paciente !== 'object' ||
          v.paciente === null ||
          !('paciente_id' in v.paciente) ||
          typeof v.paciente.paciente_id !== 'string'
        )
          throw new Error();
        return `${v.evento_id}:${v.paciente.paciente_id}`;
      }),
    );
    if (saida.some((v) => !autorizados.has(`${v.evento_id}:${v.paciente_id}`))) return erro(503);
    return Response.json({ dados: saida }, { headers });
  } catch {
    return erro(503);
  }
}
