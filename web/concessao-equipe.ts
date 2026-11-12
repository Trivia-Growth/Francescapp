import { criarConcessaoEquipeSchema } from '../packages/contracts/src/index.js';
import type { ClienteFFCM } from './api.js';
import { criarCicloConcessaoEquipe } from './ciclo-concessao-equipe.js';

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
  enviar.textContent = 'Pré-conceder acesso';
  const verificar = document.createElement('button');
  verificar.type = 'button';
  verificar.textContent = 'Conferir novamente';
  campos.disabled = enviar.disabled = true;
  formulario.append(campos, enviar, verificar, status);
  raiz.replaceChildren(formulario);
  const recuperar = async () => {
    if (ocupada) return;
    ocupada = true;
    liberada = false;
    campos.disabled = enviar.disabled = verificar.disabled = true;
    status.textContent = 'Conferindo se há algum convite aguardando resposta…';
    try {
      let estado = await ciclo.consultar();
      if (!ativa) return;
      if (!estado.resultado_pendente) {
        if (
          estado.reserva &&
          !window.confirm(
            'Há uma operação em andamento, possivelmente em outra aba. Encerrá-la afetará todas as abas. Continuar?',
          )
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
            !window.confirm(
              `O convite enviado antes para ${encontrada.email} está ${encontrada.estado}, como ${encontrada.perfil}. Confere?`,
            )
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
        ocupada = false;
        if (ativa) verificar.disabled = false;
      });
  });
  void recuperar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
