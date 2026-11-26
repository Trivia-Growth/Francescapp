/* Documentos locais da prévia de feedback, reconstruído em React sobre a ilha
 * (`web/ponte/ilha.ts`). Único consumidor é `web/demonstracao.ts` (prévia dev-only).
 *
 * Migração represada até agora pelo mesmo motivo de `web/busca-pacientes-local.ts`
 * (Fase 3.3): `react-dom/client` lê `navigator.userAgent` na avaliação do módulo, e
 * `web/demonstracao.test.ts` testava com um dublê de `navigator` sem essa propriedade.
 * Liberada depois que a coordenação acrescentou `userAgent` ao dublê.
 *
 * O contrato exportado não muda: `montarDocumentosLocais(raiz, dados) => void` — sem
 * desmontagem, porque `demonstracao.ts` chama de novo na MESMA raiz a cada "Abrir
 * documentos" (de paciente diferente ou do mesmo), e `ilha()` já tolera isso.
 *
 * Metadados fictícios; não armazena arquivos nem autoriza acesso. Os anexos ficam no
 * Google Drive institucional — aqui é só a prévia local de feedback. */
import { useState } from 'react';
import { ilha } from './ponte/ilha.js';
import { Formulario } from './telas/formulario.js';

export type DocumentoLocal = { nome: string; categoria: string; metadados?: string };

type Anexo = { id: string; name: string; size: number };

export type DadosDocumentosLocais = {
  documentos: DocumentoLocal[];
  anexos?: Anexo[];
  aoAnexar?: (arquivo: File) => Promise<Anexo>;
  urlAnexo?: (id: string) => string;
  aoRegistrar: (documento: DocumentoLocal) => Promise<void>;
};

function TelaDocumentosLocais({ dados }: { dados: DadosDocumentosLocais }) {
  const [documentos, definirDocumentos] = useState<DocumentoLocal[]>(() => [...dados.documentos]);
  const [mensagem, definirMensagem] = useState('');
  const [enviando, definirEnviando] = useState(false);

  const [anexos, definirAnexos] = useState<Anexo[]>(() => [...(dados.anexos ?? [])]);
  const [statusAnexo, definirStatusAnexo] = useState('');
  const [anexando, definirAnexando] = useState(false);

  async function aoEnviarDocumento(formulario: HTMLFormElement) {
    const nome =
      (formulario.elements.namedItem('nome') as HTMLInputElement | null)?.value.trim() ?? '';
    const categoria =
      (formulario.elements.namedItem('categoria') as HTMLInputElement | null)?.value.trim() ?? '';
    if (!nome || !categoria) {
      definirMensagem('Informe nome e categoria.');
      return;
    }
    const metadadosLimpos =
      (formulario.elements.namedItem('metadados') as HTMLInputElement | null)?.value.trim() ?? '';
    const documento: DocumentoLocal = {
      nome,
      categoria,
      ...(metadadosLimpos ? { metadados: metadadosLimpos } : {}),
    };
    if (dados.documentos.length >= 100) {
      definirMensagem('Limite de 100 documentos nesta prévia.');
      return;
    }
    definirEnviando(true);
    definirMensagem('Guardando documento…');
    try {
      await dados.aoRegistrar(documento);
    } catch {
      definirMensagem(
        'Não foi possível guardar. O rascunho foi preservado; confira a conexão ou reabra a prévia se houve alteração em outra aba.',
      );
      definirEnviando(false);
      return;
    }
    definirEnviando(false);
    dados.documentos.push(documento);
    formulario.reset();
    definirMensagem('Documento registrado nesta prévia.');
    definirDocumentos([...dados.documentos]);
  }

  async function aoEnviarAnexo(formulario: HTMLFormElement) {
    const campo = formulario.elements.namedItem('arquivo') as HTMLInputElement | null;
    const selecionado = campo?.files?.[0];
    if (!selecionado) return;
    if (selecionado.size > 2 * 1024 * 1024 || selecionado.size === 0) {
      definirStatusAnexo('Escolha um arquivo não vazio de até 2 MB.');
      return;
    }
    definirAnexando(true);
    definirStatusAnexo('Anexando…');
    try {
      const anexo = await dados.aoAnexar?.(selecionado);
      if (anexo) dados.anexos?.push(anexo);
      formulario.reset();
      definirAnexando(false);
      definirStatusAnexo('Arquivo fictício anexado.');
      definirAnexos([...(dados.anexos ?? [])]);
    } catch {
      definirAnexando(false);
      definirStatusAnexo('Não foi possível anexar. Confira tipo, tamanho, sessão e conexão local.');
    }
  }

  return (
    <>
      <Formulario aoEnviar={(formulario) => void aoEnviarDocumento(formulario)} noValidate>
        <label>
          Nome
          <input name="nome" required maxLength={200} disabled={enviando} />
        </label>
        <label>
          Categoria
          <input name="categoria" required maxLength={200} disabled={enviando} />
        </label>
        <label>
          Metadados (opcional)
          <input name="metadados" disabled={enviando} />
        </label>
        <button type="submit" className="ui-botao" data-peso="principal" disabled={enviando}>
          Registrar documento
        </button>
      </Formulario>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` no `<p>` é o gancho que a prévia já usa. */}
      <p role="status">{mensagem}</p>
      <ul>
        {documentos.length ? (
          documentos.map((documento, indice) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: prévia local fictícia, sem id estável vindo do servidor.
            <li key={indice}>
              {`${documento.nome} · ${documento.categoria}${
                documento.metadados ? ` · ${documento.metadados}` : ''
              }`}
            </li>
          ))
        ) : (
          <li>Nenhum documento registrado nesta prévia.</li>
        )}
      </ul>
      {dados.anexos && dados.aoAnexar && dados.urlAnexo ? (
        <>
          <h2>Arquivos fictícios</h2>
          <p>PDF, PNG, JPEG ou TXT, até 2 MB. Use somente arquivos fictícios.</p>
          <Formulario aoEnviar={(formulario) => void aoEnviarAnexo(formulario)} noValidate>
            <label>
              Selecionar arquivo fictício
              <input
                type="file"
                name="arquivo"
                accept=".pdf,.png,.jpg,.jpeg,.txt"
                required
                disabled={anexando}
              />
            </label>
            <button type="submit" className="ui-botao" data-peso="secundario" disabled={anexando}>
              Anexar arquivo
            </button>
          </Formulario>
          {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
          <p role="status">{statusAnexo}</p>
          <ul>
            {anexos.length ? (
              anexos.map((anexo) => (
                <li key={anexo.id}>
                  <a href={dados.urlAnexo?.(anexo.id) ?? ''}>
                    {`${anexo.name} (${anexo.size} bytes) — baixar`}
                  </a>
                </li>
              ))
            ) : (
              <li>Nenhum arquivo anexado.</li>
            )}
          </ul>
        </>
      ) : null}
    </>
  );
}

/** Metadados fictícios; não armazena arquivos nem autoriza acesso. */
export function montarDocumentosLocais(raiz: HTMLElement, dados: DadosDocumentosLocais): void {
  ilha(raiz, <TelaDocumentosLocais dados={dados} />);
}
