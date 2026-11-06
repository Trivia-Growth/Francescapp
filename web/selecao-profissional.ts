import { type ClienteFFCM, mensagemFalha } from './api.js';
import { criarCicloAcesso } from './ciclo-acesso.js';

export function montarSelecaoProfissional(
  raiz: HTMLElement,
  pacienteId: string,
  api: ClienteFFCM,
  acessoPerdido: (erro: unknown) => boolean,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let ativa = true;
  let consulta = 0;
  let cursores: (string | undefined)[] = [undefined];
  let pagina = 0;
  let proximo: string | null = null;
  const status = document.createElement('p');
  status.className = 'feedback';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const rotulo = document.createElement('label');
  rotulo.htmlFor = 'profissional-selecionado';
  rotulo.textContent = 'Profissional';
  const selecao = document.createElement('select');
  selecao.id = rotulo.htmlFor;
  const anterior = document.createElement('button');
  anterior.type = 'button';
  anterior.className = 'button-secondary';
  anterior.textContent = 'Página anterior';
  const seguinte = document.createElement('button');
  seguinte.type = 'button';
  seguinte.className = 'button-secondary';
  seguinte.textContent = 'Próxima página';
  const tentar = document.createElement('button');
  tentar.type = 'button';
  tentar.className = 'button-secondary';
  tentar.textContent = 'Tentar novamente';
  const explicacao = document.createElement('p');
  explicacao.textContent = 'Verifique operações anteriores antes de conceder acesso.';
  const rotuloMotivo = document.createElement('label');
  rotuloMotivo.textContent = 'Motivo da concessão';
  const motivo = document.createElement('textarea');
  motivo.required = true;
  motivo.maxLength = 4000;
  motivo.addEventListener('input', () => alteracaoPendente(motivo.value.trim().length > 0));
  rotuloMotivo.append(motivo);
  const recuperar = document.createElement('button');
  recuperar.type = 'button';
  recuperar.textContent = 'Verificar operação pendente';
  const conceder = document.createElement('button');
  conceder.type = 'button';
  conceder.className = 'button-primary';
  conceder.textContent = 'Conceder acesso';
  conceder.disabled = true;
  raiz.replaceChildren(
    status,
    rotulo,
    selecao,
    anterior,
    seguinte,
    tentar,
    rotuloMotivo,
    explicacao,
    conceder,
    recuperar,
  );

  const ciclo = criarCicloAcesso({
    identidadeAtual: () => api.identidadeAtual(),
    consultar: () => api.consultarBarreiraAcesso(),
    reservar: async (entrada) => (await api.reservarBarreiraAcesso(entrada)).estado,
    criar: ({ entrada, paciente_id, chave, reserva_id, geracao_reserva }) =>
      api.criarAcessoPaciente(paciente_id, entrada, chave, { reserva_id, geracao_reserva }),
    encerrar: async (entrada) => (await api.encerrarBarreiraAcesso(entrada)).estado,
    reconhecer: async (entrada) => (await api.reconhecerBarreiraAcesso(entrada)).estado,
  });
  let liberado = false;
  let verificando = false;
  const verificarPendente = async () => {
    if (verificando) return;
    verificando = true;
    liberado = false;
    conceder.disabled = recuperar.disabled = true;
    try {
      let estado = await ciclo.consultar();
      if (!ativa) return;
      if (!estado.resultado_pendente) {
        if (
          estado.reserva &&
          !window.confirm(
            'Há uma tentativa em andamento que pode estar em outra aba. Encerrá-la afetará todas as abas. Deseja continuar?',
          )
        )
          throw new Error('Encerramento não confirmado');
        await ciclo.encerrar();
        if (!ativa) return;
        estado = await ciclo.consultar();
        if (!ativa) return;
      }
      if (estado.resultado_pendente) {
        const pendente = estado.resultado_pendente;
        if (pendente.resultado === 'confirmada') {
          if (pendente.paciente_id.toLowerCase() !== pacienteId.toLowerCase())
            throw new Error('Outro paciente');
          let cursor: string | undefined;
          let encontrado: { usuario_id: string; revogado: boolean } | undefined;
          const vistos = new Set<string>();
          do {
            const pagina = await api.listarVinculosProfissionais(pacienteId, cursor);
            if (!ativa) return;
            encontrado ??= pagina.itens.find(
              (item) => item.id.toLowerCase() === pendente.acesso_id.toLowerCase(),
            );
            cursor = pagina.proximo_cursor ?? undefined;
            if (cursor && vistos.has(cursor)) throw new Error('Cursor repetido');
            if (cursor) vistos.add(cursor);
          } while (!encontrado && cursor);
          const nome = encontrado && nomesProfissionais.get(encontrado.usuario_id.toLowerCase());
          if (
            !encontrado ||
            !nome ||
            !window.confirm(
              `Concessão anterior para ${nome}: ${encontrado.revogado ? 'revogada' : 'ativa'}. Confirmar verificação?`,
            )
          )
            throw new Error('Confirmação necessária');
        }
        await ciclo.reconhecer();
        if (!ativa) return;
        await ciclo.consultar();
        if (!ativa) return;
      }
      ciclo.liberar();
      if (!ativa) return;
      liberado = true;
      explicacao.textContent = 'Operações anteriores verificadas.';
      conceder.disabled = !selecao.value;
    } catch (erro) {
      if (!ativa || acessoPerdido(erro)) return;
      explicacao.textContent =
        'Não foi possível confirmar a operação anterior. Consulte o paciente correspondente e tente novamente.';
    } finally {
      verificando = false;
      if (ativa) recuperar.disabled = false;
    }
  };
  recuperar.addEventListener('click', () => void verificarPendente());
  selecao.addEventListener('change', () => {
    conceder.disabled = !liberado || !selecao.value;
  });
  conceder.addEventListener('click', () => {
    if (!liberado || !selecao.value || !motivo.value.trim()) return;
    liberado = false;
    conceder.disabled = true;
    const usuario = selecao.value;
    const razao = motivo.value;
    void ciclo
      .criar(pacienteId, { usuario_id: usuario, motivo: razao })
      .then(() => {
        if (!ativa) return;
        if (motivo.value === razao) {
          motivo.value = '';
          alteracaoPendente(false);
        }
        explicacao.textContent = 'Concessão enviada. Verifique o resultado antes de continuar.';
      })
      .catch((erro) => {
        if (ativa && !acessoPerdido(erro))
          explicacao.textContent =
            'Resultado incerto. Verifique a operação antes de tentar novamente.';
      });
  });
  void verificarPendente();

  const vinculos = document.createElement('section');
  const tituloVinculos = document.createElement('h3');
  tituloVinculos.textContent = 'Vínculos profissionais';
  const estadoVinculos = document.createElement('p');
  estadoVinculos.setAttribute('role', 'status');
  const listaVinculos = document.createElement('ul');
  const maisVinculos = document.createElement('button');
  maisVinculos.type = 'button';
  maisVinculos.className = 'button-secondary';
  maisVinculos.textContent = 'Carregar mais vínculos';
  maisVinculos.hidden = true;
  const tentarVinculos = document.createElement('button');
  tentarVinculos.type = 'button';
  tentarVinculos.className = 'button-secondary';
  tentarVinculos.textContent = 'Tentar consultar vínculos novamente';
  tentarVinculos.hidden = true;
  vinculos.append(tituloVinculos, estadoVinculos, listaVinculos, maisVinculos, tentarVinculos);
  raiz.prepend(vinculos);
  const nomesProfissionais = new Map<string, string>();
  const vinculosExibidos: {
    linha: HTMLLIElement;
    usuarioId: string;
    revogado: boolean;
    versao: number;
  }[] = [];
  const atualizarIdentificacoes = () => {
    for (const item of vinculosExibidos) {
      const nome =
        nomesProfissionais.get(item.usuarioId.toLowerCase()) ??
        'Identificação indisponível nesta página';
      item.linha.textContent = `${nome} · ${item.revogado ? 'Revogado' : 'Ativo'} · versão ${item.versao}`;
    }
  };
  let cursorVinculos: string | undefined;
  let consultandoVinculos = false;
  async function carregarVinculos(): Promise<void> {
    if (consultandoVinculos) return;
    consultandoVinculos = true;
    maisVinculos.disabled = tentarVinculos.disabled = true;
    estadoVinculos.textContent = 'Consultando vínculos…';
    try {
      const paginaAtual = await api.listarVinculosProfissionais(pacienteId, cursorVinculos);
      if (!ativa) return;
      for (const item of paginaAtual.itens) {
        const linha = document.createElement('li');
        vinculosExibidos.push({
          linha,
          usuarioId: item.usuario_id,
          revogado: item.revogado,
          versao: item.versao,
        });
        listaVinculos.append(linha);
      }
      atualizarIdentificacoes();
      cursorVinculos = paginaAtual.proximo_cursor ?? undefined;
      maisVinculos.hidden = !cursorVinculos;
      tentarVinculos.hidden = true;
      estadoVinculos.textContent = listaVinculos.children.length
        ? 'Vínculos consultados.'
        : 'Nenhum vínculo profissional encontrado.';
    } catch (erro) {
      if (!ativa || acessoPerdido(erro)) return;
      estadoVinculos.textContent = mensagemFalha(erro);
      tentarVinculos.hidden = false;
    } finally {
      consultandoVinculos = false;
      maisVinculos.disabled = tentarVinculos.disabled = false;
    }
  }
  maisVinculos.addEventListener('click', () => void carregarVinculos());
  tentarVinculos.addEventListener('click', () => void carregarVinculos());
  void carregarVinculos();

  async function carregar(): Promise<void> {
    const atual = ++consulta;
    status.textContent = 'Consultando equipe…';
    selecao.disabled = anterior.disabled = seguinte.disabled = true;
    tentar.hidden = true;
    selecao.replaceChildren();
    try {
      const resultado = await api.listarProfissionais(cursores[pagina]);
      if (!ativa || atual !== consulta) return;
      proximo = resultado.proximo_cursor;
      const profissionais = resultado.itens.filter(
        (item) =>
          item.perfil === 'profissional' &&
          item.estado === 'vinculada' &&
          item.ativo === true &&
          item.usuario_id !== null,
      );
      for (const profissional of resultado.itens) {
        if (profissional.perfil === 'profissional' && profissional.usuario_id)
          nomesProfissionais.set(profissional.usuario_id.toLowerCase(), profissional.email);
      }
      atualizarIdentificacoes();
      const vazio = document.createElement('option');
      vazio.value = '';
      vazio.textContent = profissionais.length
        ? 'Selecione um profissional'
        : 'Nenhum profissional elegível nesta página';
      selecao.append(vazio);
      for (const profissional of profissionais) {
        const opcao = document.createElement('option');
        opcao.value = profissional.usuario_id ?? '';
        opcao.textContent = profissional.email;
        selecao.append(opcao);
      }
      selecao.disabled = profissionais.length === 0;
      anterior.disabled = pagina === 0;
      seguinte.disabled = !proximo;
      status.textContent = profissionais.length
        ? `Página ${pagina + 1}. Selecione um profissional.`
        : `Página ${pagina + 1}. Nenhum profissional elegível nesta página.`;
    } catch (erro) {
      if (!ativa || atual !== consulta || acessoPerdido(erro)) return;
      status.textContent = mensagemFalha(erro);
      tentar.hidden = false;
      anterior.disabled = pagina === 0;
    }
  }
  anterior.addEventListener('click', () => {
    if (pagina > 0) {
      pagina -= 1;
      void carregar();
    }
  });
  seguinte.addEventListener('click', () => {
    if (proximo) {
      cursores = cursores.slice(0, pagina + 1);
      cursores.push(proximo);
      pagina += 1;
      void carregar();
    }
  });
  tentar.addEventListener('click', () => void carregar());
  void carregar();
  return () => {
    ativa = false;
    consulta += 1;
    raiz.replaceChildren();
  };
}
