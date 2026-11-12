import type {
  AudienciaDocumento,
  DocumentoCaso,
  EstadoDocumento,
} from '../packages/contracts/src/documento-caso.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import { esqueletoCarregando } from './esqueleto.js';
import type { ServicoDocumentos } from './servico-documentos-http.js';

const AUDIENCIAS = [
  ['equipe', 'Só a equipe'],
  ['equipe_e_familia', 'Equipe e família'],
] as const;

const rotuloAudiencia = (valor: AudienciaDocumento) =>
  AUDIENCIAS.find(([chave]) => chave === valor)?.[1] ?? valor;

const rotuloEstado = (valor: EstadoDocumento) =>
  valor === 'disponivel' ? 'Disponível' : valor === 'indisponivel' ? 'Não encontrado' : 'Removido';

/** FR-029 a FR-031: anexos do caso guardados no Google Drive institucional.
 *
 * Duas exigências do requisito moram aqui e não no servidor:
 * - classificar e confirmar a audiência fazem parte de concluir o envio (FR-030), então o
 *   botão só habilita com categoria e audiência escolhidas — o banco recusa de todo jeito,
 *   mas a pessoa descobre antes de esperar o arquivo subir;
 * - o anexo que sumiu do Drive continua na lista, marcado como não encontrado, com a
 *   orientação de regularização (cenário 2 da User Story 8). Esconder seria pior: o anexo
 *   desapareceria sem explicação.
 *
 * As categorias vêm da configuração em banco, editável na tela de administração — não há
 * lista fixa no código. */
export function montarDocumentosCaso(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoDocumentos,
  obterCategorias: () => readonly string[],
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let ativa = true;
  let documentos: DocumentoCaso[] = [];
  const descartarAcesso = (erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const status = elemento('p', 'Carregando documentos…');
  status.setAttribute('role', 'status');
  raiz.replaceChildren(esqueletoCarregando(3, true), status);

  const desenhar = () => {
    if (!ativa) return;
    const secao = elemento('section');
    secao.className = 'secao-documentos';

    const form = elemento('form');
    form.className = 'documentos-envio';
    const titulo = elemento('h3', 'Anexar documento');
    const categorias = obterCategorias();

    const arquivo = elemento('input');
    arquivo.type = 'file';
    arquivo.id = 'documento-arquivo';
    arquivo.required = true;
    const rotuloArquivo = elemento('label', 'Arquivo');
    rotuloArquivo.htmlFor = arquivo.id;

    const categoria = elemento('select');
    categoria.id = 'documento-categoria';
    categoria.required = true;
    const vazia = elemento('option', 'Escolha a categoria');
    vazia.value = '';
    categoria.append(vazia);
    for (const item of categorias) {
      const opcao = elemento('option', item);
      opcao.value = item;
      categoria.append(opcao);
    }
    const rotuloCategoria = elemento('label', 'Categoria');
    rotuloCategoria.htmlFor = categoria.id;

    const origem = elemento('input');
    origem.type = 'text';
    origem.id = 'documento-origem';
    origem.maxLength = 120;
    const rotuloOrigem = elemento('label', 'Origem (opcional)');
    rotuloOrigem.htmlFor = origem.id;

    const data = elemento('input');
    data.type = 'date';
    data.id = 'documento-data';
    const rotuloData = elemento('label', 'Data do documento (opcional)');
    rotuloData.htmlFor = data.id;

    const audiencia = elemento('select');
    audiencia.id = 'documento-audiencia';
    audiencia.required = true;
    const audienciaVazia = elemento('option', 'Confirme quem pode ver');
    audienciaVazia.value = '';
    audiencia.append(audienciaVazia);
    for (const [valor, rotulo] of AUDIENCIAS) {
      const opcao = elemento('option', rotulo);
      opcao.value = valor;
      audiencia.append(opcao);
    }
    const rotuloAud = elemento('label', 'Quem pode ver');
    rotuloAud.htmlFor = audiencia.id;

    const enviar = elemento('button', 'Anexar');
    enviar.type = 'submit';
    const aviso = elemento('p');
    aviso.setAttribute('role', 'status');

    if (categorias.length === 0) {
      aviso.textContent =
        'Nenhuma categoria de anexo está configurada. A administração define as categorias antes do primeiro envio.';
      enviar.disabled = true;
    }

    form.append(
      titulo,
      rotuloArquivo,
      arquivo,
      rotuloCategoria,
      categoria,
      rotuloOrigem,
      origem,
      rotuloData,
      data,
      rotuloAud,
      audiencia,
      enviar,
      aviso,
    );

    const marcarPendente = () => {
      alteracaoPendente(
        arquivo.files !== null && arquivo.files.length > 0 ? true : categoria.value !== '',
      );
    };
    arquivo.addEventListener('change', marcarPendente);
    categoria.addEventListener('change', marcarPendente);

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const escolhido = arquivo.files?.[0];
      if (!escolhido) {
        aviso.textContent = 'Escolha um arquivo para anexar.';
        return;
      }
      if (!categoria.value || !audiencia.value) {
        aviso.textContent = 'Classifique o anexo e confirme quem pode vê-lo antes de concluir.';
        return;
      }
      enviar.disabled = true;
      aviso.textContent = 'Enviando…';
      try {
        documentos = await servico.gravar(pacienteId, {
          documento_id: crypto.randomUUID(),
          versao_esperada: 0,
          metadado: {
            categoria: categoria.value,
            ...(origem.value.trim() ? { origem: origem.value.trim() } : {}),
            ...(data.value ? { data_documento: data.value } : {}),
            audiencia: audiencia.value as AudienciaDocumento,
            estado: 'disponivel',
          },
          // O identificador real vem do Drive, no servidor; este valor é substituído lá.
          conteudo: { nome_visivel: escolhido.name, drive_file_id: 'pendente' },
          arquivo: escolhido,
        });
        alteracaoPendente(false);
        desenhar();
      } catch (erro) {
        if (descartarAcesso(erro)) return;
        enviar.disabled = false;
        aviso.textContent = resultadoIncerto(erro)
          ? 'O envio pode ter sido concluído. Confira a lista antes de tentar de novo.'
          : erro instanceof FalhaApi
            ? mensagemFalha(erro)
            : 'Não foi possível anexar o documento. Tente novamente.';
      }
    });

    secao.append(form);

    const lista = elemento('ul');
    lista.className = 'documentos-lista';
    if (documentos.length === 0) {
      secao.append(elemento('p', 'Nenhum documento anexado a este caso ainda.'));
    } else {
      for (const documento of documentos) {
        const item = elemento('li');
        item.className = `documento-item documento-item--${documento.estado}`;
        const nome = elemento('p', documento.nome_visivel);
        nome.className = 'documento-item__nome';
        const detalhe = [
          documento.categoria,
          documento.origem,
          documento.data_documento,
          rotuloAudiencia(documento.audiencia),
          `versão ${documento.versao}`,
        ]
          .filter((parte): parte is string => typeof parte === 'string' && parte.length > 0)
          .join(' · ');
        const meta = elemento('p', detalhe);
        meta.className = 'documento-item__meta';
        const selo = elemento('span', rotuloEstado(documento.estado));
        selo.className = 'documento-item__estado';
        item.append(nome, meta, selo);
        if (documento.estado === 'indisponivel') {
          const orientacao = elemento(
            'p',
            'Este arquivo não foi encontrado no Drive da Francescato. Procure a administração para regularizar antes de contar com ele.',
          );
          orientacao.className = 'documento-item__orientacao';
          item.append(orientacao);
        }
        lista.append(item);
      }
      secao.append(lista);
    }
    raiz.replaceChildren(secao);
  };

  void (async () => {
    try {
      documentos = await servico.consultar(pacienteId);
      if (!ativa) return;
      desenhar();
    } catch (erro) {
      if (descartarAcesso(erro) || !ativa) return;
      status.textContent =
        erro instanceof FalhaApi
          ? mensagemFalha(erro)
          : 'Não foi possível carregar os documentos. Tente novamente.';
      raiz.replaceChildren(status);
    }
  })();

  return () => {
    ativa = false;
    alteracaoPendente(false);
    raiz.replaceChildren();
  };
}
