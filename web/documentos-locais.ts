export type DocumentoLocal = { nome: string; categoria: string; metadados?: string };

export type DadosDocumentosLocais = {
  documentos: DocumentoLocal[];
  aoRegistrar: (documento: DocumentoLocal) => Promise<void>;
};

/** Metadados fictícios; não armazena arquivos nem autoriza acesso. */
export function montarDocumentosLocais(raiz: HTMLElement, dados: DadosDocumentosLocais): void {
  raiz.replaceChildren();
  const formulario = document.createElement('form');
  const campo = (rotulo: string, obrigatorio: boolean) => {
    const label = document.createElement('label');
    label.textContent = rotulo;
    const input = document.createElement('input');
    input.required = obrigatorio;
    input.maxLength = 200;
    label.append(input);
    formulario.append(label);
    return input;
  };
  const nome = campo('Nome', true);
  const categoria = campo('Categoria', true);
  const metadados = campo('Metadados (opcional)', false);
  const registrar = document.createElement('button');
  registrar.type = 'submit';
  registrar.textContent = 'Registrar documento';
  formulario.append(registrar);
  const mensagem = document.createElement('p');
  mensagem.setAttribute('role', 'status');
  const lista = document.createElement('ul');
  const atualizarLista = () => {
    lista.replaceChildren();
    if (!dados.documentos.length) {
      const item = document.createElement('li');
      item.textContent = 'Nenhum documento registrado nesta prévia.';
      lista.append(item);
      return;
    }
    for (const documento of dados.documentos) {
      const item = document.createElement('li');
      item.textContent = `${documento.nome} · ${documento.categoria}${documento.metadados ? ` · ${documento.metadados}` : ''}`;
      lista.append(item);
    }
  };
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const nomeLimpo = nome.value.trim();
    const categoriaLimpa = categoria.value.trim();
    if (!nomeLimpo || !categoriaLimpa) {
      mensagem.textContent = 'Informe nome e categoria.';
      return;
    }
    const metadadosLimpos = metadados.value.trim();
    const documento: DocumentoLocal = {
      nome: nomeLimpo,
      categoria: categoriaLimpa,
      ...(metadadosLimpos ? { metadados: metadadosLimpos } : {}),
    };
    if (dados.documentos.length >= 100) {
      mensagem.textContent = 'Limite de 100 documentos nesta prévia.';
      return;
    }
    registrar.disabled = true;
    for (const input of [nome, categoria, metadados]) input.disabled = true;
    try {
      await dados.aoRegistrar(documento);
    } catch {
      mensagem.textContent =
        'Não foi possível guardar. O rascunho foi preservado; confira a conexão ou reabra a prévia se houve alteração em outra aba.';
      return;
    } finally {
      registrar.disabled = false;
      for (const input of [nome, categoria, metadados]) input.disabled = false;
    }
    dados.documentos.push(documento);
    formulario.reset();
    mensagem.textContent = 'Documento registrado nesta prévia.';
    atualizarLista();
  });
  atualizarLista();
  raiz.append(formulario, mensagem, lista);
}
