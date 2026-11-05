type Identidade = Readonly<{ usuarioId: string; sessaoId: string; subjectGoogle: string }>;
type Credencial = Readonly<{ refresh: string; geracao: string }>;

/** Retira somente o vínculo local; não altera o evento Google. */
export async function retirarVinculoAgenda(
  request: Request,
  portas: {
    origem: string;
    autorizar(request: Request): Promise<Identidade | null>;
    lerCredencial(): Promise<Credencial | null>;
    retirarVinculo(
      eventoId: string,
      pacienteId: string,
      vinculoId: string,
      subject: string,
      geracao: string,
    ): Promise<'retirado' | 'nao_encontrado'>;
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
      url.pathname !== '/api/agenda/google/vinculos/retirar' ||
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
        if (tamanho > 2048) {
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
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (
      typeof dados !== 'object' ||
      dados === null ||
      Array.isArray(dados) ||
      Object.keys(dados).some(
        (chave) => !['evento_id', 'paciente_id', 'vinculo_id'].includes(chave),
      ) ||
      !('evento_id' in dados) ||
      typeof dados.evento_id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,1024}$/.test(dados.evento_id) ||
      !('paciente_id' in dados) ||
      typeof dados.paciente_id !== 'string' ||
      !uuid.test(dados.paciente_id) ||
      !('vinculo_id' in dados) ||
      typeof dados.vinculo_id !== 'string' ||
      !uuid.test(dados.vinculo_id)
    )
      return erro(422);
    const identidade = await portas.autorizar(request);
    if (!identidade) return erro(401);
    const credencial = await portas.lerCredencial();
    if (!credencial) return erro(503);
    const estado = await portas.retirarVinculo(
      dados.evento_id,
      dados.paciente_id,
      dados.vinculo_id,
      identidade.subjectGoogle,
      credencial.geracao,
    );
    return Response.json({ estado }, { headers });
  } catch {
    return erro(503);
  }
}
