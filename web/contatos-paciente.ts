import { novoContatoSchema } from '../packages/contracts/src/index.js';
import { exigeNovoAcesso, mensagemFalha, type ClienteFFCM } from './api.js';
import { criarCicloContato } from './ciclo-contato.js';

/** Montagem preparada para quando a rota de contatos estiver autorizada. */
export function montarContatoPaciente(
  raiz: HTMLElement,
  pacienteId: string,
  api: ClienteFFCM,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void,
): () => void {
  let ativa = true;
  let bloqueada = true;
  const ciclo = criarCicloContato({
    identidadeAtual: () => api.identidadeAtual(),
    consultar: () => api.consultarBarreiraContato(),
    reservar: async (entrada) => (await api.reservarBarreiraContato(entrada)).estado,
    criar: ({ entrada, paciente_id, chave, reserva_id, geracao_reserva }) =>
      api.criarContato(paciente_id, entrada, chave, { reserva_id, geracao_reserva }),
    encerrar: async (entrada) => (await api.encerrarBarreiraContato(entrada)).estado,
    reconhecer: async (entrada) => (await api.reconhecerBarreiraContato(entrada)).estado,
  });
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
  const recuperar = document.createElement('button');
  recuperar.type = 'button';
  recuperar.textContent = 'Verificar operação pendente';
  recuperar.hidden = true;
  campos.disabled = salvar.disabled = true;
  let etapa: 'encerrar' | 'reconhecer' | null = null;
  const reconciliar = async () => {
    bloqueada = true;
    campos.disabled = salvar.disabled = recuperar.disabled = true;
    status.textContent = 'Verificando operação pendente…';
    try {
      if (!etapa) {
        const estado = await ciclo.consultar();
        etapa = estado.resultado_pendente ? 'reconhecer' : 'encerrar';
      }
      if (etapa === 'reconhecer') await ciclo.reconhecer();
      else await ciclo.encerrar();
      etapa = null;
      await ciclo.consultar();
      ciclo.liberar();
      if (!ativa) return;
      bloqueada = false;
      campos.disabled = salvar.disabled = false;
      recuperar.hidden = true;
      status.textContent = 'Operações anteriores verificadas.';
    } catch (erro) {
      if (!ativa) return;
      if (exigeNovoAcesso(erro)) acessoPerdido(erro);
      recuperar.hidden = false;
      status.textContent =
        'Não foi possível verificar a operação. Tente novamente antes de adicionar contato.';
    } finally {
      if (ativa) recuperar.disabled = false;
    }
  };
  recuperar.addEventListener('click', () => void reconciliar());
  campos.append(legenda, labelTipo, labelValor);
  form.append(campos, salvar, recuperar, status);
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
    void ciclo
      .criar(pacienteId, entrada.data)
      .then(() => {
        if (!ativa) return;
        valor.value = '';
        alteracaoPendente(false);
        void reconciliar();
      })
      .catch((erro: unknown) => {
        if (!ativa) return;
        if (exigeNovoAcesso(erro)) {
          acessoPerdido(erro);
          return;
        }
        status.textContent = mensagemFalha(erro);
        recuperar.hidden = false;
      });
  });
  raiz.replaceChildren(form);
  void reconciliar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
