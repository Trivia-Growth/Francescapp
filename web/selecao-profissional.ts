import { type ClienteFFCM, mensagemFalha } from './api.js';
import { criarCicloAcesso } from './ciclo-acesso.js';
import { montarRevogacaoVinculo } from './revogacao-vinculo.js';

export function montarSelecaoProfissional(
  raiz: HTMLElement,
  pacienteId: string,
  api: ClienteFFCM,
  acessoPerdido: (erro: unknown) => boolean,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let ativa = true;
  let pendenciaConcessao = false;
  let pendenciaRevogacao = false;
  const informarPendencia = () => alteracaoPendente(pendenciaConcessao || pendenciaRevogacao);
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
  // Paginação só aparece quando há mais de uma página: botões soltos sobre lista
  // vazia davam a impressão de tela quebrada.
  anterior.hidden = seguinte.hidden = true;
  const tentar = document.createElement('button');
  tentar.type = 'button';
  tentar.className = 'button-secondary';
  tentar.textContent = 'Tentar novamente';
  const explicacao = document.createElement('p');
  explicacao.textContent = 'Conferindo se há alguma concessão aguardando resposta…';
  const rotuloMotivo = document.createElement('label');
  rotuloMotivo.textContent = 'Motivo da concessão';
  const motivo = document.createElement('textarea');
  motivo.required = true;
  motivo.maxLength = 4000;
  motivo.addEventListener('input', () => {
    pendenciaConcessao = motivo.value.trim().length > 0;
    informarPendencia();
  });
  rotuloMotivo.append(motivo);
  const recuperar = document.createElement('button');
  recuperar.type = 'button';
  recuperar.textContent = 'Conferir novamente';
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
    revogar: ({ paciente_id, acesso_id, entrada, chave, reserva_id, geracao_reserva }) =>
      api.revogarAcessoPaciente(paciente_id, acesso_id, entrada, chave, {
        reserva_id,
        geracao_reserva,
      }),
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
          await identificarProfissionais();
          if (!ativa) return;
          const nome = encontrado && nomesProfissionais.get(encontrado.usuario_id.toLowerCase());
          if (
            !encontrado ||
            !nome ||
            !window.confirm(
              `${pendente.acao === 'revogar' ? 'Revogação' : 'Concessão'} anterior para ${nome}: ${encontrado.revogado ? 'revogada' : 'ativa'}. Confirmar verificação?`,
            )
          )
            throw new Error('Confirmação necessária');
        }
        await ciclo.reconhecer();
        if (!ativa) return;
        await ciclo.consultar();
        if (!ativa) return;
      }
      await atualizarVinculos();
      if (!ativa) return;
      ciclo.liberar();
      if (!ativa) return;
      liberado = true;
      revogacao.reconciliar();
      explicacao.textContent = 'Tudo conferido. Você já pode conceder acesso.';
      conceder.disabled = !selecao.value;
    } catch (erro) {
      if (!ativa || acessoPerdido(erro)) return;
      explicacao.textContent =
        'Não foi possível concluir a conferência. Confira o paciente correspondente e tente de novo.';
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
          pendenciaConcessao = false;
          informarPendencia();
        }
        explicacao.textContent = 'Concessão enviada. Confira o resultado antes de continuar.';
        void atualizarVinculos().catch(() => {});
      })
      .catch((erro) => {
        if (ativa && !acessoPerdido(erro))
          explicacao.textContent =
            'Não deu para saber se a concessão foi registrada. Confira antes de tentar de novo.';
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
  const areaRevogacao = document.createElement('section');
  const avisoRevogacao = document.createElement('p');
  avisoRevogacao.textContent = 'Conclua a conferência acima antes de alterar vínculos.';
  vinculos.append(avisoRevogacao);
  raiz.prepend(vinculos);
  raiz.append(areaRevogacao);
  const nomesProfissionais = new Map<string, string>();
  let identificacoesCompletas = false;
  let geracaoIdentificacoes = 0;
  let consultaIdentificacoes: Promise<void> | undefined;
  async function identificarProfissionais(): Promise<void> {
    if (identificacoesCompletas || !ativa) return;
    if (consultaIdentificacoes) return consultaIdentificacoes;
    const geracao = geracaoIdentificacoes;
    const executar = async () => {
      const nomes = new Map<string, string[]>();
      const vistos = new Set<string>();
      let cursor: string | undefined;
      do {
        const pagina = await api.listarProfissionais(cursor);
        if (!ativa) return;
        for (const item of pagina.itens) {
          if (item.perfil !== 'profissional' || !item.usuario_id) continue;
          const id = item.usuario_id.toLowerCase();
          const emails = nomes.get(id) ?? [];
          emails.push(item.email);
          nomes.set(id, emails);
        }
        cursor = pagina.proximo_cursor ?? undefined;
        if (cursor && vistos.has(cursor)) throw new Error('Cursor repetido');
        if (cursor) vistos.add(cursor);
      } while (cursor);
      if (geracao !== geracaoIdentificacoes) return;
      nomesProfissionais.clear();
      for (const [id, emails] of nomes) {
        const email = emails[0];
        if (emails.length === 1 && email) nomesProfissionais.set(id, email);
      }
      identificacoesCompletas = true;
      atualizarIdentificacoes();
    };
    const pendente = executar();
    consultaIdentificacoes = pendente;
    try {
      await pendente;
    } finally {
      if (consultaIdentificacoes === pendente) consultaIdentificacoes = undefined;
    }
  }
  const vinculosExibidos: {
    linha: HTMLLIElement;
    texto: HTMLSpanElement;
    botao: HTMLButtonElement | null;
    id: string;
    usuarioId: string;
    revogado: boolean;
    versao: number;
  }[] = [];
  const atualizarIdentificacoes = () => {
    for (const item of vinculosExibidos) {
      const nome =
        nomesProfissionais.get(item.usuarioId.toLowerCase()) ??
        'Identificação indisponível nesta página';
      item.texto.textContent = `${nome} · ${item.revogado ? 'Revogado' : 'Ativo'} · versão ${item.versao}`;
      if (item.botao) item.botao.disabled = !nomesProfissionais.has(item.usuarioId.toLowerCase());
    }
  };
  let cursorVinculos: string | undefined;
  let consultaVinculos: Promise<boolean> | undefined;
  let atualizacaoPendente = false;
  let geracaoAtualizacao = 0;
  async function atualizarVinculos(): Promise<void> {
    revogacao.invalidarSelecao();
    atualizacaoPendente = true;
    geracaoAtualizacao++;
    geracaoIdentificacoes++;
    identificacoesCompletas = false;
    nomesProfissionais.clear();
    atualizarIdentificacoes();
    if (consultaIdentificacoes) await consultaIdentificacoes.catch(() => {});
    if (consultaVinculos) await consultaVinculos;
    if (!ativa) return;
    if (!(await carregarVinculos())) throw new Error('Consulta de vínculos indisponível');
  }
  const revogacao = montarRevogacaoVinculo(
    areaRevogacao,
    async (acessoId, dados) => {
      if (!liberado) throw new Error('Acesso bloqueado');
      liberado = false;
      conceder.disabled = true;
      return ciclo.revogar(pacienteId, acessoId, dados);
    },
    atualizarVinculos,
    acessoPerdido,
    (pendente) => {
      pendenciaRevogacao = pendente;
      informarPendencia();
    },
  );
  function carregarVinculos(): Promise<boolean> {
    if (consultaVinculos) return consultaVinculos;
    const executar = async (): Promise<boolean> => {
      maisVinculos.disabled = tentarVinculos.disabled = true;
      estadoVinculos.textContent = 'Consultando vínculos…';
      const reiniciar = atualizacaoPendente;
      const geracao = geracaoAtualizacao;
      try {
        const paginaAtual = await api.listarVinculosProfissionais(
          pacienteId,
          reiniciar ? undefined : cursorVinculos,
        );
        if (!ativa) return false;
        if (reiniciar) {
          if (geracao === geracaoAtualizacao) atualizacaoPendente = false;
          listaVinculos.replaceChildren();
          vinculosExibidos.length = 0;
        }
        for (const item of paginaAtual.itens) {
          const linha = document.createElement('li');
          const texto = document.createElement('span');
          linha.append(texto);
          const botao = item.revogado ? null : document.createElement('button');
          if (botao) {
            botao.type = 'button';
            botao.textContent = 'Selecionar para revogação';
            botao.disabled = true;
            botao.addEventListener('click', () => {
              const nome = nomesProfissionais.get(item.usuario_id.toLowerCase());
              if (nome && liberado)
                revogacao.selecionar({ id: item.id, versao: item.versao, nome });
            });
            linha.append(botao);
          }
          vinculosExibidos.push({
            linha,
            texto,
            botao,
            id: item.id,
            usuarioId: item.usuario_id,
            revogado: item.revogado,
            versao: item.versao,
          });
          listaVinculos.append(linha);
        }
        atualizarIdentificacoes();
        if (paginaAtual.itens.length)
          void identificarProfissionais().catch((erro) => {
            if (ativa && !acessoPerdido(erro))
              estadoVinculos.textContent =
                'Não foi possível identificar profissionais. Tente atualizar a lista.';
          });
        cursorVinculos = paginaAtual.proximo_cursor ?? undefined;
        maisVinculos.hidden = !cursorVinculos;
        tentarVinculos.hidden = true;
        estadoVinculos.textContent = listaVinculos.children.length
          ? 'Vínculos consultados.'
          : 'Nenhum vínculo profissional encontrado.';
        return true;
      } catch (erro) {
        if (ativa && !acessoPerdido(erro)) {
          estadoVinculos.textContent = mensagemFalha(erro);
          tentarVinculos.hidden = false;
        }
        return false;
      } finally {
        maisVinculos.disabled = tentarVinculos.disabled = false;
      }
    };
    const pendente = executar();
    consultaVinculos = pendente;
    void pendente.finally(() => {
      if (consultaVinculos === pendente) consultaVinculos = undefined;
    });
    return pendente;
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
      const vazio = document.createElement('option');
      vazio.value = '';
      const unicaPagina = pagina === 0 && !proximo;
      vazio.textContent = profissionais.length
        ? 'Selecione um profissional'
        : unicaPagina
          ? 'Nenhum profissional elegível'
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
      anterior.hidden = seguinte.hidden = unicaPagina;
      const paginaAtual = unicaPagina ? '' : `Página ${pagina + 1}. `;
      status.textContent = profissionais.length
        ? `${paginaAtual}Selecione o profissional que vai acompanhar o caso.`
        : `${paginaAtual}Nenhum profissional da equipe pode receber acesso agora.`;
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
    revogacao.destruir();
    raiz.replaceChildren();
  };
}
