import {
  AUDIO_BYTES_MAXIMO,
  bytesParaBase64,
  mimeAudioSchema,
  type MimeAudio,
  type Transcricao,
} from '../packages/contracts/src/transcricao.ts';
import { exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';

export type ServicoTranscricao = {
  registrar(
    pacienteId: string,
    entrada: { audio_base64: string; mime: MimeAudio; duracao_segundos: number },
  ): Promise<Transcricao>;
  ouvir(pacienteId: string, audioId: string): Promise<Transcricao>;
  confirmarRevisao(
    pacienteId: string,
    audioId: string,
    textoRevisado: string,
  ): Promise<Transcricao>;
  excluirAudio(pacienteId: string, audioId: string): Promise<Transcricao>;
};

type Opcoes = {
  /** Texto já digitado, quando o autor começou escrevendo e decidiu ditar o resto. */
  textoInicial?: string;
  /** Teto de gravação em segundos; o servidor tem o seu e manda sobre este. */
  duracaoMaxima?: number;
  /** Injetável para teste; em produção é sempre `navigator.mediaDevices`. */
  midia?: Pick<MediaDevices, 'getUserMedia'>;
  gravador?: typeof MediaRecorder;
};

const FORMATOS: readonly string[] = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
];

/** `Blob.arrayBuffer()` não existe em todo navegador que grava áudio (Safari mais antigo,
 * por exemplo). O `FileReader` é o caminho antigo e continua disponível em todos eles. */
export async function bytesDoBlob(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return await new Promise<Uint8Array>((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onerror = () => rejeitar(new Error('Não foi possível ler a gravação.'));
    leitor.onload = () => {
      const resultado = leitor.result;
      if (resultado instanceof ArrayBuffer) resolver(new Uint8Array(resultado));
      else rejeitar(new Error('Não foi possível ler a gravação.'));
    };
    leitor.readAsArrayBuffer(blob);
  });
}

/** Normaliza o tipo que o `MediaRecorder` devolve ("audio/webm;codecs=opus") para o que o
 * contrato aceita. */
export function mimeDoBlob(tipo: string): MimeAudio | null {
  const base = tipo.split(';')[0]?.trim().toLowerCase() ?? '';
  const resultado = mimeAudioSchema.safeParse(base);
  return resultado.success ? resultado.data : null;
}

/** FR-010: gravar um áudio, receber um rascunho de texto, ouvir o original, corrigir e só
 * então confirmar a revisão.
 *
 * Três regras do requisito que a tela carrega e não pode relaxar:
 * 1. A transcrição automática NÃO é revisão. Só o botão de confirmar fecha a revisão.
 * 2. "Deve haver alternativa por texto": o campo de texto está sempre editável e funciona
 *    sozinho. Se o microfone não existir, for negado ou o serviço estiver fora, a tela
 *    informa e continua utilizável — nunca bloqueia o relato.
 * 3. Trecho incerto não é completado como fato: o rascunho entra como veio, e o aviso de
 *    revisão aparece junto do texto.
 *
 * O componente não publica nada: devolve o texto revisado a quem o montou (o diário). */
export function montarTranscricaoAudio(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoTranscricao,
  aoConfirmar: (texto: string) => void,
  acessoPerdido: (erro: unknown) => void,
  opcoes: Opcoes = {},
): () => void {
  let ativa = true;
  let gravador: MediaRecorder | null = null;
  let trilha: MediaStream | null = null;
  let relogio: ReturnType<typeof setInterval> | undefined;
  let limite: ReturnType<typeof setTimeout> | undefined;
  let urlAudio: string | null = null;
  let registro: Transcricao | null = null;
  const duracaoMaxima = Math.max(1, Math.min(opcoes.duracaoMaxima ?? 90, 300));
  const midia = opcoes.midia ?? (globalThis.navigator?.mediaDevices as MediaDevices | undefined);
  const Gravador = opcoes.gravador ?? globalThis.MediaRecorder;

  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };

  const secao = elemento('section');
  secao.className = 'transcricao-audio';
  const titulo = elemento('h3', 'Relato por áudio');
  const explicacao = elemento(
    'p',
    `Grave até ${duracaoMaxima} segundos para receber um rascunho de texto. O rascunho precisa da sua revisão antes de virar relato: o que ficou incerto no áudio continua incerto no texto.`,
  );
  const estado = elemento('p');
  estado.setAttribute('role', 'status');
  estado.setAttribute('aria-live', 'polite');
  const gravar = elemento('button', 'Gravar áudio');
  gravar.type = 'button';
  const parar = elemento('button', 'Parar gravação');
  parar.type = 'button';
  parar.hidden = true;
  const comandos = elemento('div');
  comandos.className = 'transcricao-comandos';
  comandos.append(gravar, parar);

  const rotuloTexto = elemento('label', 'Texto do relato');
  const texto = elemento('textarea');
  texto.rows = 6;
  texto.value = opcoes.textoInicial ?? '';
  rotuloTexto.append(texto);

  const original = elemento('div');
  original.className = 'transcricao-original';
  original.hidden = true;
  const tocador = elemento('audio');
  tocador.controls = true;
  const rotuloOriginal = elemento('p', 'Áudio original, para conferir enquanto revisa:');
  original.append(rotuloOriginal, tocador);

  const confirmar = elemento('button', 'Confirmar revisão');
  confirmar.type = 'button';
  confirmar.hidden = true;
  const regularizar = elemento('button', 'Tentar excluir o áudio novamente');
  regularizar.type = 'button';
  regularizar.hidden = true;
  const destino = elemento('p');
  destino.setAttribute('role', 'status');
  destino.setAttribute('aria-live', 'polite');

  secao.append(
    titulo,
    explicacao,
    comandos,
    estado,
    rotuloTexto,
    original,
    confirmar,
    regularizar,
    destino,
  );
  raiz.replaceChildren(secao);

  const descartarAcesso = (erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    limpar();
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };

  const soltarMicrofone = () => {
    for (const faixa of trilha?.getTracks() ?? []) faixa.stop();
    trilha = null;
    gravador = null;
    if (relogio !== undefined) clearInterval(relogio);
    if (limite !== undefined) clearTimeout(limite);
    relogio = undefined;
    limite = undefined;
  };

  const soltarUrl = () => {
    if (urlAudio) URL.revokeObjectURL(urlAudio);
    urlAudio = null;
  };

  function limpar() {
    soltarMicrofone();
    soltarUrl();
  }

  /** Perder a reprodução do original não pode custar o rascunho já transcrito: se o
   * navegador não deixar criar a mídia, a revisão continua, só sem o áudio ao lado. */
  const mostrarOriginal = (base64: string, mime: MimeAudio): boolean => {
    try {
      soltarUrl();
      const binario = atob(base64);
      const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
      urlAudio = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
      tocador.src = urlAudio;
      original.hidden = false;
      return true;
    } catch {
      original.hidden = true;
      return false;
    }
  };

  const descreverExclusao = (atual: Transcricao) => {
    if (atual.exclusao_estado === 'confirmada') {
      destino.textContent =
        'Revisão confirmada e áudio original excluído. O texto, a autoria e o histórico ficam guardados; a gravação não pode mais ser ouvida.';
      regularizar.hidden = true;
      original.hidden = true;
      soltarUrl();
      return;
    }
    // Indisponibilidade de armazenamento nunca é apresentada como exclusão concluída.
    destino.textContent =
      atual.exclusao_estado === 'falha'
        ? 'Revisão confirmada e salva. A exclusão do áudio original falhou e continua pendente — o texto não foi perdido.'
        : 'Revisão confirmada e salva. A exclusão do áudio original ficou pendente e ainda não foi confirmada.';
    regularizar.hidden = false;
  };

  if (!midia || typeof Gravador !== 'function') {
    gravar.disabled = true;
    estado.textContent =
      'Este navegador não permite gravar áudio aqui. Escreva o relato no campo abaixo — ele funciona sozinho.';
  }

  gravar.addEventListener('click', async () => {
    if (!ativa || !midia || typeof Gravador !== 'function') return;
    gravar.disabled = true;
    estado.textContent = 'Pedindo acesso ao microfone…';
    let fluxo: MediaStream;
    try {
      fluxo = await midia.getUserMedia({ audio: true });
    } catch {
      gravar.disabled = false;
      estado.textContent =
        'Sem acesso ao microfone. Libere a permissão no navegador ou escreva o relato no campo abaixo.';
      return;
    }
    if (!ativa) {
      for (const faixa of fluxo.getTracks()) faixa.stop();
      return;
    }
    trilha = fluxo;
    const formato = FORMATOS.find((tipo) => Gravador.isTypeSupported?.(tipo) ?? false);
    try {
      gravador = new Gravador(fluxo, formato ? { mimeType: formato } : undefined);
    } catch {
      soltarMicrofone();
      gravar.disabled = false;
      estado.textContent = 'Não foi possível iniciar a gravação. Escreva o relato no campo abaixo.';
      return;
    }
    const pedacos: Blob[] = [];
    const inicio = Date.now();
    gravador.addEventListener('dataavailable', (evento) => {
      if (evento.data.size > 0) pedacos.push(evento.data);
    });
    gravador.addEventListener('stop', async () => {
      const segundos = Math.max(1, Math.round((Date.now() - inicio) / 1000));
      const tipo = gravador?.mimeType ?? pedacos[0]?.type ?? '';
      soltarMicrofone();
      parar.hidden = true;
      gravar.hidden = false;
      gravar.disabled = false;
      const blob = new Blob(pedacos, { type: tipo });
      const mime = mimeDoBlob(blob.type);
      if (!mime) {
        estado.textContent = 'O formato gravado não é aceito. Escreva o relato no campo abaixo.';
        return;
      }
      if (blob.size === 0) {
        estado.textContent = 'Nada foi gravado. Tente de novo ou escreva o relato abaixo.';
        return;
      }
      if (blob.size > AUDIO_BYTES_MAXIMO) {
        estado.textContent =
          'A gravação ficou grande demais para ser transcrita. Grave um trecho mais curto ou escreva o relato abaixo.';
        return;
      }
      estado.textContent = 'Transcrevendo… o texto volta para você revisar.';
      gravar.disabled = true;
      try {
        const base64 = bytesParaBase64(await bytesDoBlob(blob));
        const resultado = await servico.registrar(pacienteId, {
          audio_base64: base64,
          mime,
          duracao_segundos: Math.min(segundos, duracaoMaxima),
        });
        if (!ativa) return;
        registro = resultado;
        // O rascunho não substitui o que já estava escrito: ele é acrescentado, porque
        // apagar texto digitado por causa de uma transcrição seria perder trabalho humano.
        texto.value = texto.value.trim()
          ? `${texto.value.trim()}\n\n${resultado.transcricao}`
          : resultado.transcricao;
        const ouvivel = mostrarOriginal(base64, mime);
        confirmar.hidden = false;
        estado.textContent = ouvivel
          ? 'Rascunho transcrito automaticamente. Ouça o original, corrija o que estiver errado e confirme a revisão — a transcrição sozinha não conta como revisada.'
          : 'Rascunho transcrito automaticamente. Este navegador não conseguiu reproduzir o original aqui; corrija o que estiver errado e confirme a revisão — a transcrição sozinha não conta como revisada.';
      } catch (erro) {
        if (descartarAcesso(erro)) return;
        estado.textContent = resultadoIncerto(erro)
          ? 'Não foi possível confirmar se a transcrição foi registrada. Seu texto continua aqui; escreva o relato se preferir não esperar.'
          : `Não foi possível transcrever: ${mensagemFalha(erro)} Escreva o relato no campo abaixo.`;
      } finally {
        if (ativa) gravar.disabled = false;
      }
    });
    gravador.start();
    gravar.hidden = true;
    parar.hidden = false;
    parar.focus();
    const atualizar = () => {
      const passados = Math.round((Date.now() - inicio) / 1000);
      estado.textContent = `Gravando… ${passados}s de ${duracaoMaxima}s.`;
    };
    atualizar();
    relogio = setInterval(atualizar, 1000);
    limite = setTimeout(() => {
      if (gravador?.state === 'recording') gravador.stop();
    }, duracaoMaxima * 1000);
  });

  parar.addEventListener('click', () => {
    if (gravador?.state === 'recording') gravador.stop();
  });

  confirmar.addEventListener('click', async () => {
    if (!ativa || !registro) return;
    const revisado = texto.value.trim();
    if (!revisado) {
      estado.textContent = 'Escreva o texto revisado antes de confirmar.';
      texto.focus();
      return;
    }
    confirmar.disabled = true;
    try {
      const atual = await servico.confirmarRevisao(pacienteId, registro.audio_id, revisado);
      if (!ativa) return;
      registro = atual;
      confirmar.hidden = true;
      aoConfirmar(revisado);
      // Confirmada a revisão, o original é descartado sob controle do autor. A exclusão é
      // pedida agora e seu resultado é informado como veio — pendente continua pendente.
      try {
        const depois = await servico.excluirAudio(pacienteId, atual.audio_id);
        if (!ativa) return;
        registro = depois;
        descreverExclusao(depois);
      } catch (erro) {
        if (descartarAcesso(erro)) return;
        descreverExclusao({ ...atual, exclusao_estado: 'pendente' });
      }
    } catch (erro) {
      if (descartarAcesso(erro)) return;
      confirmar.disabled = false;
      estado.textContent = resultadoIncerto(erro)
        ? 'Não foi possível confirmar o salvamento da revisão. Copie seu texto antes de tentar de novo.'
        : `Não foi possível confirmar a revisão: ${mensagemFalha(erro)}`;
    }
  });

  regularizar.addEventListener('click', async () => {
    if (!ativa || !registro) return;
    regularizar.disabled = true;
    try {
      // Repetir é seguro: o alvo é um estado terminal do próprio registro, e nenhum outro
      // anexo é tocado.
      const depois = await servico.excluirAudio(pacienteId, registro.audio_id);
      if (!ativa) return;
      registro = depois;
      descreverExclusao(depois);
    } catch (erro) {
      if (descartarAcesso(erro)) return;
      destino.textContent = `A exclusão continua pendente: ${mensagemFalha(erro)} O texto revisado segue salvo.`;
    } finally {
      if (ativa) regularizar.disabled = false;
    }
  });

  return () => {
    ativa = false;
    limpar();
    raiz.replaceChildren();
  };
}
