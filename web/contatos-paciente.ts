import { novoContatoSchema, type PacienteAdministrativo } from '../packages/contracts/src/index.js';
import { exigeNovoAcesso, FalhaApi, mensagemFalha, type ClienteFFCM } from './api.js';
import { criarCicloContato } from './ciclo-contato.js';
import { esqueletoCarregando } from './esqueleto.js';
import type { consultaBarreiraContatoSchema } from '../packages/contracts/src/barreira-contato.js';

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
  const identidadeAtual = api.identidadeAtual();
  if (!identidadeAtual) throw new FalhaApi('nao_autenticado', 401);
  const identidade = { ...identidadeAtual };
  const ciclo = criarCicloContato({
    identidadeAtual: () => api.identidadeAtual(),
    consultar: () => api.consultarBarreiraContato(),
    reservar: async (entrada) => (await api.reservarBarreiraContato(entrada)).estado,
    criar: ({ entrada, paciente_id, chave, reserva_id, geracao_reserva }) =>
      api.criarContato(paciente_id, entrada, chave, { reserva_id, geracao_reserva }),
    encerrar: async (entrada) => (await api.encerrarBarreiraContato(entrada)).estado,
    reconhecer: async (entrada) => (await api.reconhecerBarreiraContato(entrada)).estado,
  });
  const lista = document.createElement('section');
  const tituloLista = document.createElement('h3');
  tituloLista.textContent = 'Contatos cadastrados';
  const conteudoLista = document.createElement('div');
  conteudoLista.replaceChildren(esqueletoCarregando(2, true));
  lista.append(tituloLista, conteudoLista);
  let contatosAtualizados = false;
  let identidadeInvalidada = false;
  const verificarIdentidade = () => {
    let atual: ReturnType<ClienteFFCM['identidadeAtual']> = null;
    try {
      atual = api.identidadeAtual();
    } catch {
      // Falha ao consultar identidade não comprova sessão vigente.
    }
    if (
      identidadeInvalidada ||
      !atual ||
      atual.usuario_id.toLowerCase() !== identidade.usuario_id.toLowerCase() ||
      atual.session_id.toLowerCase() !== identidade.session_id.toLowerCase()
    ) {
      identidadeInvalidada = true;
      contatosAtualizados = false;
      conteudoLista.replaceChildren();
      valor.value = '';
      bloqueada = true;
      campos.disabled = salvar.disabled = true;
      throw new FalhaApi('nao_autenticado', 401);
    }
  };
  const mostrarContatos = (paciente: PacienteAdministrativo) => {
    verificarIdentidade();
    if (paciente.id.toLowerCase() !== pacienteId.toLowerCase())
      throw new Error('Paciente divergente');
    if (!ativa) return;
    if (paciente.contatos.length === 0) {
      conteudoLista.textContent = 'Nenhum contato cadastrado.';
    } else {
      const itens = document.createElement('ul');
      for (const contato of paciente.contatos) {
        const item = document.createElement('li');
        item.textContent = `${contato.tipo === 'email' ? 'E-mail' : 'Telefone'}: ${contato.valor}`;
        itens.append(item);
      }
      conteudoLista.replaceChildren(itens);
    }
    contatosAtualizados = true;
  };
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
  recuperar.textContent = 'Conferir novamente';
  recuperar.hidden = true;
  campos.disabled = salvar.disabled = true;
  let etapa: 'encerrar' | 'reconhecer' | null = null;
  let contatoConfirmado = false;
  let resultadoPendente: ReturnType<
    typeof consultaBarreiraContatoSchema.parse
  >['resultado_pendente'] = null;
  const conferirResultado = async () => {
    if (!resultadoPendente) throw new Error('Resultado indisponível');
    if (resultadoPendente.paciente_id.toLowerCase() !== pacienteId.toLowerCase()) {
      throw new Error('Outro paciente');
    }
    if (resultadoPendente.resultado === 'confirmada') {
      verificarIdentidade();
      const paciente = await api.consultarPaciente(pacienteId);
      if (!ativa) throw new Error('Tela encerrada');
      mostrarContatos(paciente);
      const contato = paciente.contatos.find(
        (item) => item.id.toLowerCase() === resultadoPendente?.contato_id?.toLowerCase(),
      );
      if (
        !contato ||
        !window.confirm(
          `Este contato foi adicionado antes — ${contato.tipo === 'email' ? 'e-mail' : 'telefone'}: ${contato.valor}. Confere?`,
        )
      )
        throw new Error('Conferência necessária');
      contatoConfirmado = true;
    }
  };
  const reconciliar = async () => {
    bloqueada = true;
    campos.disabled = salvar.disabled = recuperar.disabled = true;
    status.textContent = 'Conferindo os contatos…';
    try {
      if (!etapa) {
        const estado = await ciclo.consultar();
        resultadoPendente = estado.resultado_pendente;
        etapa = resultadoPendente ? 'reconhecer' : 'encerrar';
        if (
          estado.reserva &&
          !window.confirm(
            'Há uma tentativa em andamento que pode estar em outra aba. Encerrá-la afetará todas as abas. Deseja continuar?',
          )
        ) {
          etapa = null;
          throw new Error('Encerramento não confirmado');
        }
      }
      if (etapa === 'reconhecer') {
        await conferirResultado();
        await ciclo.reconhecer();
        resultadoPendente = null;
      } else await ciclo.encerrar();
      etapa = null;
      const atualizado = await ciclo.consultar();
      if (atualizado.resultado_pendente) {
        resultadoPendente = atualizado.resultado_pendente;
        etapa = 'reconhecer';
        await conferirResultado();
        await ciclo.reconhecer();
        resultadoPendente = null;
        etapa = null;
        await ciclo.consultar();
      }
      if (!contatosAtualizados) {
        verificarIdentidade();
        mostrarContatos(await api.consultarPaciente(pacienteId));
      }
      ciclo.liberar();
      if (!ativa) return;
      bloqueada = false;
      campos.disabled = salvar.disabled = false;
      recuperar.hidden = true;
      status.textContent = contatoConfirmado
        ? 'O contato enviado antes foi adicionado. Confira a lista antes de adicionar outro.'
        : 'Tudo conferido. Você já pode adicionar um contato.';
      contatoConfirmado = false;
    } catch (erro) {
      if (!ativa) return;
      try {
        verificarIdentidade();
      } catch (identidadeErro) {
        acessoPerdido(identidadeErro);
        return;
      }
      if (exigeNovoAcesso(erro)) {
        conteudoLista.replaceChildren();
        acessoPerdido(erro);
      }
      if (!contatosAtualizados)
        conteudoLista.textContent = 'Não foi possível carregar os contatos.';
      recuperar.hidden = false;
      status.textContent =
        'Não foi possível concluir a conferência. Se o envio foi de outro paciente, abra o cadastro dele antes de continuar.';
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
    contatosAtualizados = false;
    conteudoLista.textContent = 'Atualizando contatos…';
    campos.disabled = salvar.disabled = true;
    alteracaoPendente(true);
    status.textContent = 'Adicionando contato…';
    void ciclo
      .criar(pacienteId, entrada.data)
      .then((paciente) => {
        if (!ativa) return;
        mostrarContatos(paciente);
        valor.value = '';
        alteracaoPendente(false);
        void reconciliar();
      })
      .catch((erro: unknown) => {
        if (!ativa) return;
        try {
          verificarIdentidade();
        } catch (identidadeErro) {
          acessoPerdido(identidadeErro);
          return;
        }
        if (exigeNovoAcesso(erro)) {
          conteudoLista.replaceChildren();
          acessoPerdido(erro);
          return;
        }
        status.textContent = mensagemFalha(erro);
        recuperar.hidden = false;
      });
  });
  raiz.replaceChildren(lista, form);
  void reconciliar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
