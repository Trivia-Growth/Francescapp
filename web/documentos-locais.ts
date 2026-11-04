export type DocumentoLocal = { nome: string; categoria: string; metadados?: string };

export type DadosDocumentosLocais = {
  documentos: DocumentoLocal[];
  anexos?: { id: string; name: string; size: number }[];
  aoAnexar?: (arquivo: File) => Promise<{ id: string; name: string; size: number }>;
  urlAnexo?: (id: string) => string;
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
    mensagem.textContent = 'Guardando documento…';
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
  if (dados.anexos && dados.aoAnexar && dados.urlAnexo) {
    const titulo = document.createElement('h2');
    titulo.textContent = 'Arquivos fictícios';
    const instrucoes = document.createElement('p');
    instrucoes.textContent = 'PDF, PNG, JPEG ou TXT, até 2 MB. Use somente arquivos fictícios.';
    const formAnexo = document.createElement('form');
    const label = document.createElement('label');
    label.textContent = 'Selecionar arquivo fictício';
    const arquivo = document.createElement('input');
    arquivo.type = 'file';
    arquivo.accept = '.pdf,.png,.jpg,.jpeg,.txt';
    arquivo.required = true;
    label.append(arquivo);
    const botao = document.createElement('button');
    botao.textContent = 'Anexar arquivo';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const listaAnexos = document.createElement('ul');
    const atualizarAnexos = () => {
      listaAnexos.replaceChildren();
      for (const anexo of dados.anexos ?? []) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.textContent = `${anexo.name} (${anexo.size} bytes) — baixar`;
        link.href = dados.urlAnexo?.(anexo.id) ?? '';
        item.append(link);
        listaAnexos.append(item);
      }
      if (!listaAnexos.childElementCount) {
        const item = document.createElement('li');
        item.textContent = 'Nenhum arquivo anexado.';
        listaAnexos.append(item);
      }
    };
    formAnexo.append(label, botao);
    formAnexo.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const selecionado = arquivo.files?.[0];
      if (!selecionado) return;
      if (selecionado.size > 2 * 1024 * 1024 || selecionado.size === 0) {
        status.textContent = 'Escolha um arquivo não vazio de até 2 MB.';
        return;
      }
      botao.disabled = true;
      arquivo.disabled = true;
      status.textContent = 'Anexando…';
      try {
        const anexo = await dados.aoAnexar?.(selecionado);
        if (anexo) dados.anexos?.push(anexo);
        formAnexo.reset();
        atualizarAnexos();
        status.textContent = 'Arquivo fictício anexado.';
      } catch {
        status.textContent =
          'Não foi possível anexar. Confira tipo, tamanho, sessão e conexão local.';
      } finally {
        botao.disabled = false;
        arquivo.disabled = false;
      }
    });
    atualizarAnexos();
    raiz.append(titulo, instrucoes, formAnexo, status, listaAnexos);
  }
}
