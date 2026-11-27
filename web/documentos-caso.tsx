/* Documentos do caso (FR-029 a FR-031), reconstruído em React sobre a ilha
 * (`web/ponte/ilha.ts`).
 *
 * VIS-012: a flag `ativa` desapareceu — `ilha()` desmonta a raiz React e cancela os
 * efeitos por construção. As guardas que restam (`valida` nos efeitos) são de GERAÇÃO,
 * não de ciclo de vida: impedem uma resposta antiga sobrescrever uma mais nova.
 *
 * O que NÃO mudou (VIS-018):
 * - anexos ficam no Google Drive institucional; o anexo que sumiu do Drive continua na
 *   lista, marcado "Não encontrado", com a orientação de regularização;
 * - classificar categoria e confirmar audiência fazem parte de concluir o envio — o botão
 *   só habilita com os dois escolhidos;
 * - família só vê a lista e o botão de baixar, nunca o formulário de envio nem o editor de
 *   metadados;
 * - o protocolo de edição é idêntico: "Conferir resultado" após salvamento incerto
 *   mantém a MESMA chave de idempotência para repetir com segurança, e os campos
 *   continuam desabilitados enquanto o resultado não é confirmado;
 * - o download continua indireto: Blob + link temporário removido logo após o clique, URL
 *   revogada em até 1s OU na desmontagem, o que vier primeiro.
 *
 * Uma gravação bem-sucedida (envio novo, edição salva ou "conferir resultado" confirmado)
 * reconstrói a lista inteira a partir da resposta do servidor — igual à versão imperativa,
 * que chamava `desenhar()` de novo e perdia qualquer edição em andamento em OUTRA linha.
 * Aqui isso vira um contador `geracao` que remonta a lista e o formulário de envio via
 * `key`, sem reimplementar a perda de rascunho à mão. */
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { TAMANHO_MAXIMO_DOCUMENTO } from '../packages/contracts/src/documento-caso.js';
import type {
  AudienciaDocumento,
  DocumentoCaso,
  EstadoDocumento,
} from '../packages/contracts/src/documento-caso.js';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import { Botao } from './componentes/ui/botao.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { ilha } from './ponte/ilha.js';
import type { ServicoDocumentos } from './servico-documentos-http.js';
import { Formulario } from './telas/formulario.js';

const AUDIENCIAS = [
  ['equipe', 'Só a equipe'],
  ['equipe_e_familia', 'Equipe e família'],
] as const;

const ESTADOS_EDICAO = [
  ['disponivel', 'Disponível'],
  ['indisponivel', 'Indisponível'],
  ['removido', 'Removido'],
] as const;

const rotuloAudiencia = (valor: AudienciaDocumento) =>
  AUDIENCIAS.find(([chave]) => chave === valor)?.[1] ?? valor;

const rotuloEstado = (valor: EstadoDocumento) =>
  valor === 'disponivel' ? 'Disponível' : valor === 'indisponivel' ? 'Não encontrado' : 'Removido';

function EsqueletoCompacto() {
  return (
    <div className="list-loading" data-compacto="" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function IndicadorAcao() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

type EntradaGravar = Parameters<ServicoDocumentos['gravar']>[1];

function FormularioEnvio({
  pacienteId,
  servico,
  obterCategorias,
  alteracaoPendente,
  descartarAcesso,
  aoGravado,
}: {
  pacienteId: string;
  servico: ServicoDocumentos;
  obterCategorias: () => readonly string[];
  alteracaoPendente: (pendente: boolean) => void;
  descartarAcesso: (erro: unknown) => boolean;
  aoGravado: (documentos: DocumentoCaso[]) => void;
}) {
  const [enviando, definirEnviando] = useState(false);
  const [aviso, definirAviso] = useState('');
  const arquivoRef = useRef<HTMLInputElement>(null);
  const categoriaRef = useRef<HTMLSelectElement>(null);
  const categorias = obterCategorias();

  const marcarPendente = () => {
    alteracaoPendente(
      arquivoRef.current?.files && arquivoRef.current.files.length > 0
        ? true
        : categoriaRef.current?.value !== '',
    );
  };

  const enviar = async (formulario: HTMLFormElement) => {
    const arquivo = formulario.elements.namedItem('arquivo') as HTMLInputElement | null;
    const categoria = formulario.elements.namedItem('categoria') as HTMLSelectElement | null;
    const origem = formulario.elements.namedItem('origem') as HTMLInputElement | null;
    const data = formulario.elements.namedItem('data') as HTMLInputElement | null;
    const audiencia = formulario.elements.namedItem('audiencia') as HTMLSelectElement | null;
    const escolhido = arquivo?.files?.[0];
    if (!escolhido) {
      definirAviso('Escolha um arquivo para anexar.');
      return;
    }
    if (escolhido.size === 0 || escolhido.size > TAMANHO_MAXIMO_DOCUMENTO) {
      definirAviso('Escolha um arquivo de até 4 MiB.');
      return;
    }
    if (!categoria?.value || !audiencia?.value) {
      definirAviso('Classifique o anexo e confirme quem pode vê-lo antes de concluir.');
      return;
    }
    definirEnviando(true);
    definirAviso('Enviando…');
    try {
      const documentos = await servico.gravar(pacienteId, {
        documento_id: crypto.randomUUID(),
        versao_esperada: 0,
        metadado: {
          categoria: categoria.value,
          ...(origem?.value.trim() ? { origem: origem.value.trim() } : {}),
          ...(data?.value ? { data_documento: data.value } : {}),
          audiencia: audiencia.value as AudienciaDocumento,
          estado: 'disponivel',
        },
        // O identificador real vem do Drive, no servidor; este valor é substituído lá.
        conteudo: { nome_visivel: escolhido.name, drive_file_id: 'pendente' },
        arquivo: escolhido,
      });
      alteracaoPendente(false);
      aoGravado(documentos);
    } catch (erro) {
      if (descartarAcesso(erro)) return;
      flushSync(() => {
        definirEnviando(false);
        definirAviso(
          resultadoIncerto(erro)
            ? 'O envio pode ter sido concluído. Confira a lista antes de tentar de novo.'
            : erro instanceof FalhaApi
              ? mensagemFalha(erro)
              : 'Não foi possível anexar o documento. Tente novamente.',
        );
      });
    }
  };

  return (
    <Formulario
      className="documentos-envio"
      aoEnviar={(formulario) => void enviar(formulario)}
      noValidate
    >
      <h3>Anexar documento</h3>
      <label htmlFor="documento-arquivo">Arquivo</label>
      <input
        ref={arquivoRef}
        id="documento-arquivo"
        name="arquivo"
        type="file"
        required
        onChange={marcarPendente}
      />
      <label htmlFor="documento-categoria">Categoria</label>
      <select
        ref={categoriaRef}
        id="documento-categoria"
        name="categoria"
        required
        defaultValue=""
        onChange={marcarPendente}
      >
        <option value="">Escolha a categoria</option>
        {categorias.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <label htmlFor="documento-origem">Origem (opcional)</label>
      <input id="documento-origem" name="origem" maxLength={120} />
      <label htmlFor="documento-data">Data do documento (opcional)</label>
      <input id="documento-data" name="data" type="date" />
      <label htmlFor="documento-audiencia">Quem pode ver</label>
      <select id="documento-audiencia" name="audiencia" required defaultValue="">
        <option value="">Confirme quem pode ver</option>
        {AUDIENCIAS.map(([valor, rotulo]) => (
          <option key={valor} value={valor}>
            {rotulo}
          </option>
        ))}
      </select>
      <Botao tipo="submit" peso="principal" disabled={enviando || categorias.length === 0}>
        Anexar
        {enviando ? <IndicadorAcao /> : null}
      </Botao>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` no `<p>` é o gancho que a tela já usa. */}
      <p role="status">
        {categorias.length === 0
          ? 'Nenhuma categoria de anexo está configurada. A administração define as categorias antes do primeiro envio.'
          : aviso}
      </p>
    </Formulario>
  );
}

function EditorDocumentoCaso({
  documento,
  pacienteId,
  servico,
  obterCategorias,
  alteracaoPendente,
  descartarAcesso,
  aoAtualizarDocumentos,
}: {
  documento: DocumentoCaso;
  pacienteId: string;
  servico: ServicoDocumentos;
  obterCategorias: () => readonly string[];
  alteracaoPendente: (pendente: boolean) => void;
  descartarAcesso: (erro: unknown) => boolean;
  aoAtualizarDocumentos: (documentos: DocumentoCaso[]) => void;
}) {
  const [bloqueado, definirBloqueado] = useState(false);
  const [ocupada, definirOcupada] = useState(false);
  const [conferirVisivel, definirConferirVisivel] = useState(false);
  const [salvarTexto, definirSalvarTexto] = useState('Salvar dados');
  const [aviso, definirAviso] = useState('');
  const pendenteRef = useRef<EntradaGravar | null>(null);
  const categoriasAtuais = obterCategorias();

  const enviar = useCallback(async () => {
    const reservado = pendenteRef.current;
    if (!reservado) return;
    definirOcupada(true);
    definirAviso('Salvando dados…');
    try {
      const atualizados = await servico.gravar(pacienteId, reservado);
      aoAtualizarDocumentos(atualizados);
      alteracaoPendente(false);
    } catch (erro) {
      if (descartarAcesso(erro)) return;
      if (resultadoIncerto(erro)) {
        flushSync(() => {
          definirOcupada(false);
          definirConferirVisivel(true);
          definirSalvarTexto('Repetir mesma alteração');
          definirAviso(
            'A alteração pode ter sido salva. Confira o resultado ou repita a mesma alteração com segurança.',
          );
        });
        alteracaoPendente(true);
        return;
      }
      pendenteRef.current = null;
      flushSync(() => {
        definirOcupada(false);
        definirBloqueado(false);
        definirAviso(
          erro instanceof FalhaApi
            ? mensagemFalha(erro)
            : 'Não foi possível salvar os dados. Tente novamente.',
        );
      });
    }
  }, [pacienteId, servico, descartarAcesso, alteracaoPendente, aoAtualizarDocumentos]);

  const conferirResultado = async () => {
    const reservado = pendenteRef.current;
    if (ocupada || !reservado) return;
    definirOcupada(true);
    definirAviso('Conferindo versão atual…');
    try {
      const atualizados = await servico.consultar(pacienteId);
      const atual = atualizados.find((item) => item.documento_id === documento.documento_id);
      const esperado = reservado.metadado;
      if (
        atual &&
        atual.versao > reservado.versao_esperada &&
        atual.categoria === esperado.categoria &&
        atual.origem === esperado.origem &&
        atual.data_documento === esperado.data_documento &&
        atual.audiencia === esperado.audiencia &&
        atual.estado === esperado.estado
      ) {
        aoAtualizarDocumentos(atualizados);
        alteracaoPendente(false);
      } else {
        flushSync(() => {
          definirOcupada(false);
          definirAviso(
            atual && atual.versao !== reservado.versao_esperada
              ? 'Outra versão está disponível. A alteração pendente foi preservada; repetir verificará o conflito sem substituir a versão atual.'
              : 'A alteração ainda não aparece. Repita a mesma alteração para confirmar o resultado.',
          );
        });
      }
    } catch (erro) {
      if (descartarAcesso(erro)) return;
      flushSync(() => {
        definirOcupada(false);
        definirAviso('Não foi possível conferir. A alteração pendente continua preservada.');
      });
    }
  };

  const aoEnviarFormulario = (formulario: HTMLFormElement) => {
    if (ocupada) return;
    flushSync(() => definirBloqueado(true));
    alteracaoPendente(true);
    pendenteRef.current ??= {
      documento_id: documento.documento_id,
      versao_esperada: documento.versao,
      chave_idempotencia: crypto.randomUUID(),
      metadado: {
        categoria: (formulario.elements.namedItem('categoria') as HTMLSelectElement).value.trim(),
        ...((formulario.elements.namedItem('origem') as HTMLInputElement).value.trim()
          ? { origem: (formulario.elements.namedItem('origem') as HTMLInputElement).value.trim() }
          : {}),
        ...((formulario.elements.namedItem('data') as HTMLInputElement).value
          ? { data_documento: (formulario.elements.namedItem('data') as HTMLInputElement).value }
          : {}),
        audiencia: (formulario.elements.namedItem('audiencia') as HTMLSelectElement)
          .value as DocumentoCaso['audiencia'],
        estado: (formulario.elements.namedItem('estado') as HTMLSelectElement)
          .value as DocumentoCaso['estado'],
      },
      conteudo: {
        nome_visivel: documento.nome_visivel,
        drive_file_id: documento.drive_file_id,
        ...(documento.descricao === undefined ? {} : { descricao: documento.descricao }),
      },
    };
    void enviar();
  };

  return (
    <details>
      <summary>Editar dados do documento</summary>
      <Formulario className="documentos-envio" aoEnviar={aoEnviarFormulario} noValidate>
        <label htmlFor={`documento-${documento.documento_id}-categoria`}>Categoria</label>
        <select
          id={`documento-${documento.documento_id}-categoria`}
          name="categoria"
          required
          disabled={bloqueado}
          defaultValue={documento.categoria}
        >
          {!categoriasAtuais.includes(documento.categoria) ? (
            <option value={documento.categoria}>
              {`${documento.categoria} (categoria anterior, preservada)`}
            </option>
          ) : null}
          {categoriasAtuais.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
          ))}
        </select>
        <label htmlFor={`documento-${documento.documento_id}-origem`}>Origem (opcional)</label>
        <input
          id={`documento-${documento.documento_id}-origem`}
          name="origem"
          maxLength={120}
          disabled={bloqueado}
          defaultValue={documento.origem ?? ''}
        />
        <label htmlFor={`documento-${documento.documento_id}-data`}>
          Data do documento (opcional)
        </label>
        <input
          id={`documento-${documento.documento_id}-data`}
          name="data"
          type="date"
          disabled={bloqueado}
          defaultValue={documento.data_documento ?? ''}
        />
        <label htmlFor={`documento-${documento.documento_id}-audiencia`}>Quem pode ver</label>
        <select
          id={`documento-${documento.documento_id}-audiencia`}
          name="audiencia"
          disabled={bloqueado}
          defaultValue={documento.audiencia}
        >
          {AUDIENCIAS.map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
        <label htmlFor={`documento-${documento.documento_id}-estado`}>Estado do arquivo</label>
        <select
          id={`documento-${documento.documento_id}-estado`}
          name="estado"
          disabled={bloqueado}
          defaultValue={documento.estado}
        >
          {ESTADOS_EDICAO.map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
        <p>
          Alterar dados mantém o arquivo e o histórico. Removido oculta o acesso pelo app; não
          exclui o arquivo do Drive.
        </p>
        <Botao tipo="submit" peso="principal" disabled={ocupada}>
          {salvarTexto}
          {ocupada ? <IndicadorAcao /> : null}
        </Botao>
        <Botao
          peso="secundario"
          hidden={!conferirVisivel}
          disabled={ocupada}
          aoAtivar={() => void conferirResultado()}
        >
          Conferir resultado
          {ocupada ? <IndicadorAcao /> : null}
        </Botao>
        {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
        <p role="status">{aviso}</p>
      </Formulario>
    </details>
  );
}

function BotaoBaixar({
  documento,
  pacienteId,
  servico,
  raiz,
  downloadsRef,
  descartarAcesso,
}: {
  documento: DocumentoCaso;
  pacienteId: string;
  servico: ServicoDocumentos;
  raiz: HTMLElement;
  downloadsRef: RefObject<Set<string>>;
  descartarAcesso: (erro: unknown) => boolean;
}) {
  const [ocupado, definirOcupado] = useState(false);
  const [feedback, definirFeedback] = useState('');

  const aoClicar = async () => {
    if (ocupado || !servico.baixar) return;
    definirOcupado(true);
    definirFeedback('Preparando arquivo…');
    try {
      const blob = await servico.baixar(pacienteId, documento.documento_id);
      const url = URL.createObjectURL(blob);
      downloadsRef.current.add(url);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        documento.nome_visivel.replace(/[\p{C}/\\"<>:|?*]/gu, '_').slice(0, 180) || 'documento';
      link.hidden = true;
      raiz.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
          downloadsRef.current.delete(url);
        }, 1000);
      }
      flushSync(() => {
        definirOcupado(false);
        definirFeedback('Arquivo enviado ao navegador para download. Confira seus downloads.');
      });
    } catch (erro) {
      if (descartarAcesso(erro)) return;
      flushSync(() => {
        definirOcupado(false);
        definirFeedback(
          erro instanceof FalhaApi
            ? mensagemFalha(erro)
            : 'Não foi possível baixar o arquivo. Tente novamente.',
        );
      });
    }
  };

  return (
    <>
      <Botao
        peso="discreto"
        rotuloLeitura={`Baixar ${documento.nome_visivel}`}
        disabled={ocupado}
        aoAtivar={() => void aoClicar()}
      >
        Baixar arquivo
        {ocupado ? <IndicadorAcao /> : null}
      </Botao>
      {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
      <p role="status">{feedback}</p>
    </>
  );
}

function LinhaDocumento({
  documento,
  pacienteId,
  servico,
  obterCategorias,
  acessoPerdido,
  alteracaoPendente,
  ehFamilia,
  raiz,
  downloadsRef,
  aoAtualizarDocumentos,
  descartarAcesso,
}: {
  documento: DocumentoCaso;
  pacienteId: string;
  servico: ServicoDocumentos;
  obterCategorias: () => readonly string[];
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
  ehFamilia: boolean;
  raiz: HTMLElement;
  downloadsRef: RefObject<Set<string>>;
  aoAtualizarDocumentos: (documentos: DocumentoCaso[]) => void;
  descartarAcesso: (erro: unknown) => boolean;
}) {
  const detalhe = [
    documento.categoria,
    documento.origem,
    documento.data_documento,
    rotuloAudiencia(documento.audiencia),
    `versão ${documento.versao}`,
  ]
    .filter((parte): parte is string => typeof parte === 'string' && parte.length > 0)
    .join(' · ');

  return (
    <li className={`documento-item documento-item--${documento.estado}`}>
      <p className="documento-item__nome">{documento.nome_visivel}</p>
      <p className="documento-item__meta">{detalhe}</p>
      <span className="documento-item__estado">{rotuloEstado(documento.estado)}</span>
      {documento.estado === 'disponivel' && servico.baixar ? (
        <BotaoBaixar
          documento={documento}
          pacienteId={pacienteId}
          servico={servico}
          raiz={raiz}
          downloadsRef={downloadsRef}
          descartarAcesso={descartarAcesso}
        />
      ) : null}
      {!ehFamilia ? (
        <EditorDocumentoCaso
          documento={documento}
          pacienteId={pacienteId}
          servico={servico}
          obterCategorias={obterCategorias}
          alteracaoPendente={alteracaoPendente}
          descartarAcesso={descartarAcesso}
          aoAtualizarDocumentos={aoAtualizarDocumentos}
        />
      ) : null}
      {!ehFamilia && documento.compartilhamento ? (
        <p>
          {documento.compartilhamento === 'divergente'
            ? 'Pendência: compartilhamento no Drive incompatível com a audiência. Coordenação deve revisar na origem.'
            : documento.compartilhamento === 'indisponivel'
              ? 'Pendência: não foi possível conferir compartilhamento no Drive.'
              : 'Pendência: coordenação deve conferir destinatários do Drive com a audiência do caso.'}
        </p>
      ) : null}
      {documento.estado === 'indisponivel' ? (
        <p className="documento-item__orientacao">
          Este arquivo não foi encontrado no Drive da Francescato. Procure a administração para
          regularizar antes de contar com ele.
        </p>
      ) : null}
    </li>
  );
}

function ListaDocumentos(props: {
  documentos: readonly DocumentoCaso[];
  pacienteId: string;
  servico: ServicoDocumentos;
  obterCategorias: () => readonly string[];
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
  ehFamilia: boolean;
  raiz: HTMLElement;
  downloadsRef: RefObject<Set<string>>;
  aoAtualizarDocumentos: (documentos: DocumentoCaso[]) => void;
  descartarAcesso: (erro: unknown) => boolean;
}) {
  if (!props.documentos.length)
    return <EstadoVazio titulo="Nenhum documento anexado a este caso ainda." />;
  return (
    <ul className="documentos-lista">
      {props.documentos.map((documento) => (
        <LinhaDocumento key={documento.documento_id} documento={documento} {...props} />
      ))}
    </ul>
  );
}

/** FR-029 a FR-031: anexos do caso guardados no Google Drive institucional. */
function TelaDocumentosCaso({
  raiz,
  pacienteId,
  servico,
  obterCategorias,
  acessoPerdido,
  alteracaoPendente,
  ehFamilia,
}: {
  raiz: HTMLElement;
  pacienteId: string;
  servico: ServicoDocumentos;
  obterCategorias: () => readonly string[];
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
  ehFamilia: boolean;
}) {
  const [fase, definirFase] = useState<'carregando' | 'pronta' | 'erro'>('carregando');
  const [erroCarregamento, definirErroCarregamento] = useState<unknown>(null);
  const [documentos, definirDocumentos] = useState<DocumentoCaso[]>([]);
  const [geracao, definirGeracao] = useState(0);
  const [descartada, definirDescartada] = useState(false);
  const downloadsRef = useRef<Set<string>>(new Set());
  const acessoPerdidoRef = useRef(acessoPerdido);
  acessoPerdidoRef.current = acessoPerdido;
  const alteracaoPendenteRef = useRef(alteracaoPendente);
  alteracaoPendenteRef.current = alteracaoPendente;
  const servicoRef = useRef(servico);
  servicoRef.current = servico;

  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    flushSync(() => definirDescartada(true));
    acessoPerdidoRef.current(erro);
    return true;
  }, []);

  useEffect(() => {
    let valida = true;
    servicoRef.current
      .consultar(pacienteId)
      .then((lista) => {
        if (!valida) return;
        flushSync(() => {
          definirDocumentos(lista);
          definirGeracao((atual) => atual + 1);
          definirFase('pronta');
        });
      })
      .catch((erro: unknown) => {
        if (!valida || descartarAcesso(erro)) return;
        flushSync(() => {
          definirErroCarregamento(erro);
          definirFase('erro');
        });
      });
    return () => {
      valida = false;
    };
  }, [pacienteId, descartarAcesso]);

  useEffect(
    () => () => {
      for (const url of downloadsRef.current) URL.revokeObjectURL(url);
      downloadsRef.current.clear();
      alteracaoPendenteRef.current(false);
    },
    [],
  );

  const aoAtualizarDocumentos = useCallback((novos: DocumentoCaso[]) => {
    flushSync(() => {
      definirDocumentos(novos);
      definirGeracao((atual) => atual + 1);
    });
  }, []);

  if (descartada) return null;

  if (fase === 'carregando')
    return (
      <>
        <EsqueletoCompacto />
        {/* biome-ignore lint/a11y/useSemanticElements: idem anamnese.tsx. */}
        <p role="status">Carregando documentos…</p>
      </>
    );

  if (fase === 'erro')
    return (
      // biome-ignore lint/a11y/useSemanticElements: idem.
      <p role="status">
        {erroCarregamento instanceof FalhaApi
          ? mensagemFalha(erroCarregamento)
          : 'Não foi possível carregar os documentos. Tente novamente.'}
      </p>
    );

  return (
    <section className="secao-documentos">
      {!ehFamilia ? (
        <FormularioEnvio
          key={geracao}
          pacienteId={pacienteId}
          servico={servico}
          obterCategorias={obterCategorias}
          alteracaoPendente={alteracaoPendente}
          descartarAcesso={descartarAcesso}
          aoGravado={aoAtualizarDocumentos}
        />
      ) : null}
      <ListaDocumentos
        key={geracao}
        documentos={documentos}
        pacienteId={pacienteId}
        servico={servico}
        obterCategorias={obterCategorias}
        acessoPerdido={acessoPerdido}
        alteracaoPendente={alteracaoPendente}
        ehFamilia={ehFamilia}
        raiz={raiz}
        downloadsRef={downloadsRef}
        aoAtualizarDocumentos={aoAtualizarDocumentos}
        descartarAcesso={descartarAcesso}
      />
    </section>
  );
}

export function montarDocumentosCaso(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoDocumentos,
  obterCategorias: () => readonly string[],
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
  ehFamilia = false,
): () => void {
  return ilha(
    raiz,
    <TelaDocumentosCaso
      raiz={raiz}
      pacienteId={pacienteId}
      servico={servico}
      obterCategorias={obterCategorias}
      acessoPerdido={acessoPerdido}
      alteracaoPendente={alteracaoPendente}
      ehFamilia={ehFamilia}
    />,
  );
}
