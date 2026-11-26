/* Relato por áudio do Diário (FR-010), reconstruído em React sobre a ilha
 * (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarTranscricaoAudio(raiz, pacienteId, servico,
 * aoConfirmar, acessoPerdido, opcoes) => desmontar`, e `bytesDoBlob`/`mimeDoBlob`
 * continuam as mesmas funções puras de antes.
 *
 * O que a migração entrega (VIS-012): a versão imperativa tinha uma flag `ativa` conferida
 * em NOVE pontos para proteger escritas em DOM já desmontado. Aqui ela também existia para
 * outra coisa, que `ilha()` não resolve sozinha: o microfone é hardware, não estado React.
 * `root.unmount()` cancela os efeitos, mas não solta a trilha de áudio nem limpa o
 * temporizador — por isso a referência `ativaRef` permanece, só que com um papel mais
 * estreito: impedir que uma continuação assíncrona (acesso ao microfone, leitura do Blob,
 * chamada ao servidor) prossiga depois que o caso saiu de cena ou que o acesso foi perdido.
 * A limpeza de hardware (`limpar`) roda nos dois pontos em que isso pode acontecer: na
 * desmontagem da ilha e na revalidação de acesso — exatamente os dois pontos em que a
 * versão imperativa também a chamava.
 *
 * O que NÃO mudou, de propósito (VIS-018):
 *
 * - **Nenhuma frase mudou de palavra.**
 * - A alternativa por texto continua sempre disponível e anunciada: o campo de texto nunca
 *   é desabilitado, mesmo sem microfone, mesmo com o áudio pendente de descarte.
 * - A transcrição automática nunca conta como revisão — só o clique em "Confirmar revisão"
 *   fecha o ciclo, e `aoConfirmar` só é chamado ali.
 * - O áudio original só é pedido para exclusão depois da revisão confirmada, e o resultado
 *   da exclusão é informado como veio: pendente continua pendente, falha nunca vira "excluído".
 * - Uma gravação de cada vez: o botão de gravar permanece desabilitado enquanto o áudio
 *   anterior não tiver descarte confirmado.
 * - A revalidação de acesso esvazia a tela ANTES de avisar (`descartarAcesso`).
 *
 * **O campo de texto continua NÃO controlado.** O rascunho transcrito é anexado por escrita
 * direta no DOM (como a versão imperativa fazia), e a revisão enviada é lida do DOM no
 * momento da confirmação — nunca de um estado React espelhado, que a atribuição crua de
 * `.value` nas provas não alcançaria.
 */
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  AUDIO_BYTES_MAXIMO,
  bytesParaBase64,
  mimeAudioSchema,
  type MimeAudio,
  type Transcricao,
} from '../packages/contracts/src/transcricao.ts';
import { exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { ilha } from './ponte/ilha.js';

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

const ID_TEXTO = 'transcricao-texto';

/** O `<textarea>` do relato, pelo invólucro desta tela — e não `document`, pela mesma razão
 *  de `web/anamnese.tsx`: a montagem de produção fica numa raiz já no documento, mas as
 *  provas montam num `div` solto, e `document.getElementById` não o enxerga. */
function campoDeTexto(raiz: HTMLElement | null): HTMLTextAreaElement | null {
  const no = raiz?.querySelector<HTMLElement>(`[id="${ID_TEXTO}"]`) ?? null;
  return no instanceof HTMLTextAreaElement ? no : null;
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
function TelaTranscricaoAudio({
  pacienteId,
  servico,
  aoConfirmar,
  acessoPerdido,
  opcoes,
}: {
  pacienteId: string;
  servico: ServicoTranscricao;
  aoConfirmar: (texto: string) => void;
  acessoPerdido: (erro: unknown) => void;
  opcoes: Opcoes;
}) {
  const duracaoMaxima = Math.max(1, Math.min(opcoes.duracaoMaxima ?? 90, 300));
  const midia = opcoes.midia ?? (globalThis.navigator?.mediaDevices as MediaDevices | undefined);
  const Gravador = opcoes.gravador ?? globalThis.MediaRecorder;
  const semMicrofone = !midia || typeof Gravador !== 'function';

  const envelope = useRef<HTMLElement>(null);

  /* Guarda de hardware e de efeito colateral externo — não de pintura (VIS-012, ver
   * cabeçalho do arquivo). Falso a partir do momento em que o caso saiu de cena ou o acesso
   * foi perdido; os pontos que o conferem são os que chamariam o servidor ou tocariam o
   * microfone depois disso. */
  const ativaRef = useRef(true);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const trilhaRef = useRef<MediaStream | null>(null);
  const relogioRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const limiteRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const urlAudioRef = useRef<string | null>(null);
  const registroRef = useRef<Transcricao | null>(null);

  const [estadoTexto, definirEstadoTexto] = useState(
    semMicrofone
      ? 'Este navegador não permite gravar áudio aqui. Escreva o relato no campo abaixo — ele funciona sozinho.'
      : '',
  );
  const [destinoTexto, definirDestinoTexto] = useState('');
  const [gravando, definirGravando] = useState(false);
  const [gravarDesabilitado, definirGravarDesabilitado] = useState(semMicrofone);
  const [urlAudio, definirUrlAudio] = useState<string | null>(null);
  const [confirmarVisivel, definirConfirmarVisivel] = useState(false);
  const [confirmando, definirConfirmando] = useState(false);
  const [regularizarVisivel, definirRegularizarVisivel] = useState(false);
  const [regularizando, definirRegularizando] = useState(false);
  const [descartada, definirDescartada] = useState(false);

  function soltarMicrofone() {
    for (const faixa of trilhaRef.current?.getTracks() ?? []) faixa.stop();
    trilhaRef.current = null;
    gravadorRef.current = null;
    if (relogioRef.current !== undefined) clearInterval(relogioRef.current);
    if (limiteRef.current !== undefined) clearTimeout(limiteRef.current);
    relogioRef.current = undefined;
    limiteRef.current = undefined;
  }

  function soltarUrl() {
    if (urlAudioRef.current) URL.revokeObjectURL(urlAudioRef.current);
    urlAudioRef.current = null;
  }

  /* `stop` pode chegar depois de sair do caso: a montagem já está inativa, então seu
   * callback não deve transcrever nem tocar a próxima tela. */
  function limpar() {
    if (gravadorRef.current?.state === 'recording') gravadorRef.current.stop();
    soltarMicrofone();
    soltarUrl();
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: só a limpeza de desmontagem, uma vez; `limpar` fecha sobre referências estáveis e não deve reexecutar a cada render.
  useEffect(() => {
    return () => {
      ativaRef.current = false;
      limpar();
    };
  }, []);

  /** Revalidação de acesso: a limpeza de hardware e o esvaziamento da raiz vêm ANTES de
   *  avisar — o fluxo de nova entrada nunca pode encontrar um microfone aberto ou conteúdo
   *  de caso atrás dele. */
  function descartarAcesso(erro: unknown): boolean {
    if (!exigeNovoAcesso(erro)) return false;
    ativaRef.current = false;
    limpar();
    flushSync(() => definirDescartada(true));
    acessoPerdido(erro);
    return true;
  }

  /** Perder a reprodução do original não pode custar o rascunho já transcrito: se o
   * navegador não deixar criar a mídia, a revisão continua, só sem o áudio ao lado. */
  function mostrarOriginal(base64: string, mime: MimeAudio): boolean {
    try {
      soltarUrl();
      const binario = atob(base64);
      const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
      urlAudioRef.current = url;
      definirUrlAudio(url);
      return true;
    } catch {
      urlAudioRef.current = null;
      definirUrlAudio(null);
      return false;
    }
  }

  // Uma gravação de cada vez: preservar referência ao original até concluir revisão e
  // descarte. Publicar o relato continua sendo decisão do Diário.
  const temAudioPendente = () =>
    registroRef.current !== null && registroRef.current.exclusao_estado !== 'confirmada';

  function descreverExclusao(atual: Transcricao) {
    if (atual.exclusao_estado === 'confirmada') {
      definirDestinoTexto(
        'Revisão confirmada e áudio original excluído. O texto, a autoria e o histórico ficam guardados; a gravação não pode mais ser ouvida.',
      );
      definirRegularizarVisivel(false);
      soltarUrl();
      definirUrlAudio(null);
      definirGravarDesabilitado(false);
      return;
    }
    definirGravarDesabilitado(true);
    // Indisponibilidade de armazenamento nunca é apresentada como exclusão concluída.
    definirDestinoTexto(
      atual.exclusao_estado === 'falha'
        ? 'Revisão confirmada e salva. A exclusão do áudio original falhou e continua pendente — o texto não foi perdido.'
        : 'Revisão confirmada e salva. A exclusão do áudio original ficou pendente e ainda não foi confirmada.',
    );
    definirRegularizarVisivel(true);
  }

  async function aoClicarGravar() {
    if (gravarDesabilitado || temAudioPendente() || semMicrofone || !midia) return;
    flushSync(() => {
      definirGravarDesabilitado(true);
      definirEstadoTexto('Pedindo acesso ao microfone…');
    });
    let fluxo: MediaStream;
    try {
      fluxo = await midia.getUserMedia({ audio: true });
    } catch {
      if (!ativaRef.current) return;
      flushSync(() => {
        definirGravarDesabilitado(false);
        definirEstadoTexto(
          'Sem acesso ao microfone. Libere a permissão no navegador ou escreva o relato no campo abaixo.',
        );
      });
      return;
    }
    if (!ativaRef.current) {
      for (const faixa of fluxo.getTracks()) faixa.stop();
      return;
    }
    trilhaRef.current = fluxo;
    const formato = FORMATOS.find((tipo) => Gravador.isTypeSupported?.(tipo) ?? false);
    let gravador: MediaRecorder;
    try {
      gravador = new Gravador(fluxo, formato ? { mimeType: formato } : undefined);
    } catch {
      soltarMicrofone();
      flushSync(() => {
        definirGravarDesabilitado(false);
        definirEstadoTexto(
          'Não foi possível iniciar a gravação. Escreva o relato no campo abaixo.',
        );
      });
      return;
    }
    gravadorRef.current = gravador;
    const pedacos: Blob[] = [];
    const inicio = Date.now();
    gravador.addEventListener('dataavailable', (evento) => {
      if (evento.data.size > 0) pedacos.push(evento.data);
    });
    gravador.addEventListener('stop', async () => {
      if (!ativaRef.current) return;
      const segundos = Math.max(1, Math.round((Date.now() - inicio) / 1000));
      const tipo = gravador.mimeType || pedacos[0]?.type || '';
      soltarMicrofone();
      flushSync(() => {
        definirGravando(false);
        definirGravarDesabilitado(false);
      });
      const blob = new Blob(pedacos, { type: tipo });
      const mime = mimeDoBlob(blob.type);
      if (!mime) {
        definirEstadoTexto('O formato gravado não é aceito. Escreva o relato no campo abaixo.');
        return;
      }
      if (blob.size === 0) {
        definirEstadoTexto('Nada foi gravado. Tente de novo ou escreva o relato abaixo.');
        return;
      }
      if (blob.size > AUDIO_BYTES_MAXIMO) {
        definirEstadoTexto(
          'A gravação ficou grande demais para ser transcrita. Grave um trecho mais curto ou escreva o relato abaixo.',
        );
        return;
      }
      flushSync(() => {
        definirEstadoTexto('Transcrevendo… o texto volta para você revisar.');
        definirGravarDesabilitado(true);
      });
      try {
        const base64 = bytesParaBase64(await bytesDoBlob(blob));
        // A leitura do Blob também é assíncrona: sair do caso durante ela deve impedir o
        // início de uma requisição com o áudio abandonado.
        if (!ativaRef.current) return;
        const resultado = await servico.registrar(pacienteId, {
          audio_base64: base64,
          mime,
          duracao_segundos: Math.min(segundos, duracaoMaxima),
        });
        if (!ativaRef.current) return;
        registroRef.current = resultado;
        // O rascunho não substitui o que já estava escrito: ele é acrescentado, porque
        // apagar texto digitado por causa de uma transcrição seria perder trabalho humano.
        const campo = campoDeTexto(envelope.current);
        if (campo)
          campo.value = campo.value.trim()
            ? `${campo.value.trim()}\n\n${resultado.transcricao}`
            : resultado.transcricao;
        const ouvivel = mostrarOriginal(base64, mime);
        flushSync(() => {
          definirConfirmarVisivel(true);
          definirConfirmando(false);
          definirDestinoTexto(
            'Conclua a revisão e o descarte deste original antes de gravar outro áudio. Você pode continuar editando o texto.',
          );
          definirEstadoTexto(
            ouvivel
              ? 'Rascunho transcrito automaticamente. Ouça o original, corrija o que estiver errado e confirme a revisão — a transcrição sozinha não conta como revisada.'
              : 'Rascunho transcrito automaticamente. Este navegador não conseguiu reproduzir o original aqui; corrija o que estiver errado e confirme a revisão — a transcrição sozinha não conta como revisada.',
          );
        });
      } catch (erro) {
        if (!ativaRef.current) return;
        if (descartarAcesso(erro)) return;
        definirEstadoTexto(
          resultadoIncerto(erro)
            ? 'Não foi possível confirmar se a transcrição foi registrada. Seu texto continua aqui; escreva o relato se preferir não esperar.'
            : `Não foi possível transcrever: ${mensagemFalha(erro)} Escreva o relato no campo abaixo.`,
        );
      } finally {
        if (ativaRef.current) definirGravarDesabilitado(temAudioPendente());
      }
    });
    gravador.start();
    definirGravando(true);
    const atualizar = () => {
      const passados = Math.round((Date.now() - inicio) / 1000);
      definirEstadoTexto(`Gravando… ${passados}s de ${duracaoMaxima}s.`);
    };
    atualizar();
    relogioRef.current = setInterval(atualizar, 1000);
    limiteRef.current = setTimeout(() => {
      if (gravadorRef.current?.state === 'recording') gravadorRef.current.stop();
    }, duracaoMaxima * 1000);
  }

  function aoClicarParar() {
    if (gravadorRef.current?.state === 'recording') gravadorRef.current.stop();
  }

  async function aoClicarConfirmar() {
    const registro = registroRef.current;
    if (!registro) return;
    const campo = campoDeTexto(envelope.current);
    const revisado = campo?.value.trim() ?? '';
    if (!revisado) {
      definirEstadoTexto('Escreva o texto revisado antes de confirmar.');
      campo?.focus();
      return;
    }
    definirConfirmando(true);
    try {
      const atual = await servico.confirmarRevisao(pacienteId, registro.audio_id, revisado);
      if (!ativaRef.current) return;
      registroRef.current = atual;
      flushSync(() => definirConfirmarVisivel(false));
      aoConfirmar(revisado);
      // Confirmada a revisão, o original é descartado sob controle do autor. A exclusão é
      // pedida agora e seu resultado é informado como veio — pendente continua pendente.
      try {
        const depois = await servico.excluirAudio(pacienteId, atual.audio_id);
        if (!ativaRef.current) return;
        registroRef.current = depois;
        flushSync(() => descreverExclusao(depois));
      } catch (erro) {
        if (!ativaRef.current) return;
        if (descartarAcesso(erro)) return;
        flushSync(() => descreverExclusao({ ...atual, exclusao_estado: 'pendente' }));
      }
    } catch (erro) {
      if (!ativaRef.current) return;
      if (descartarAcesso(erro)) return;
      flushSync(() => {
        definirConfirmando(false);
        definirEstadoTexto(
          resultadoIncerto(erro)
            ? 'Não foi possível confirmar o salvamento da revisão. Copie seu texto antes de tentar de novo.'
            : `Não foi possível confirmar a revisão: ${mensagemFalha(erro)}`,
        );
      });
    }
  }

  async function aoClicarRegularizar() {
    const registro = registroRef.current;
    if (!registro) return;
    definirRegularizando(true);
    try {
      // Repetir é seguro: o alvo é um estado terminal do próprio registro, e nenhum outro
      // anexo é tocado.
      const depois = await servico.excluirAudio(pacienteId, registro.audio_id);
      if (!ativaRef.current) return;
      registroRef.current = depois;
      flushSync(() => descreverExclusao(depois));
    } catch (erro) {
      if (!ativaRef.current) return;
      if (descartarAcesso(erro)) return;
      definirDestinoTexto(
        `A exclusão continua pendente: ${mensagemFalha(erro)} O texto revisado segue salvo.`,
      );
    } finally {
      if (ativaRef.current) definirRegularizando(false);
    }
  }

  if (descartada) return null;

  return (
    <section ref={envelope} className="transcricao-audio">
      <h3>Relato por áudio</h3>
      <p>
        {`Grave até ${duracaoMaxima} segundos para receber um rascunho de texto. O rascunho precisa da sua revisão antes de virar relato: o que ficou incerto no áudio continua incerto no texto.`}
      </p>
      <div className="transcricao-comandos">
        <Botao
          peso="secundario"
          hidden={gravando}
          disabled={gravarDesabilitado}
          aoAtivar={() => void aoClicarGravar()}
        >
          Gravar áudio
        </Botao>
        <Botao peso="secundario" hidden={!gravando} aoAtivar={aoClicarParar}>
          Parar gravação
        </Botao>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já usam. */}
      <p role="status" aria-live="polite">
        {estadoTexto}
      </p>
      <AreaTexto
        id={ID_TEXTO}
        rotulo="Texto do relato"
        linhas={6}
        defaultValue={opcoes.textoInicial ?? ''}
      />
      <div className="transcricao-original" hidden={!urlAudio}>
        <p>Áudio original, para conferir enquanto revisa:</p>
        {/* biome-ignore lint/a11y/useMediaCaption: áudio gravado pelo próprio autor, sem faixa de legenda a oferecer. */}
        <audio controls src={urlAudio ?? undefined} />
      </div>
      <Botao
        peso="principal"
        hidden={!confirmarVisivel}
        disabled={confirmando}
        aoAtivar={() => void aoClicarConfirmar()}
      >
        Confirmar revisão
      </Botao>
      <Botao
        peso="secundario"
        hidden={!regularizarVisivel}
        disabled={regularizando}
        aoAtivar={() => void aoClicarRegularizar()}
      >
        Tentar excluir o áudio novamente
      </Botao>
      {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
      <p role="status" aria-live="polite">
        {destinoTexto}
      </p>
    </section>
  );
}

/** Interface isolada; não publica nada — devolve o texto revisado a quem a montou. */
export function montarTranscricaoAudio(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoTranscricao,
  aoConfirmar: (texto: string) => void,
  acessoPerdido: (erro: unknown) => void,
  opcoes: Opcoes = {},
): () => void {
  return ilha(
    raiz,
    <TelaTranscricaoAudio
      pacienteId={pacienteId}
      servico={servico}
      aoConfirmar={aoConfirmar}
      acessoPerdido={acessoPerdido}
      opcoes={opcoes}
    />,
  );
}
