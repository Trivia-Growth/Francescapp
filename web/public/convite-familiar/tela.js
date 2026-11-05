const url = new URL(location.href);
const fragmento = new URLSearchParams(url.hash.slice(1));
const convite = url.searchParams.get('convite');
let token = fragmento.get('token_hash');
const tipo = fragmento.get('tipo');
// O token não permanece no histórico, na URL ou no armazenamento do navegador.
history.replaceState(null, '', '/convite-familiar/');

const form = document.querySelector('#ativacao');
const senha = document.querySelector('#senha');
const confirmacao = document.querySelector('#confirmacao');
const status = document.querySelector('#status');
const botao = form.querySelector('button');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const valido =
  url.searchParams.getAll('convite').length === 1 &&
  [...url.searchParams.keys()].every((chave) => chave === 'convite') &&
  fragmento.getAll('token_hash').length === 1 &&
  fragmento.getAll('tipo').length === 1 &&
  [...fragmento.keys()].every((chave) => chave === 'token_hash' || chave === 'tipo') &&
  uuid.test(convite ?? '') &&
  /^[a-f0-9]{64}$/i.test(token ?? '') &&
  (tipo === 'invite' || tipo === 'recovery');

if (!valido) {
  token = null;
  status.textContent = 'Este link não está disponível. Peça à equipe um novo acesso.';
} else {
  form.hidden = false;
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!token || !senha.value || senha.value !== confirmacao.value) {
      status.textContent = 'Confira se as duas senhas são iguais.';
      return;
    }
    botao.disabled = true;
    status.textContent = 'Criando sua senha…';
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const fluxo = btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
    try {
      const resposta = await fetch('/api/auth/familiar/ativar', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', 'x-fluxo': fluxo },
        body: JSON.stringify({ convite_id: convite, token_hash: token, tipo, senha: senha.value }),
      });
      token = null;
      senha.value = '';
      confirmacao.value = '';
      if (!resposta.ok) throw new Error();
      form.hidden = true;
      status.textContent = 'Senha criada. Volte à entrada e acesse com seu e-mail e sua senha.';
    } catch {
      token = null;
      senha.value = '';
      confirmacao.value = '';
      form.hidden = true;
      status.textContent =
        'Não foi possível concluir. Peça à equipe orientação para recuperar seu acesso.';
    }
  });
}
