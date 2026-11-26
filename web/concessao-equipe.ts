import { iniciarAcao } from './esqueleto.js';
import { criarConcessaoEquipeSchema } from '../packages/contracts/src/index.js';
import type { ClienteFFCM } from './api.js';
import { criarCicloConcessaoEquipe } from './ciclo-concessao-equipe.js';
import { confirmar } from './confirmacao.js';

// Preparação isolada: não montar até existir capacidade e recuperação entre sessões comprovadas.
export function montarConcessaoEquipe(raiz: HTMLElement, api: ClienteFFCM): () => void {
  let ativa = true;
  let ocupada = false;
  let liberada = false;
  const ciclo = criarCicloConcessaoEquipe({
    identidadeAtual: () => api.identidadeAtual(),
    consultar: () => api.consultarBarreiraEquipe(),
    reservar: async (entrada) => (await api.reservarBarreiraEquipe(entrada)).estado,
    criar: ({ entrada, chave, reserva_id, geracao_reserva }) =>
      api.criarConcessaoEquipe(entrada, chave, { reserva_id, geracao_reserva }),
    encerrar: async (entrada) => (await api.encerrarBarreiraEquipe(entrada)).estado,
    reconhecer: async (entrada) => (await api.reconhecerBarreiraEquipe(entrada)).estado,
  });
  const formulario = document.createElement('form');
  const campos = document.createElement('fieldset');
  const email = document.createElement('input');
  email.type = 'email';
  email.required = true;
  email.maxLength = 254;
  const perfil = document.createElement('select');
  for (const [valor, texto] of [
    ['profissional', 'Profissional'],
    ['administrador', 'Administrador'],
  ] as const) {
    const opcao = document.createElement('option');
    opcao.value = valor;
    opcao.textContent = texto;
    perfil.append(opcao);
  }
  const motivo = document.createElement('textarea');
  motivo.required = true;
  motivo.maxLength = 4000;
  for (const [texto, controle] of [
    ['E-mail', email],
    ['Perfil', perfil],
    ['Motivo', motivo],
  ] as const) {
    const rotulo = document.createElement('label');
    rotulo.textContent = texto;
    rotulo.append(controle);
    campos.append(rotulo);
  }
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const enviar = document.createElement('button');
  enviar.type = 'submit';
  enviar.className = 'button-primary';
  enviar.textContent = 'Pré-conceder acesso';
  const verificar = document.createElement('button');
  verificar.type = 'button';
  verificar.className = 'button-secondary';
  verificar.textContent = 'Conferir novamente';
  campos.disabled = enviar.disabled = true;
  campos.append(enviar);
  formulario.append(campos, verificar, status);
  const legenda = document.createElement('legend');
  legenda.textContent = 'Convidar alguém da equipe';
  campos.prepend(legenda);

  // A área da equipe mostrava só o formulário de convite: não havia como ver quem já
  // tem acesso sem abrir outra tela. A listagem já existia no serviço e era consultada
  // só por dentro, para conferir um convite; aqui ela aparece.
  const titulo = document.createElement('h2');
  titulo.textContent = 'Equipe';
  const listaStatus = document.createElement('p');
  listaStatus.className = 'visao-estado';
  listaStatus.setAttribute('role', 'status');
  listaStatus.setAttribute('aria-live', 'polite');
  const lista = document.createElement('ul');
  lista.className = 'lista-registros';
  lista.setAttribute('aria-label', 'Pessoas com acesso concedido');
  const atualizarLista = document.createElement('button');
  atualizarLista.type = 'button';
  atualizarLista.className = 'button-secondary';
  atualizarLista.textContent = 'Atualizar lista';
  const maisLista = document.createElement('button');
  maisLista.type = 'button';
  maisLista.className = 'button-secondary';
  maisLista.textContent = 'Carregar mais';
  maisLista.hidden = true;
  raiz.replaceChildren(titulo, atualizarLista, listaStatus, lista, maisLista, formulario);

  const perfisEquipe = { profissional: 'Profissional', administrador: 'Administrador' };
  const estadosEquipe = {
    pendente: 'Convite pendente',
    vinculada: 'Acesso ativo',
    revogada: 'Acesso revogado',
  };
  type ItemEquipe = Awaited<ReturnType<ClienteFFCM['listarProfissionais']>>['itens'][number];

  function linhaEquipe(item: ItemEquipe): HTMLLIElement {
    const linha = document.createElement('li');
    linha.className = 'lista-registros__linha';
    const principal = document.createElement('span');
    principal.className = 'lista-registros__principal';
    principal.textContent = item.email;
    const papel = document.createElement('span');
    papel.className = 'lista-registros__secundario';
    papel.textContent = perfisEquipe[item.perfil];
    const estado = document.createElement('span');
    estado.className = 'lista-registros__marca';
    estado.dataset.estado = item.estado;
    estado.textContent = estadosEquipe[item.estado];
    linha.append(principal, papel);
    if (item.ativo === false) {
      const conta = document.createElement('span');
      conta.className = 'lista-registros__secundario';
      conta.textContent = 'Conta desativada';
      linha.append(conta);
    }
    // A marca de estado fecha a linha: entra depois do que for opcional para ficar
    // sempre na mesma coluna, em todas as linhas.
    linha.append(estado);
    return linha;
  }

  let cursorLista: string | undefined;
  let consultandoLista = false;

  async function carregarLista(continuar = false): Promise<void> {
    if (consultandoLista) return;
    consultandoLista = true;
    atualizarLista.disabled = maisLista.disabled = true;
    if (!continuar) {
      cursorLista = undefined;
      lista.replaceChildren();
    }
    lista.setAttribute('aria-busy', 'true');
    listaStatus.textContent = 'Carregando a equipe…';
    listaStatus.removeAttribute('data-tone');
    try {
      const pagina = await api.listarProfissionais(continuar ? cursorLista : undefined);
      if (!ativa) return;
      for (const item of pagina.itens) lista.append(linhaEquipe(item));
      cursorLista = pagina.proximo_cursor ?? undefined;
      maisLista.hidden = !cursorLista;
      listaStatus.textContent = lista.childElementCount
        ? `${lista.childElementCount} pessoas com acesso concedido.`
        : 'Nenhum acesso concedido ainda. Convide alguém da equipe abaixo.';
    } catch {
      if (!ativa) return;
      listaStatus.dataset.tone = 'error';
      listaStatus.textContent = 'Não foi possível carregar a equipe. Tente atualizar a lista.';
    } finally {
      lista.removeAttribute('aria-busy');
      consultandoLista = false;
      if (ativa) atualizarLista.disabled = maisLista.disabled = false;
    }
  }

  atualizarLista.addEventListener('click', () => void carregarLista());
  maisLista.addEventListener('click', () => void carregarLista(true));
  const recuperar = async () => {
    if (ocupada) return;
    ocupada = true;
    liberada = false;
    campos.disabled = enviar.disabled = verificar.disabled = true;
    status.textContent = 'Conferindo se há algum convite aguardando resposta…';
    const finalizar = iniciarAcao(verificar);
    try {
      let estado = await ciclo.consultar();
      if (!ativa) return;
      if (!estado.resultado_pendente) {
        if (
          estado.reserva &&
          !(await confirmar({
            titulo: 'Encerrar a operação em andamento?',
            detalhe:
              'A operação pode estar aberta em outra aba. Encerrá-la afeta todas as abas desta pessoa.',
            acao: 'Encerrar a operação',
            cancelar: 'Deixar como está',
          }))
        )
          throw new Error();
        await ciclo.encerrar();
        estado = await ciclo.consultar();
        if (!ativa) return;
      }
      if (estado.resultado_pendente) {
        const resultado = estado.resultado_pendente;
        if (resultado.resultado === 'confirmada') {
          let cursor: string | undefined;
          const vistos = new Set<string>();
          let encontrada:
            | Awaited<ReturnType<ClienteFFCM['listarProfissionais']>>['itens'][number]
            | undefined;
          do {
            const pagina = await api.listarProfissionais(cursor);
            if (!ativa) return;
            encontrada = pagina.itens.find(
              (item) => item.id.toLowerCase() === resultado.concessao_id?.toLowerCase(),
            );
            cursor = pagina.proximo_cursor ?? undefined;
            if (cursor && vistos.has(cursor)) throw new Error();
            if (cursor) vistos.add(cursor);
          } while (!encontrada && cursor);
          if (
            !encontrada ||
            !(await confirmar({
              titulo: `O convite enviado antes para ${encontrada.email} está ${encontrada.estado}, como ${encontrada.perfil}. Confere?`,
              detalhe:
                'Confirmar encerra a conferência e libera novos convites. Cancelar mantém a tela conferindo.',
              acao: 'Confere, pode seguir',
              cancelar: 'Não confere',
            }))
          )
            throw new Error();
        }
        await ciclo.reconhecer();
        estado = await ciclo.consultar();
        if (!ativa) return;
      }
      ciclo.liberar();
      liberada = true;
      campos.disabled = enviar.disabled = false;
      status.textContent = 'Tudo conferido. Você já pode convidar alguém da equipe.';
    } catch {
      if (ativa)
        status.textContent =
          'Não foi possível concluir a conferência. Tente de novo antes de continuar.';
    } finally {
      finalizar();
      ocupada = false;
      if (ativa) verificar.disabled = false;
    }
  };
  verificar.addEventListener('click', () => void recuperar());
  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (!liberada || ocupada) return;
    const validacao = criarConcessaoEquipeSchema.safeParse({
      email: email.value,
      perfil: perfil.value,
      metodo: 'google_workspace',
      motivo: motivo.value,
    });
    if (!validacao.success) {
      status.textContent = 'Confira e-mail, perfil e motivo.';
      return;
    }
    ocupada = true;
    liberada = false;
    campos.disabled = enviar.disabled = verificar.disabled = true;
    status.textContent = 'Enviando…';
    const finalizar = iniciarAcao(enviar);
    void ciclo
      .criar(validacao.data)
      .then((resultado) => {
        if (!ativa) return;
        formulario.reset();
        const estados = { pendente: 'Pendente', vinculada: 'Vinculada', revogada: 'Revogada' };
        const perfis = { profissional: 'Profissional', administrador: 'Administrador' };
        status.textContent = `Convite ${estados[resultado.estado].toLocaleLowerCase('pt-BR')} para ${perfis[resultado.perfil].toLocaleLowerCase('pt-BR')}. Confira antes de continuar.`;
      })
      .catch(() => {
        if (ativa)
          status.textContent =
            'Não deu para saber se o convite foi registrado. Confira antes de continuar.';
      })
      .finally(() => {
        finalizar();
        ocupada = false;
        if (ativa) verificar.disabled = false;
      });
  });
  void recuperar();
  void carregarLista();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
