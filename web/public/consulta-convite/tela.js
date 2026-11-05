const form = document.querySelector('#consulta');
const convite = document.querySelector('#convite');
const tentativa = document.querySelector('#tentativa');
const status = document.querySelector('#status');
const botao = form.querySelector('button');
const cancelarAutorizacao = document.querySelector('#cancelar-autorizacao');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mensagens = {
  resultado_incerto:
    'O resultado do envio ainda não foi confirmado. Não repita o envio automaticamente.',
  enviado: 'O envio foi registrado. Isso não confirma que o convite foi aberto.',
  falha: 'O envio falhou antes de chegar ao serviço de e-mail.',
  ativado: 'O acesso foi ativado.',
  tentativa_indisponivel: 'Não encontramos esta tentativa para o convite informado.',
};
const criacao = document.querySelector('#criacao');
const criacaoStatus = document.querySelector('#criacao-status');
const pacienteStatus = document.querySelector('#paciente-status');
const email = document.querySelector('#email');
const motivo = document.querySelector('#motivo');
const autorizacao = document.querySelector('#autorizar-acesso');
const novo = document.querySelector('#novo');
const criarBotao = criacao.querySelector('button[type="submit"]');
let pacienteConfirmado = null;

function sessaoAtual() {
  const modo = sessionStorage.getItem('modo-acesso');
  if (modo !== 'tecnica' && modo !== 'google') throw new Error();
  const fluxo = sessionStorage.getItem(modo === 'tecnica' ? 'fluxo-tecnico' : 'fluxo-google');
  const sessao = sessionStorage.getItem('sessao-tecnica');
  if (!fluxo || !sessao) throw new Error();
  return { fluxo, sessao };
}

function pacienteSelecionado(sessao) {
  const paciente = sessionStorage.getItem(`convite-paciente:${sessao}`);
  if (!paciente || !uuid.test(paciente)) throw new Error();
  return paciente;
}

function recuperarCodigos(sessao, paciente) {
  const chave = `convite-familiar:${sessao}:${paciente}`;
  const armazenado = sessionStorage.getItem(chave);
  if (armazenado) {
    const dados = JSON.parse(armazenado);
    if (
      uuid.test(dados.convite_id ?? '') &&
      uuid.test(dados.tentativa_id ?? '') &&
      uuid.test(dados.acesso_id ?? '')
    )
      return dados;
    throw new Error();
  }
  const dados = {
    convite_id: crypto.randomUUID(),
    tentativa_id: crypto.randomUUID(),
    acesso_id: crypto.randomUUID(),
  };
  sessionStorage.setItem(chave, JSON.stringify(dados));
  return dados;
}

async function mostrarPacienteSelecionado() {
  try {
    const { sessao, fluxo } = sessaoAtual();
    const paciente = pacienteSelecionado(sessao);
    const resposta = await fetch(`/api/pacientes/${encodeURIComponent(paciente)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'x-fluxo': fluxo, 'x-sessao': sessao },
    });
    if (!resposta.ok) throw new Error();
    const resultado = await resposta.json();
    const nome = resultado?.dados?.nome;
    if (typeof nome !== 'string' || !nome.trim()) throw new Error();
    if (sessaoAtual().sessao !== sessao || pacienteSelecionado(sessao) !== paciente)
      throw new Error();
    pacienteConfirmado = paciente;
    pacienteStatus.textContent = `Paciente: ${nome}`;
    criacao.hidden = false;
  } catch {
    pacienteConfirmado = null;
    criacao.hidden = true;
    pacienteStatus.textContent =
      'Não foi possível confirmar o paciente. Volte à carteira e selecione novamente.';
  }
}
void mostrarPacienteSelecionado();

try {
  const { sessao } = sessaoAtual();
  const paciente = pacienteSelecionado(sessao);
  const dados = sessionStorage.getItem(`convite-familiar:${sessao}:${paciente}`);
  if (dados) {
    const codigos = JSON.parse(dados);
    if (uuid.test(codigos.convite_id ?? '') && uuid.test(codigos.tentativa_id ?? '')) {
      convite.value = codigos.convite_id;
      tentativa.value = codigos.tentativa_id;
      criacaoStatus.textContent =
        'Há uma tentativa anterior nesta aba. Consulte o resultado ou informe os mesmos dados para retomar.';
    }
  }
} catch {
  criacao.hidden = true;
  criacaoStatus.textContent = 'Selecione um paciente na carteira para registrar um convite.';
}

novo.addEventListener('click', () => {
  try {
    const { sessao } = sessaoAtual();
    const paciente = pacienteSelecionado(sessao);
    sessionStorage.removeItem(`convite-familiar:${sessao}:${paciente}`);
    criacao.reset();
    criacaoStatus.textContent =
      'Os códigos anteriores continuam disponíveis nos campos de consulta.';
  } catch {
    criacaoStatus.textContent = 'Entre novamente para registrar um convite.';
  }
});

criacao.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!email.validity.valid || !motivo.value.trim() || !autorizacao.checked) {
    criacaoStatus.textContent = 'Confira o e-mail e o motivo.';
    return;
  }
  let sessao;
  let codigos;
  let paciente;
  try {
    sessao = sessaoAtual();
    paciente = pacienteSelecionado(sessao.sessao);
    if (paciente !== pacienteConfirmado) throw new Error();
    codigos = recuperarCodigos(sessao.sessao, paciente);
  } catch {
    criacaoStatus.textContent = 'Entre novamente para registrar um convite.';
    return;
  }
  convite.value = codigos.convite_id;
  tentativa.value = codigos.tentativa_id;
  criarBotao.disabled = true;
  novo.disabled = true;
  criacaoStatus.textContent = 'Registrando convite…';
  try {
    const resposta = await fetch('/api/admin/convites-familiares', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        'x-fluxo': sessao.fluxo,
        'x-sessao': sessao.sessao,
      },
      body: JSON.stringify({
        ...codigos,
        autorizar_acesso: true,
        paciente_id: paciente,
        email: email.value.trim(),
        motivo: motivo.value.trim(),
      }),
    });
    if (!resposta.ok) throw new Error();
    const resultado = await resposta.json();
    if (
      resultado?.dados?.convite_id !== codigos.convite_id ||
      !['enviado', 'falha', 'resultado_incerto'].includes(resultado?.dados?.envio)
    )
      throw new Error();
    criacaoStatus.textContent = mensagens[resultado.dados.envio];
    email.value = '';
    motivo.value = '';
  } catch {
    criacaoStatus.textContent =
      'Não foi possível confirmar o resultado. Consulte a tentativa antes de iniciar outro convite.';
  } finally {
    criarBotao.disabled = false;
    novo.disabled = false;
  }
});
form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!uuid.test(convite.value.trim()) || !uuid.test(tentativa.value.trim())) {
    status.textContent = 'Confira os dois códigos e tente novamente.';
    return;
  }
  let modo;
  let fluxo;
  let sessao;
  try {
    modo = sessionStorage.getItem('modo-acesso');
    fluxo = sessionStorage.getItem(modo === 'tecnica' ? 'fluxo-tecnico' : 'fluxo-google');
    sessao = sessionStorage.getItem('sessao-tecnica');
  } catch {
    status.textContent = 'Entre novamente para consultar o convite.';
    return;
  }
  if ((modo !== 'tecnica' && modo !== 'google') || !fluxo || !sessao) {
    status.textContent = 'Entre novamente para consultar o convite.';
    return;
  }
  const url = new URL('/api/admin/convites-familiares/consulta', location.origin);
  url.searchParams.set('convite', convite.value.trim());
  url.searchParams.set('tentativa', tentativa.value.trim());
  botao.disabled = true;
  status.textContent = 'Consultando…';
  try {
    const resposta = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'x-fluxo': fluxo, 'x-sessao': sessao },
    });
    if (!resposta.ok) throw new Error();
    const resultado = await resposta.json();
    const estado = resultado?.dados?.estado;
    if (typeof estado !== 'string' || !Object.hasOwn(mensagens, estado)) throw new Error();
    status.textContent = mensagens[estado];
  } catch {
    status.textContent = 'Não foi possível consultar. Verifique seu acesso e tente novamente.';
  } finally {
    botao.disabled = false;
  }
});

cancelarAutorizacao.addEventListener('click', async () => {
  if (!uuid.test(convite.value.trim()) || !uuid.test(tentativa.value.trim())) {
    status.textContent = 'Informe os códigos do convite e da tentativa.';
    return;
  }
  if (!window.confirm('Cancelar a autorização pendente deste convite?')) return;
  let sessao;
  try {
    sessao = sessaoAtual();
  } catch {
    status.textContent = 'Entre novamente para cancelar a autorização.';
    return;
  }
  cancelarAutorizacao.disabled = true;
  status.textContent = 'Cancelando autorização…';
  try {
    const resposta = await fetch('/api/admin/convites-familiares/cancelamento', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        'x-fluxo': sessao.fluxo,
        'x-sessao': sessao.sessao,
      },
      body: JSON.stringify({
        convite_id: convite.value.trim(),
        tentativa_id: tentativa.value.trim(),
      }),
    });
    if (!resposta.ok) throw new Error();
    const resultado = await resposta.json();
    if (resultado?.dados?.cancelada !== true) throw new Error();
    status.textContent = 'Autorização pendente cancelada.';
  } catch {
    status.textContent =
      'Não foi possível confirmar o cancelamento. Verifique a situação antes de continuar.';
  } finally {
    cancelarAutorizacao.disabled = false;
  }
});
