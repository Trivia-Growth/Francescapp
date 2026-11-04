import { novoContatoSchema } from '../packages/contracts/src/index.js';
import { exigeNovoAcesso, mensagemFalha, resultadoIncerto, type ClienteFFCM } from './api.js';

/** Montagem preparada para quando a rota de contatos estiver autorizada. */
export function montarContatoPaciente(
  raiz: HTMLElement,
  pacienteId: string,
  api: ClienteFFCM,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void,
): () => void {
  let ativa = true;
  let bloqueada = false;
  const form = document.createElement('form');
  const campos = document.createElement('fieldset');
  const legenda = document.createElement('legend');
  legenda.textContent = 'Novo contato';
  const labelTipo = document.createElement('label');
  labelTipo.textContent = 'Tipo de contato';
  const tipo = document.createElement('select');
  for (const [valor, texto] of [
    ['telefone', 'Telefone'],
    ['email', 'E-mail'],
  ] as const) {
    const opcao = document.createElement('option');
    opcao.value = valor;
    opcao.textContent = texto;
    tipo.append(opcao);
  }
  labelTipo.append(tipo);
  const labelValor = document.createElement('label');
  const textoValor = document.createTextNode('Telefone');
  labelValor.append(textoValor);
  const valor = document.createElement('input');
  valor.type = 'tel';
  valor.required = true;
  valor.maxLength = 32;
  valor.autocomplete = 'off';
  labelValor.append(valor);
  tipo.addEventListener('change', () => {
    textoValor.textContent = tipo.value === 'email' ? 'E-mail' : 'Telefone';
    valor.type = tipo.value === 'email' ? 'email' : 'tel';
    valor.maxLength = tipo.value === 'email' ? 254 : 32;
  });
  const salvar = document.createElement('button');
  salvar.type = 'submit';
  salvar.className = 'button-primary';
  salvar.textContent = 'Adicionar contato';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  campos.append(legenda, labelTipo, labelValor);
  form.append(campos, salvar, status);
  form.addEventListener('input', () => alteracaoPendente(true));
  form.addEventListener('change', () => alteracaoPendente(true));
  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (bloqueada) return;
    const entrada = novoContatoSchema.safeParse({ tipo: tipo.value, valor: valor.value });
    if (!entrada.success) {
      status.textContent = 'Informe um telefone ou e-mail válido.';
      valor.focus();
      return;
    }
    bloqueada = true;
    campos.disabled = salvar.disabled = true;
    alteracaoPendente(true);
    status.textContent = 'Adicionando contato…';
    void api
      .criarContato(pacienteId, entrada.data, crypto.randomUUID())
      .then(() => {
        if (!ativa) return;
        valor.value = '';
        bloqueada = false;
        campos.disabled = salvar.disabled = false;
        alteracaoPendente(false);
        status.textContent = 'Contato adicionado.';
      })
      .catch((erro: unknown) => {
        if (!ativa) return;
        if (resultadoIncerto(erro)) {
          campos.disabled = false;
          tipo.disabled = true;
          valor.readOnly = true;
          status.textContent =
            'Não foi possível confirmar se o contato foi adicionado. Copie os dados se necessário, feche esta tela e confira o cadastro antes de tentar novamente.';
          return;
        }
        if (exigeNovoAcesso(erro)) {
          acessoPerdido(erro);
          return;
        }
        bloqueada = false;
        campos.disabled = salvar.disabled = false;
        status.textContent = mensagemFalha(erro);
      });
  });
  raiz.replaceChildren(form);
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
