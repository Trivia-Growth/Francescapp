/** Uso exclusivo no servidor, após autorização da sessão e obtenção do token pelo cofre. */
export type CompromissoGoogle = Readonly<{
  id: string;
  inicio: string;
  fim: string;
  titulo: string;
}>;

type Resultado =
  | Readonly<{ estado: 'indisponivel' }>
  | Readonly<{ estado: 'disponivel'; compromissos: readonly CompromissoGoogle[] }>;

/** Consulta a agenda primária; nunca devolve títulos ou descrições sem autorização clínica. */
export async function consultarAgendaGoogleIndividual(
  opcoes: Readonly<{
    habilitada: boolean;
    token: string | undefined;
    inicio: string;
    fim: string;
  }>,
): Promise<Resultado> {
  const indisponivel = { estado: 'indisponivel' } as const;
  const inicio = Date.parse(opcoes.inicio);
  const fim = Date.parse(opcoes.fim);
  if (
    !opcoes.habilitada ||
    !opcoes.token ||
    !Number.isFinite(inicio) ||
    !Number.isFinite(fim) ||
    inicio >= fim
  ) {
    return indisponivel;
  }

  const compromissos: CompromissoGoogle[] = [];
  const paginas = new Set<string>();
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), 15_000);
  let pagina: string | undefined;
  try {
    do {
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      url.searchParams.set('timeMin', new Date(inicio).toISOString());
      url.searchParams.set('timeMax', new Date(fim).toISOString());
      url.searchParams.set('timeZone', 'America/Sao_Paulo');
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('maxResults', '250');
      if (pagina) url.searchParams.set('pageToken', pagina);
      const resposta = await fetch(url, {
        headers: { Authorization: `Bearer ${opcoes.token}` },
        redirect: 'error',
        signal: controle.signal,
      });
      if (!resposta.ok) return indisponivel;
      const dados: unknown = await resposta.json();
      if (
        typeof dados !== 'object' ||
        dados === null ||
        !('items' in dados) ||
        !Array.isArray(dados.items)
      )
        return indisponivel;
      for (const item of dados.items) {
        if (
          typeof item !== 'object' ||
          item === null ||
          typeof item.id !== 'string' ||
          typeof item.start !== 'object' ||
          item.start === null ||
          typeof item.end !== 'object' ||
          item.end === null
        )
          return indisponivel;
        const inicioEvento = item.start.dateTime ?? item.start.date;
        const fimEvento = item.end.dateTime ?? item.end.date;
        if (typeof inicioEvento !== 'string' || typeof fimEvento !== 'string') return indisponivel;
        compromissos.push({
          id: item.id,
          inicio: inicioEvento,
          fim: fimEvento,
          titulo: 'Compromisso',
        });
      }
      const proxima = 'nextPageToken' in dados ? dados.nextPageToken : undefined;
      if (proxima !== undefined) {
        if (typeof proxima !== 'string' || !proxima || paginas.has(proxima) || paginas.size >= 100)
          return indisponivel;
        paginas.add(proxima);
      }
      pagina = proxima;
    } while (pagina);
    return { estado: 'disponivel', compromissos };
  } catch {
    return indisponivel;
  } finally {
    clearTimeout(prazo);
  }
}
