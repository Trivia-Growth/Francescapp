import { TAMANHO_MAXIMO_DOCUMENTO } from '../packages/contracts/src/documento-caso.ts';
import type {
  AudienciaDocumento,
  DocumentoCaso,
  EstadoDocumento,
} from '../packages/contracts/src/documento-caso.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import { esqueletoCarregando, iniciarAcao } from './esqueleto.js';
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
  ehFamilia = false,
): () => void {
  let ativa = true;
  let documentos: DocumentoCaso[] = [];
  const downloads = new Set<string>();
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

    if (ehFamilia) {
      desenharLista(secao);
      raiz.replaceChildren(secao);
      return;
    }

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
      if (escolhido.size === 0 || escolhido.size > TAMANHO_MAXIMO_DOCUMENTO) {
        aviso.textContent = 'Escolha um arquivo de até 4 MiB.';
        return;
      }
      if (!categoria.value || !audiencia.value) {
        aviso.textContent = 'Classifique o anexo e confirme quem pode vê-lo antes de concluir.';
        return;
      }
      enviar.disabled = true;
      aviso.textContent = 'Enviando…';
      const finalizar = iniciarAcao(enviar);
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
      } finally {
        finalizar();
      }
    });

    secao.append(form);
    desenharLista(secao);
    raiz.replaceChildren(secao);
  };

  const desenharLista = (secao: HTMLElement) => {
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
        if (documento.estado === 'disponivel' && servico.baixar) {
          const baixar = elemento('button', 'Baixar arquivo');
          baixar.type = 'button';
          baixar.className = 'button-secondary';
          baixar.setAttribute('aria-label', `Baixar ${documento.nome_visivel}`);
          const feedback = elemento('p');
          feedback.setAttribute('role', 'status');
          baixar.addEventListener('click', async () => {
            if (baixar.disabled || !servico.baixar) return;
            baixar.disabled = true;
            feedback.textContent = 'Preparando arquivo…';
            const finalizar = iniciarAcao(baixar);
            try {
              const blob = await servico.baixar(pacienteId, documento.documento_id);
              if (!ativa) return;
              const url = URL.createObjectURL(blob);
              downloads.add(url);
              const link = elemento('a');
              link.href = url;
              link.download =
                documento.nome_visivel.replace(/[\p{C}/\\"<>:|?*]/gu, '_').slice(0, 180) ||
                'documento';
              link.hidden = true;
              raiz.append(link);
              try {
                link.click();
              } finally {
                link.remove();
                window.setTimeout(() => {
                  URL.revokeObjectURL(url);
                  downloads.delete(url);
                }, 1000);
              }
              feedback.textContent =
                'Arquivo enviado ao navegador para download. Confira seus downloads.';
            } catch (erro) {
              if (descartarAcesso(erro) || !ativa) return;
              feedback.textContent =
                erro instanceof FalhaApi
                  ? mensagemFalha(erro)
                  : 'Não foi possível baixar o arquivo. Tente novamente.';
            } finally {
              finalizar();
              if (ativa) baixar.disabled = false;
            }
          });
          item.append(baixar, feedback);
        }
        if (!ehFamilia) {
          const editor = elemento('details');
          editor.append(elemento('summary', 'Editar dados do documento'));
          const form = elemento('form');
          form.className = 'documentos-envio';
          const campo = (rotulo: string, atual: string, tipo = 'text') => {
            const input = elemento('input');
            input.type = tipo;
            input.value = atual;
            input.id = `documento-${documento.documento_id}-${tipo}-${form.childElementCount}`;
            const label = elemento('label', rotulo);
            label.htmlFor = input.id;
            form.append(label, input);
            return input;
          };
          const categoriasAtuais = obterCategorias();
          const categoria = elemento('select');
          categoria.id = `documento-${documento.documento_id}-categoria`;
          categoria.required = true;
          const rotuloCategoria = elemento('label', 'Categoria');
          rotuloCategoria.htmlFor = categoria.id;
          if (!categoriasAtuais.includes(documento.categoria)) {
            const preservada = elemento(
              'option',
              `${documento.categoria} (categoria anterior, preservada)`,
            );
            preservada.value = documento.categoria;
            categoria.append(preservada);
          }
          for (const nome of categoriasAtuais) {
            const opcao = elemento('option', nome);
            opcao.value = nome;
            categoria.append(opcao);
          }
          categoria.value = documento.categoria;
          form.append(rotuloCategoria, categoria);
          const origem = campo('Origem (opcional)', documento.origem ?? '');
          origem.maxLength = 120;
          const data = campo(
            'Data do documento (opcional)',
            documento.data_documento ?? '',
            'date',
          );
          const selecao = (
            rotulo: string,
            atual: string,
            opcoes: readonly (readonly [string, string])[],
          ) => {
            const select = elemento('select');
            select.id = `documento-${documento.documento_id}-${form.childElementCount}`;
            const label = elemento('label', rotulo);
            label.htmlFor = select.id;
            for (const [valor, texto] of opcoes) {
              const option = elemento('option', texto);
              option.value = valor;
              option.selected = valor === atual;
              select.append(option);
            }
            form.append(label, select);
            return select;
          };
          const audiencia = selecao('Quem pode ver', documento.audiencia, AUDIENCIAS);
          const estado = selecao('Estado do arquivo', documento.estado, [
            ['disponivel', 'Disponível'],
            ['indisponivel', 'Indisponível'],
            ['removido', 'Removido'],
          ]);
          form.append(
            elemento(
              'p',
              'Alterar dados mantém o arquivo e o histórico. Removido oculta o acesso pelo app; não exclui o arquivo do Drive.',
            ),
          );
          const salvar = elemento('button', 'Salvar dados');
          salvar.type = 'submit';
          const conferir = elemento('button', 'Conferir resultado');
          conferir.type = 'button';
          conferir.hidden = true;
          const aviso = elemento('p');
          aviso.setAttribute('role', 'status');
          let pendente: Parameters<ServicoDocumentos['gravar']>[1] | undefined;
          let ocupada = false;
          const bloquearCampos = (bloquear: boolean) => {
            for (const input of [categoria, origem, data, audiencia, estado])
              input.disabled = bloquear;
          };
          form.addEventListener('input', () => alteracaoPendente(true));
          form.addEventListener('submit', async (evento) => {
            evento.preventDefault();
            if (ocupada || !ativa) return;
            pendente ??= {
              documento_id: documento.documento_id,
              versao_esperada: documento.versao,
              chave_idempotencia: crypto.randomUUID(),
              metadado: {
                categoria: categoria.value.trim(),
                ...(origem.value.trim() ? { origem: origem.value.trim() } : {}),
                ...(data.value ? { data_documento: data.value } : {}),
                audiencia: audiencia.value as DocumentoCaso['audiencia'],
                estado: estado.value as DocumentoCaso['estado'],
              },
              conteudo: {
                nome_visivel: documento.nome_visivel,
                drive_file_id: documento.drive_file_id,
                ...(documento.descricao === undefined ? {} : { descricao: documento.descricao }),
              },
            };
            ocupada = true;
            salvar.disabled = true;
            conferir.disabled = true;
            bloquearCampos(true);
            aviso.textContent = 'Salvando dados…';
            try {
              const atualizados = await servico.gravar(pacienteId, pendente);
              if (!ativa) return;
              documentos = atualizados;
              alteracaoPendente(false);
              desenhar();
            } catch (erro) {
              if (descartarAcesso(erro) || !ativa) return;
              if (resultadoIncerto(erro)) {
                conferir.hidden = false;
                salvar.textContent = 'Repetir mesma alteração';
                aviso.textContent =
                  'A alteração pode ter sido salva. Confira o resultado ou repita a mesma alteração com segurança.';
                alteracaoPendente(true);
              } else {
                pendente = undefined;
                bloquearCampos(false);
                aviso.textContent =
                  erro instanceof FalhaApi
                    ? mensagemFalha(erro)
                    : 'Não foi possível salvar os dados. Tente novamente.';
              }
            } finally {
              ocupada = false;
              if (ativa) {
                salvar.disabled = false;
                conferir.disabled = false;
              }
            }
          });
          conferir.addEventListener('click', async () => {
            if (ocupada || !pendente || !ativa) return;
            ocupada = true;
            conferir.disabled = true;
            salvar.disabled = true;
            aviso.textContent = 'Conferindo versão atual…';
            try {
              const atualizados = await servico.consultar(pacienteId);
              if (!ativa) return;
              const atual = atualizados.find(
                (item) => item.documento_id === documento.documento_id,
              );
              const esperado = pendente.metadado;
              if (
                atual &&
                atual.versao > pendente.versao_esperada &&
                atual.categoria === esperado.categoria &&
                atual.origem === esperado.origem &&
                atual.data_documento === esperado.data_documento &&
                atual.audiencia === esperado.audiencia &&
                atual.estado === esperado.estado
              ) {
                documentos = atualizados;
                alteracaoPendente(false);
                desenhar();
              } else {
                aviso.textContent =
                  atual && atual.versao !== pendente.versao_esperada
                    ? 'Outra versão está disponível. A alteração pendente foi preservada; repetir verificará o conflito sem substituir a versão atual.'
                    : 'A alteração ainda não aparece. Repita a mesma alteração para confirmar o resultado.';
              }
            } catch (erro) {
              if (descartarAcesso(erro) || !ativa) return;
              aviso.textContent =
                'Não foi possível conferir. A alteração pendente continua preservada.';
            } finally {
              ocupada = false;
              if (ativa) {
                conferir.disabled = false;
                salvar.disabled = false;
              }
            }
          });
          form.append(salvar, conferir, aviso);
          editor.append(form);
          item.append(editor);
        }
        if (!ehFamilia && documento.compartilhamento) {
          const mensagem =
            documento.compartilhamento === 'divergente'
              ? 'Pendência: compartilhamento no Drive incompatível com a audiência. Coordenação deve revisar na origem.'
              : documento.compartilhamento === 'indisponivel'
                ? 'Pendência: não foi possível conferir compartilhamento no Drive.'
                : 'Pendência: coordenação deve conferir destinatários do Drive com a audiência do caso.';
          item.append(elemento('p', mensagem));
        }
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
    for (const url of downloads) URL.revokeObjectURL(url);
    downloads.clear();
    alteracaoPendente(false);
    raiz.replaceChildren();
  };
}
