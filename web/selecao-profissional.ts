import { type ClienteFFCM, mensagemFalha } from './api.js';

/** Consulta somente; a concessão permanece indisponível até haver reconciliação segura. */
export function montarSelecaoProfissional(
  raiz: HTMLElement,
  pacienteId: string,
  api: ClienteFFCM,
  acessoPerdido: (erro: unknown) => boolean,
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
  explicacao.textContent =
    'A concessão de acesso ainda não está disponível. Selecionar um profissional não cria vínculo nem concede acesso.';
  const conceder = document.createElement('button');
  conceder.type = 'button';
  conceder.className = 'button-primary';
  conceder.textContent = 'Conceder acesso';
  conceder.disabled = true;
  raiz.replaceChildren(status, rotulo, selecao, anterior, seguinte, tentar, explicacao, conceder);

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
