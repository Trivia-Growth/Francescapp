import { type ClienteFFCM, mensagemFalha } from './api.js';

/** Consulta somente; a concessão permanece indisponível até haver reconciliação segura. */
export function montarSelecaoProfissional(
  raiz: HTMLElement,
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
