/* Estado compartilhado de carregamento/salvamento do documento versionado por paciente
 * (FR-005 e FR-002), reconstruído como hook React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * Antes um "hospedeiro" imperativo (`montarEditorDocumentoPaciente`) que recebia um
 * `construir(conteudo, aoAlterar) => CorpoEditor` e desenhava DOM cru. As duas telas que o
 * usam — `contexto-cuidado.tsx` e `rede-cuidado.tsx` — já migraram para componentes React
 * autocontidos, como `anamnese.tsx` e `acessos-administracao.tsx`: por isso o hospedeiro
 * vira um HOOK que só concentra a máquina de estados (consulta, versão, pendência,
 * conflito, nova tentativa), e cada tela monta o próprio formulário.
 *
 * VIS-012: a flag `ativa` do hospedeiro imperativo desapareceu — `ilha()` desmonta a raiz
 * React e cancela os efeitos por construção. As guardas que restam (`valida` nos efeitos)
 * são de GERAÇÃO, não de ciclo de vida: impedem uma resposta antiga sobrescrever uma mais
 * nova, coisa diferente.
 *
 * O que NÃO mudou (VIS-018): a revalidação de acesso antes de cada escrita, o protocolo de
 * salvamento incerto ("Tentar confirmar salvamento" reaproveita a mesma chave de
 * idempotência), o bloqueio de novo envio em conflito de versão, e a troca de rascunho por
 * UMA mensagem de confirmação quando o salvamento é bem-sucedido. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import type { ServicoDocumentoPaciente } from './servico-documento-paciente-http.js';

export type ColetaEditorDocumento<T> = { conteudo: T } | { aviso: string; foco?: HTMLElement };

export type TextosEditorDocumento = {
  carregando: string;
  salvando: string;
  salvo: string;
  conflito: string;
};

type Consulta<T> =
  | { fase: 'carregando' }
  | { fase: 'pronta'; conteudo: T | null }
  | { fase: 'erro'; erro: unknown };

export type EditorDocumento<T> = {
  consulta: Consulta<T>;
  /** Incrementa a cada conteúdo novo (carga inicial, nova tentativa ou salvamento
   *  confirmado). A tela usa como `key` do corpo para reconstruir o rascunho do zero,
   *  igual ao `desenhar()` da versão imperativa. */
  geracao: number;
  aviso: string;
  enviando: boolean;
  retryVisivel: boolean;
  conflitoVersao: boolean;
  temPendente: boolean;
  descartada: boolean;
  tentarNovamenteConsulta: () => void;
  /** Chamado pelo envio do formulário com o resultado de `coletar()` da tela. */
  enviarColetado: (coletado: ColetaEditorDocumento<T>) => void;
  confirmarRetry: () => void;
  /** Exposta para fluxos auxiliares da tela (ex.: paginação de uma lista relacionada)
   *  revalidarem acesso do mesmo jeito que o envio principal. */
  descartarAcesso: (erro: unknown) => boolean;
};

export function usarEditorDocumentoPaciente<T>(
  pacienteId: string,
  servico: ServicoDocumentoPaciente<T>,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void,
  textos: TextosEditorDocumento,
): EditorDocumento<T> {
  const [consulta, definirConsulta] = useState<Consulta<T>>({ fase: 'carregando' });
  const [tentativaConsulta, definirTentativaConsulta] = useState(0);
  const [descartada, definirDescartada] = useState(false);
  const [geracao, definirGeracao] = useState(0);

  const [aviso, definirAviso] = useState('');
  const [enviando, definirEnviando] = useState(false);
  const [retryVisivel, definirRetryVisivel] = useState(false);
  const [conflitoVersao, definirConflitoVersao] = useState(false);

  const versaoRef = useRef(0);
  const pendenteRef = useRef<{ conteudo: T; chave: string } | null>(null);
  const [temPendente, marcarPendente] = useState(false);
  const definirPendente = useCallback((valor: { conteudo: T; chave: string } | null) => {
    pendenteRef.current = valor;
    marcarPendente(valor !== null);
  }, []);

  const avisarPendente = useRef(alteracaoPendente);
  avisarPendente.current = alteracaoPendente;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;
  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;
  const textosAtuais = useRef(textos);
  textosAtuais.current = textos;

  /** Revalidação de acesso: a pendência é descartada ANTES de avisar, como na versão
   *  imperativa (`ativa = false; pendente = null;` antes de `acessoPerdido`). */
  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    pendenteRef.current = null;
    flushSync(() => definirDescartada(true));
    avisarPerda.current(erro);
    return true;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tentativaConsulta` não é lida no corpo de propósito — é o GATILHO que "Tentar novamente" incrementa.
  useEffect(() => {
    let valida = true;
    definirConsulta({ fase: 'carregando' });
    servicoAtual.current
      .consultar(pacienteId)
      .then((resultado) => {
        if (!valida) return;
        flushSync(() => {
          versaoRef.current = resultado?.versao ?? 0;
          definirConsulta({ fase: 'pronta', conteudo: resultado?.conteudo ?? null });
          definirGeracao((atual) => atual + 1);
          definirAviso('');
          definirRetryVisivel(false);
          definirConflitoVersao(false);
        });
      })
      .catch((erro: unknown) => {
        if (!valida || descartarAcesso(erro)) return;
        flushSync(() => definirConsulta({ fase: 'erro', erro }));
      });
    return () => {
      valida = false;
    };
  }, [pacienteId, tentativaConsulta, descartarAcesso]);

  const enviar = useCallback(async () => {
    const reservado = pendenteRef.current;
    if (!reservado) return;
    definirEnviando(true);
    definirAviso(textosAtuais.current.salvando);
    try {
      const salvo = await servicoAtual.current.salvar(
        pacienteId,
        versaoRef.current,
        reservado.conteudo,
        reservado.chave,
      );
      definirPendente(null);
      avisarPendente.current(false);
      flushSync(() => {
        versaoRef.current = salvo?.versao ?? 0;
        definirEnviando(false);
        definirConsulta({ fase: 'pronta', conteudo: salvo?.conteudo ?? null });
        definirGeracao((atual) => atual + 1);
        definirRetryVisivel(false);
        definirConflitoVersao(false);
        definirAviso(textosAtuais.current.salvo);
      });
    } catch (erro: unknown) {
      if (descartarAcesso(erro)) return;
      if (resultadoIncerto(erro)) {
        /* A reserva CONTINUA de pé: o envio pode ter sido gravado e a resposta se perdido.
           Salvar e Adicionar seguem travados até a confirmação usar a MESMA chave. */
        flushSync(() => {
          definirEnviando(false);
          definirRetryVisivel(true);
          definirAviso(
            'Não foi possível confirmar o salvamento. Tente confirmar antes de editar novamente.',
          );
        });
        return;
      }
      definirPendente(null);
      const conflito = erro instanceof FalhaApi && erro.codigo === 'conflito_versao';
      flushSync(() => {
        definirEnviando(false);
        definirConflitoVersao(conflito);
        definirRetryVisivel(false);
        definirAviso(conflito ? textosAtuais.current.conflito : mensagemFalha(erro));
      });
    }
  }, [pacienteId, definirPendente, descartarAcesso]);

  const enviarColetado = useCallback(
    (coletado: ColetaEditorDocumento<T>) => {
      if (pendenteRef.current || conflitoVersao) return;
      if ('aviso' in coletado) {
        definirAviso(coletado.aviso);
        coletado.foco?.focus();
        return;
      }
      definirPendente({ conteudo: coletado.conteudo, chave: crypto.randomUUID() });
      avisarPendente.current(true);
      void enviar();
    },
    [definirPendente, enviar, conflitoVersao],
  );

  return {
    consulta,
    geracao,
    aviso,
    enviando,
    retryVisivel,
    conflitoVersao,
    temPendente,
    descartada,
    tentarNovamenteConsulta: () => definirTentativaConsulta((valor) => valor + 1),
    enviarColetado,
    confirmarRetry: () => void enviar(),
    descartarAcesso,
  };
}
