import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';
import type { ServicoTurnoExecucao, ArquivoTurno } from './servico-turno-execucao-http.ts';
import {
  TAMANHO_MAXIMO_ANEXO_TURNO,
  type RegistroExecucaoPublico,
} from '../packages/contracts/src/turno-execucao-http.ts';
import {
  elementoTurno as el,
  selecaoTurno,
  estadoTurno,
  botaoTurno,
} from './turno-execucao-campos.ts';
import { botao } from './ui/basicos.js';

export function criarEntregaArquivoTurno() {
  let ativa = true;
  const urls = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    entregar(arquivo: ArquivoTurno) {
      if (!ativa) return;
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(arquivo.bytes)], { type: arquivo.tipo }),
      );
      const link = el('a');
      link.href = url;
      link.download = arquivo.nome;
      link.rel = 'noopener';
      link.click();
      const prazo = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
      }, 1_000);
      urls.set(url, prazo);
    },
    desmontar() {
      ativa = false;
      for (const [url, prazo] of urls) {
        clearTimeout(prazo);
        URL.revokeObjectURL(url);
      }
      urls.clear();
    },
  };
}
function base64Arquivo(bytes: Uint8Array) {
  let texto = '';
  for (let inicio = 0; inicio < bytes.length; inicio += 8192)
    texto += String.fromCharCode(...bytes.subarray(inicio, inicio + 8192));
  return btoa(texto);
}
export function montarAnexosOcorrencia(
  raiz: HTMLElement,
  registro: RegistroExecucaoPublico,
  servico: ServicoTurnoExecucao,
  opcoes: {
    podeAnexar: boolean;
    acessoPerdido(erro: unknown): void;
    alteracaoPendente?(valor: boolean): void;
  },
) {
  let ativa = true;
  let ocupada = false;
  let tentativa: {
    entrada: Parameters<ServicoTurnoExecucao['enviarAnexo']>[0];
    chave: string;
    consultada: boolean;
  } | null = null;
  const entrega = criarEntregaArquivoTurno();
  const secao = el('section');
  const status = estadoTurno('Consulte as fotos desta ocorrência.');
  const lista = el('div');
  const formulario = el('form');
  const grupo = el('fieldset');
  grupo.append(el('legend', 'Foto privada da ocorrência'));
  const label = el('label', 'Arquivo de imagem (JPEG, PNG ou WebP, até 3 MiB)');
  const arquivo = el('input');
  arquivo.type = 'file';
  arquivo.accept = 'image/jpeg,image/png,image/webp';
  arquivo.required = true;
  label.append(arquivo);
  grupo.append(label);
  const audiencia = selecaoTurno(grupo, 'Audiência confirmada para a foto', [
    { valor: 'equipe', rotulo: 'Equipe' },
    { valor: 'equipe_e_familia', rotulo: 'Equipe e família com fundamento vigente' },
  ]);
  const salvar = botao({ rotulo: 'Enviar foto privada', tipo: 'submit', peso: 'principal' });
  grupo.append(salvar);
  formulario.append(grupo);
  const atualizar = botaoTurno('Consultar fotos', () => void carregar());
  const repetir = botaoTurno('Repetir o mesmo envio de foto', () => {
    if (tentativa?.consultada) void enviar();
  });
  repetir.hidden = true;
  secao.append(
    el('h4', 'Fotos da ocorrência'),
    el(
      'p',
      'Classificação: foto da ocorrência. Repositório privado temporário do Supabase; acesso reautorizado a cada download.',
    ),
    status,
    lista,
    atualizar,
    repetir,
  );
  if (opcoes.podeAnexar) secao.append(formulario);
  raiz.replaceChildren(secao);
  function controles() {
    grupo.disabled = ocupada || tentativa !== null;
    atualizar.disabled = ocupada;
    repetir.hidden = tentativa === null;
    repetir.disabled = ocupada || !tentativa?.consultada;
  }
  function falha(erro: unknown) {
    if (!ativa) return;
    if (
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      ativa = false;
      entrega.desmontar();
      raiz.replaceChildren();
      opcoes.acessoPerdido(erro);
      return;
    }
    status.textContent = mensagemFalha(erro);
  }
  async function carregar(cursor?: string) {
    if (!ativa || ocupada) return;
    ocupada = true;
    controles();
    status.textContent = 'Consultando fotos…';
    try {
      const pagina = await servico.anexos({
        ocorrencia_id: registro.registro_id,
        ...(cursor ? { cursor_id: cursor } : {}),
      });
      if (!ativa) return;
      if (!cursor) lista.replaceChildren();
      if (!pagina.itens.length && !cursor)
        lista.append(el('p', 'Nenhuma foto cadastrada nesta ocorrência.'));
      for (const anexo of pagina.itens) {
        const linha = el(
          'p',
          `Foto ${anexo.mime_type} · ${Math.ceil(anexo.tamanho_bytes / 1024)} KiB · ${anexo.audiencia === 'equipe' ? 'Equipe' : 'Equipe e família'} `,
        );
        const baixar = botaoTurno('Baixar foto', () => {
          if (ocupada) return;
          ocupada = true;
          controles();
          baixar.disabled = true;
          void servico
            .baixarAnexo(anexo.anexo_id)
            .then((arquivo) => {
              if (ativa) entrega.entregar(arquivo);
            })
            .catch(falha)
            .finally(() => {
              ocupada = false;
              if (ativa) {
                controles();
                baixar.disabled = false;
              }
            });
        });
        linha.append(baixar);
        lista.append(linha);
      }
      if (tentativa) {
        if (pagina.itens.some((item) => item.anexo_id === tentativa?.entrada.anexo_id)) {
          tentativa = null;
          opcoes.alteracaoPendente?.(false);
        } else if (pagina.proximo_cursor === null) tentativa.consultada = true;
      }
      if (pagina.proximo_cursor)
        lista.append(
          botaoTurno(
            'Próxima página de fotos',
            () => void carregar(pagina.proximo_cursor ?? undefined),
          ),
        );
      status.textContent = tentativa
        ? 'Envio ainda sem confirmação. Após consultar todas as páginas, repita exatamente o mesmo envio.'
        : 'Consulta de fotos concluída.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function enviar() {
    if (!ativa || ocupada || !tentativa) return;
    ocupada = true;
    tentativa.consultada = false;
    controles();
    status.textContent = 'Enviando foto privada…';
    try {
      await servico.enviarAnexo(tentativa.entrada, tentativa.chave);
      if (!ativa) return;
      tentativa = null;
      arquivo.value = '';
      opcoes.alteracaoPendente?.(false);
      ocupada = false;
      await carregar();
    } catch (erro) {
      if (!resultadoIncerto(erro)) tentativa = null;
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  formulario.oninput = () => opcoes.alteracaoPendente?.(true);
  formulario.onsubmit = (evento) => {
    evento.preventDefault();
    if (ocupada || tentativa) return;
    const selecionado = arquivo.files?.[0];
    if (
      !selecionado ||
      selecionado.size <= 0 ||
      selecionado.size > TAMANHO_MAXIMO_ANEXO_TURNO ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(selecionado.type) ||
      !['equipe', 'equipe_e_familia'].includes(audiencia.value)
    ) {
      status.textContent = 'Escolha uma imagem válida de até 3 MiB e confirme a audiência.';
      return;
    }
    ocupada = true;
    controles();
    void selecionado
      .arrayBuffer()
      .then((buffer) => {
        if (!ativa) return;
        tentativa = {
          entrada: {
            anexo_id: crypto.randomUUID(),
            ocorrencia_id: registro.registro_id,
            ocorrencia_versao: registro.versao,
            mime_type: selecionado.type as 'image/jpeg' | 'image/png' | 'image/webp',
            tamanho_bytes: selecionado.size,
            audiencia: audiencia.value as 'equipe' | 'equipe_e_familia',
            arquivo_base64: base64Arquivo(new Uint8Array(buffer)),
          },
          chave: crypto.randomUUID(),
          consultada: false,
        };
        ocupada = false;
        return enviar();
      })
      .catch((erro: unknown) => {
        ocupada = false;
        falha(erro);
        if (ativa) controles();
      });
  };
  controles();
  return () => {
    ativa = false;
    tentativa = null;
    arquivo.value = '';
    entrega.desmontar();
    raiz.replaceChildren();
  };
}
