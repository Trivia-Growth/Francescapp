type Evento = { id: string; inicio: string; fim: string; etag?: string };
type Acao = 'criar' | 'alterar' | 'cancelar';

function horarioSaoPaulo(valor: string): string {
  // Converte a hora civil usando as regras do fuso, inclusive eventuais mudanças futuras.
  const partes = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(valor);
  if (!partes) throw new Error();
  const civil = Date.UTC(
    Number(partes[1]),
    Number(partes[2]) - 1,
    Number(partes[3]),
    Number(partes[4]),
    Number(partes[5]),
  );
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  let instante = civil;
  for (let i = 0; i < 2; i += 1) {
    const campos = Object.fromEntries(
      formato.formatToParts(instante).map((parte) => [parte.type, parte.value]),
    );
    const observado = Date.UTC(
      Number(campos.year),
      Number(campos.month) - 1,
      Number(campos.day),
      Number(campos.hour),
      Number(campos.minute),
    );
    instante += civil - observado;
  }
  const campos = Object.fromEntries(
    formato.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  );
  if (`${campos.year}-${campos.month}-${campos.day}T${campos.hour}:${campos.minute}` !== valor)
    throw new Error();
  return new Date(instante).toISOString();
}

export function montarOperacoesAgenda(
  raiz: HTMLElement,
  cabecalhos: () => Headers,
  atualizar: () => void,
) {
  let ativa = true;
  const marcador = 'ffcm-agenda-operacao-incerta';
  let envioSemResposta = false;
  try {
    envioSemResposta = localStorage.getItem(marcador) === '1';
  } catch {
    envioSemResposta = true;
  }
  let incerto = true;
  let ocupado = false;
  let evento: Evento | undefined;
  let acao: Acao = 'criar';
  let pendente: Record<string, unknown> | undefined;
  const abrir = document.createElement('button');
  abrir.type = 'button';
  abrir.className = 'button-primary';
  abrir.textContent = 'Novo compromisso';
  abrir.disabled = true;
  const formulario = document.createElement('form');
  formulario.hidden = true;
  const titulo = document.createElement('h3');
  const explicacao = document.createElement('p');
  explicacao.textContent =
    'Horários no fuso de São Paulo. O compromisso será registrado com título genérico.';
  const inicio = document.createElement('input');
  inicio.type = 'datetime-local';
  inicio.required = true;
  inicio.id = 'agenda-inicio';
  const fim = document.createElement('input');
  fim.type = 'datetime-local';
  fim.required = true;
  fim.id = 'agenda-fim';
  const campoInicio = document.createElement('div');
  campoInicio.className = 'field';
  const labelInicio = document.createElement('label');
  labelInicio.htmlFor = inicio.id;
  labelInicio.textContent = 'Início';
  campoInicio.append(labelInicio, inicio);
  const campoFim = document.createElement('div');
  campoFim.className = 'field';
  const labelFim = document.createElement('label');
  labelFim.htmlFor = fim.id;
  labelFim.textContent = 'Fim';
  campoFim.append(labelFim, fim);
  const salvar = document.createElement('button');
  salvar.type = 'submit';
  salvar.className = 'button-primary';
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'button-secondary';
  fechar.textContent = 'Fechar';
  const confirmar = document.createElement('button');
  confirmar.type = 'button';
  confirmar.className = 'button-secondary';
  confirmar.hidden = true;
  confirmar.textContent = 'Manter mesmo com conflito';
  const feedback = document.createElement('p');
  feedback.className = 'feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  formulario.append(titulo, explicacao, campoInicio, campoFim, salvar, fechar, confirmar, feedback);
  const resultado = document.createElement('p');
  resultado.setAttribute('role', 'status');
  resultado.setAttribute('aria-live', 'polite');
  const reconciliar = document.createElement('button');
  reconciliar.type = 'button';
  reconciliar.className = 'button-secondary';
  reconciliar.textContent = 'Verificar situação no Google';
  reconciliar.hidden = true;
  raiz.append(abrir, resultado, reconciliar, formulario);

  async function verificarPendencia(): Promise<void> {
    incerto = true;
    abrir.disabled = true;
    reconciliar.disabled = true;
    resultado.textContent = 'Verificando operações pendentes…';
    try {
      const resposta = await fetch('/api/agenda/google/pendencia', {
        headers: cabecalhos(),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const dados: unknown = await resposta.json();
      if (!ativa) return;
      if (!dados || typeof dados !== 'object' || !('estado' in dados)) throw new Error();
      if (dados.estado === 'nenhuma' && !envioSemResposta) {
        incerto = false;
        ocupado = false;
        abrir.disabled = false;
        reconciliar.hidden = true;
        formulario.hidden = true;
        resultado.textContent = '';
      } else if (dados.estado === 'pendente') {
        reconciliar.hidden = false;
        resultado.textContent =
          'Uma operação aguarda confirmação. Verifique sua situação no Google antes de fazer outra alteração.';
      } else if (dados.estado === 'nenhuma') {
        reconciliar.hidden = false;
        resultado.textContent =
          'A operação enviada ainda não pode ser localizada. Não repita a alteração; confira diretamente no Google e procure suporte.';
      } else throw new Error();
    } catch {
      if (!ativa) return;
      reconciliar.hidden = false;
      resultado.textContent =
        'Não foi possível verificar operações pendentes. Tente novamente antes de alterar a agenda.';
    } finally {
      if (ativa) reconciliar.disabled = false;
    }
  }
  reconciliar.addEventListener('click', async () => {
    reconciliar.disabled = true;
    resultado.textContent = 'Consultando o Google…';
    try {
      const headers = cabecalhos();
      headers.set('Content-Type', 'application/json');
      const resposta = await fetch('/api/agenda/google/reconciliar', {
        method: 'POST',
        headers,
        body: '{}',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const dados: unknown = await resposta.json();
      if (!ativa) return;
      if (!dados || typeof dados !== 'object' || !('estado' in dados)) throw new Error();
      if (dados.estado === 'confirmado') {
        localStorage.removeItem(marcador);
        envioSemResposta = false;
        await verificarPendencia();
        if (!incerto) {
          resultado.textContent = 'Operação confirmada no Google Calendar.';
          atualizar();
        }
      } else if (dados.estado === 'pendente') {
        resultado.textContent =
          'A operação ainda não foi confirmada. Tente verificar novamente mais tarde.';
      } else throw new Error();
    } catch {
      if (ativa)
        resultado.textContent =
          'Não foi possível verificar a operação. Tente novamente mais tarde.';
    } finally {
      if (ativa) reconciliar.disabled = false;
    }
  });
  void verificarPendencia();
  function exibir(novaAcao: Acao, item?: Evento) {
    if (incerto || ocupado) return;
    resultado.textContent = '';
    salvar.disabled = false;
    acao = novaAcao;
    evento = item;
    pendente = undefined;
    confirmar.hidden = true;
    titulo.textContent =
      novaAcao === 'criar'
        ? 'Novo compromisso'
        : novaAcao === 'alterar'
          ? 'Alterar compromisso'
          : 'Cancelar compromisso';
    campoInicio.hidden = campoFim.hidden = novaAcao === 'cancelar';
    inicio.required = fim.required = novaAcao !== 'cancelar';
    inicio.value = fim.value = '';
    if (item && novaAcao === 'alterar') {
      const formato = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      const campo = (valor: string) => {
        const p = Object.fromEntries(
          formato.formatToParts(new Date(valor)).map((parte) => [parte.type, parte.value]),
        );
        return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
      };
      inicio.value = campo(item.inicio);
      fim.value = campo(item.fim);
    }
    salvar.textContent = novaAcao === 'cancelar' ? 'Confirmar cancelamento' : 'Salvar compromisso';
    feedback.textContent =
      novaAcao === 'cancelar'
        ? 'Confirme o cancelamento deste compromisso no Google Calendar.'
        : '';
    formulario.hidden = false;
    (novaAcao === 'cancelar' ? salvar : inicio).focus();
  }
  async function enviar(dados: Record<string, unknown>) {
    ocupado = true;
    salvar.disabled = confirmar.disabled = true;
    abrir.disabled = true;
    feedback.textContent = 'Aguardando confirmação do Google…';
    try {
      localStorage.setItem(marcador, '1');
      envioSemResposta = true;
      const headers = cabecalhos();
      headers.set('Content-Type', 'application/json');
      const resposta = await fetch('/api/agenda/google/operacoes', {
        method: 'POST',
        headers,
        body: JSON.stringify(dados),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      const corpo: unknown = await resposta.json();
      if (!ativa) return;
      if (!corpo || typeof corpo !== 'object' || !('estado' in corpo)) throw new Error();
      if (
        ['confirmado', 'conflito_horario', 'conflito_versao', 'indisponivel'].includes(
          String(corpo.estado),
        )
      ) {
        localStorage.removeItem(marcador);
        envioSemResposta = false;
      }
      if (corpo.estado === 'confirmado') {
        formulario.hidden = true;
        resultado.textContent = 'Operação confirmada no Google Calendar.';
        atualizar();
        return;
      }
      if (corpo.estado === 'conflito_horario') {
        pendente = dados;
        confirmar.hidden = false;
        feedback.textContent =
          'Há outro compromisso nesse horário. Confira e decida se deseja manter.';
        return;
      }
      if (corpo.estado === 'conflito_versao') {
        feedback.textContent =
          'O compromisso mudou no Google. Atualize a agenda antes de tentar novamente.';
        return;
      }
      if (corpo.estado === 'indisponivel') {
        feedback.textContent =
          'Operação indisponível. Tente novamente quando o serviço estiver disponível.';
        return;
      }
      throw new Error();
    } catch {
      if (!ativa) return;
      incerto = true;
      abrir.disabled = true;
      salvar.disabled = true;
      confirmar.hidden = true;
      feedback.textContent =
        'Não foi possível confirmar o resultado. Verifique a situação antes de outra alteração.';
      formulario.hidden = true;
      void verificarPendencia();
    } finally {
      if (ativa && !incerto) {
        ocupado = false;
        abrir.disabled = false;
        salvar.disabled = confirmar.disabled = false;
      }
    }
  }
  abrir.addEventListener('click', () => exibir('criar'));
  fechar.addEventListener('click', () => {
    if (ocupado || incerto) return;
    formulario.hidden = true;
    abrir.focus();
  });
  formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const dados: Record<string, unknown> = { acao, operacao_id: crypto.randomUUID() };
      if (evento) {
        dados.evento_id = evento.id;
        dados.etag = evento.etag;
      }
      if (acao !== 'cancelar') {
        dados.inicio = horarioSaoPaulo(inicio.value);
        dados.fim = horarioSaoPaulo(fim.value);
        if (Date.parse(dados.inicio as string) >= Date.parse(dados.fim as string))
          throw new Error();
      }
      void enviar(dados);
    } catch {
      feedback.textContent =
        'Confira os horários: o fim deve ser posterior ao início e ambos devem existir no fuso de São Paulo.';
    }
  });
  confirmar.addEventListener('click', () => {
    if (pendente) void enviar({ ...pendente, confirmar_conflito: true });
  });
  return {
    editar: (item: Evento) => exibir('alterar', item),
    cancelar: (item: Evento) => exibir('cancelar', item),
    desmontar: () => {
      ativa = false;
    },
  };
}
