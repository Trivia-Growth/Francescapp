import {
  type ComponentProps,
  type FormEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Aba, Abas, FaixaAbas, PainelAba } from './componentes/ui/abas.js';
import { Botao, type PesoBotao } from './componentes/ui/botao.js';
import { CampoData } from './componentes/ui/campo-data.js';
import type {
  ApuracaoRepasse,
  DespesaVersao,
  ValorAcordado,
} from '../packages/contracts/src/index.ts';
import {
  MIMES_COMPROVANTE,
  TAMANHO_MAXIMO_COMPROVANTE_BYTES,
} from '../packages/contracts/src/financeiro.ts';
import { nomeComprovante, type ServicoFinanceiro } from './servico-financeiro-http.js';

/** Valor é inteiro em centavos no contrato. A conversão vive só aqui: nenhuma tela manda
 * número com vírgula para o servidor, e nenhum contrato carrega texto formatado. */
export function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Aceita "1234,56", "1234.56" e "1234". Recusa qualquer outra coisa devolvendo null — não
 * arredonda, não adivinha e não aceita número negativo ou com mais de dois decimais. */
export function lerCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '').replace(/^R\$/, '');
  if (!/^\d{1,9}([.,]\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, decimal = ''] = limpo.replace(',', '.').split('.');
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(centavos) && centavos > 0 ? centavos : null;
}

const SITUACOES: Record<string, string> = {
  apurada: 'Apurada',
  pendente_resolucao: 'Turno em aberto, pendente de resolução',
  pendente_valor: 'Sem valor vigente na data',
};

type IdAba = 'valores' | 'despesas' | 'apuracao';

const ABAS: { id: IdAba; rotulo: string }[] = [
  { id: 'valores', rotulo: 'Valor por turno' },
  { id: 'despesas', rotulo: 'Despesas do caso' },
  { id: 'apuracao', rotulo: 'Apuração' },
];

function codigoDe(erro: unknown): string {
  return erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
}

type Contexto = { profissionalPadrao?: string; casoPadrao?: string };

/** Campo de texto no mesmo desenho da área: rótulo e controle numa coluna. O valor fica no
 * DOM (não controlado) e é lido pela referência no envio, como a tela imperativa fazia. */
function CampoTexto({
  rotulo,
  entrada,
  ...extras
}: {
  rotulo: string;
  entrada?: RefObject<HTMLInputElement | null>;
} & Omit<ComponentProps<'input'>, 'ref' | 'id'>) {
  const id = useId();
  return (
    <p className="financeiro__campo">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} ref={entrada} {...extras} />
    </p>
  );
}

function CampoDataFinanceiro({
  rotulo,
  entrada,
}: {
  rotulo: string;
  entrada: RefObject<HTMLInputElement | null>;
}) {
  return (
    <CampoData
      id={useId()}
      ref={entrada}
      rotulo={rotulo}
      required
      classeEnvelope="financeiro__campo"
    />
  );
}

/** Linha de estado anunciada: sempre montada, o texto muda. */
function Recado({ classe, texto }: { classe: string; texto: string }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as telas e as provas já usam.
    <p className={classe} role="status" aria-live="polite">
      {texto}
    </p>
  );
}

function BotaoOcupavel({
  ocupado,
  children,
  ...resto
}: {
  ocupado: boolean;
  peso?: PesoBotao;
  hidden?: boolean;
  tipo?: 'button' | 'submit';
  aoAtivar?: () => void;
  children: ReactNode;
}) {
  return (
    <Botao {...resto} disabled={ocupado} aria-busy={ocupado || undefined}>
      {children}
      {ocupado ? <span className="loading-indicator" aria-hidden="true" /> : null}
    </Botao>
  );
}

type Ciclo<T> =
  | { fase: 'ocioso' }
  | { fase: 'carregando' }
  | { fase: 'ok'; dados: T }
  | { fase: 'erro'; codigo: string };

/** Consulta com resposta atrasada descartada: só vale a última pedida e só enquanto o
 * painel está montado. Trocar de aba, sair da área ou perder a audiência desmonta o painel
 * e a resposta que chegar depois não pinta nada. Erro nunca vira lista vazia nem dado. */
function useCiclo<T>() {
  const [estado, definir] = useState<Ciclo<T>>({ fase: 'ocioso' });
  const geracao = useRef(0);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      // Invalida o que ainda está em voo.
      geracao.current += 1;
    };
  }, []);
  const executar = async (consultar: () => Promise<T>) => {
    if (!vivo.current) return;
    const minha = ++geracao.current;
    definir({ fase: 'carregando' });
    try {
      const dados = await consultar();
      if (geracao.current === minha) definir({ fase: 'ok', dados });
    } catch (erro) {
      if (geracao.current === minha) definir({ fase: 'erro', codigo: codigoDe(erro) });
    }
  };
  return { estado, executar };
}

/** Bloco de estados comum às três telas: carregando, erro, vazio e sucesso. O estado vazio
 * só é alcançado quando a consulta devolveu com sucesso. */
function Consulta<T>({
  ciclo,
  rotuloBotao,
  textos,
  aoConsultar,
  vazio,
  children,
}: {
  ciclo: Ciclo<T>;
  rotuloBotao: string;
  textos: { carregando: string; vazio: string; erro: string };
  aoConsultar: () => void;
  vazio: (dados: T) => boolean;
  children: (dados: T) => ReactNode;
}) {
  const ocupado = ciclo.fase === 'carregando';
  const ficouVazio = ciclo.fase === 'ok' && vazio(ciclo.dados);
  const status =
    ciclo.fase === 'carregando'
      ? textos.carregando
      : ciclo.fase === 'erro'
        ? ciclo.codigo === 'sem_permissao'
          ? 'Sua conta não tem acesso ao financeiro.'
          : `${textos.erro} Tente consultar de novo.`
        : ciclo.fase === 'ok'
          ? ficouVazio
            ? textos.vazio
            : 'Consulta concluída.'
          : '';
  return (
    <>
      <Recado classe="financeiro__status" texto={status} />
      <BotaoOcupavel ocupado={ocupado} peso="secundario" aoAtivar={aoConsultar}>
        {rotuloBotao}
      </BotaoOcupavel>
      <div className="financeiro__lista" aria-busy={ocupado || undefined}>
        {ocupado ? (
          <div className="list-loading" data-compacto="" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : ciclo.fase === 'ok' ? (
          ficouVazio ? (
            <p className="financeiro__vazio">{textos.vazio}</p>
          ) : (
            children(ciclo.dados)
          )
        ) : null}
      </div>
    </>
  );
}

function Valores({
  servico,
  contexto,
  aoGravar,
}: { servico: ServicoFinanceiro; contexto: Contexto; aoGravar: (gravando: boolean) => void }) {
  const profissional = useRef<HTMLInputElement>(null);
  const inicio = useRef<HTMLInputElement>(null);
  const dinheiro = useRef<HTMLInputElement>(null);
  const motivo = useRef<HTMLInputElement>(null);
  const ciclo = useCiclo<ValorAcordado[]>();
  const [aviso, definirAviso] = useState('');
  const [gravando, definirGravando] = useState(false);
  useEffect(() => aoGravar(gravando), [gravando, aoGravar]);
  const emCurso = useRef(false);
  const tentativa = useRef({ valor_id: crypto.randomUUID(), chave: crypto.randomUUID() });
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  const consultar = () =>
    ciclo.executar(() => servico.listarValores(profissional.current?.value.trim() ?? ''));

  const registrar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (emCurso.current) return;
    const centavos = lerCentavos(dinheiro.current?.value ?? '');
    if (centavos === null) {
      definirAviso('Informe o valor em reais, com até dois decimais.');
      dinheiro.current?.focus();
      return;
    }
    emCurso.current = true;
    definirGravando(true);
    definirAviso('Registrando…');
    const { valor_id, chave } = tentativa.current;
    try {
      await servico.registrarValor(
        {
          valor_id,
          profissional_usuario_id: profissional.current?.value.trim() ?? '',
          valor_turno_centavos: centavos,
          vigencia: { inicio: inicio.current?.value ?? '', fim: null },
          motivo: motivo.current?.value.trim() ?? '',
        },
        chave,
      );
      if (!vivo.current) return;
      definirAviso('Valor registrado.');
      tentativa.current = { valor_id: crypto.randomUUID(), chave: crypto.randomUUID() };
      void consultar();
    } catch (erro) {
      if (!vivo.current) return;
      const codigo = codigoDe(erro);
      definirAviso(
        codigo === 'conflito'
          ? 'Já existe valor vigente nesse período. Encerre a vigência anterior.'
          : codigo === 'sem_permissao'
            ? 'Sua conta não pode registrar valores.'
            : 'Não foi possível registrar. Nada foi salvo com sucesso — confira e tente de novo.',
      );
    } finally {
      emCurso.current = false;
      if (vivo.current) definirGravando(false);
    }
  };

  return (
    <>
      <form noValidate className="financeiro__formulario" onSubmit={(e) => e.preventDefault()}>
        <CampoTexto
          rotulo="Profissional (identificador)"
          entrada={profissional}
          type="text"
          required
          autoComplete="off"
          defaultValue={contexto.profissionalPadrao ?? ''}
        />
      </form>
      <Consulta
        ciclo={ciclo.estado}
        rotuloBotao="Consultar valores"
        textos={{
          carregando: 'Consultando valores combinados…',
          vazio: 'Nenhum valor combinado registrado para esta pessoa.',
          erro: 'Não foi possível consultar os valores.',
        }}
        aoConsultar={() => void consultar()}
        vazio={(valores) => valores.length === 0}
      >
        {(valores) =>
          valores.map((valor) => (
            <div className="financeiro__linha" key={valor.valor_id}>
              <p className="financeiro__destaque">
                {formatarCentavos(valor.valor_turno_centavos)} por turno
              </p>
              <p>
                {valor.vigencia.fim
                  ? `Vigente de ${valor.vigencia.inicio} a ${valor.vigencia.fim}`
                  : `Vigente desde ${valor.vigencia.inicio}`}
              </p>
              <p className="financeiro__secundario">{valor.motivo}</p>
            </div>
          ))
        }
      </Consulta>
      <form noValidate className="financeiro__formulario" onSubmit={(e) => void registrar(e)}>
        <h3>Registrar novo valor</h3>
        <CampoTexto
          rotulo="Valor por turno"
          entrada={dinheiro}
          type="text"
          required
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
        />
        <CampoDataFinanceiro rotulo="Início da vigência" entrada={inicio} />
        <CampoTexto rotulo="Motivo" entrada={motivo} type="text" required maxLength={2000} />
        <BotaoOcupavel ocupado={gravando} tipo="submit" peso="principal">
          Registrar valor
        </BotaoOcupavel>
        <Recado classe="financeiro__aviso" texto={aviso} />
      </form>
    </>
  );
}

function LinhaDespesa({
  despesa,
  servico,
  caso,
}: {
  despesa: DespesaVersao;
  servico: ServicoFinanceiro;
  caso: string;
}) {
  const [retorno, definirRetorno] = useState('');
  const [baixando, definirBaixando] = useState(false);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  const baixar = async () => {
    definirBaixando(true);
    definirRetorno('Buscando comprovante…');
    try {
      const blob = await servico.baixarComprovante(caso, despesa.despesa_id);
      if (!vivo.current) return;
      // Endereço temporário do próprio navegador, revogado em seguida: nenhuma
      // URL do servidor é emitida, guardada ou compartilhável.
      const endereco = URL.createObjectURL(blob);
      const ligacao = document.createElement('a');
      ligacao.href = endereco;
      ligacao.download = 'comprovante';
      ligacao.rel = 'noopener noreferrer';
      ligacao.click();
      URL.revokeObjectURL(endereco);
      definirRetorno('Comprovante baixado.');
    } catch (erro) {
      if (!vivo.current) return;
      definirRetorno(
        codigoDe(erro) === 'sem_permissao'
          ? 'Sua conta não pode abrir este comprovante.'
          : 'Não foi possível abrir o comprovante agora.',
      );
    } finally {
      if (vivo.current) definirBaixando(false);
    }
  };
  return (
    <div className="financeiro__linha">
      <p className="financeiro__destaque">
        {formatarCentavos(despesa.valor_centavos)} — {despesa.data}
      </p>
      <p>{despesa.descricao}</p>
      <p className="financeiro__secundario">Autorização: {despesa.autorizacao}</p>
      <p className="financeiro__secundario">
        {despesa.versao === 1
          ? 'Lançamento original'
          : `Retificação da versão ${despesa.retificacao_de_versao ?? despesa.versao - 1}`}
      </p>
      {despesa.tem_comprovante ? (
        <>
          <BotaoOcupavel ocupado={baixando} peso="discreto" aoAtivar={() => void baixar()}>
            Abrir comprovante
          </BotaoOcupavel>
          <Recado classe="financeiro__aviso" texto={retorno} />
        </>
      ) : null}
    </div>
  );
}

function Despesas({
  servico,
  contexto,
  aoGravar,
}: { servico: ServicoFinanceiro; contexto: Contexto; aoGravar: (gravando: boolean) => void }) {
  const caso = useRef<HTMLInputElement>(null);
  const descricao = useRef<HTMLInputElement>(null);
  const dinheiro = useRef<HTMLInputElement>(null);
  const data = useRef<HTMLInputElement>(null);
  const responsavel = useRef<HTMLInputElement>(null);
  const autorizacao = useRef<HTMLInputElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const ciclo = useCiclo<DespesaVersao[]>();
  // O caso que a lista mostra é o consultado, e não o que está digitado agora.
  const [casoConsultado, definirCasoConsultado] = useState('');
  const [aviso, definirAviso] = useState('');
  const [gravando, definirGravando] = useState(false);
  useEffect(() => aoGravar(gravando), [gravando, aoGravar]);
  const [podeRepetir, definirPodeRepetir] = useState(false);
  const emCurso = useRef(false);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  // Identificador e chave de idempotência da TENTATIVA, não do clique: enquanto o mesmo
  // lançamento não tiver sido confirmado, repetir reusa os dois, e o banco reconhece a
  // repetição em vez de criar segundo lançamento.
  const tentativa = useRef({ despesa_id: crypto.randomUUID(), chave: crypto.randomUUID() });

  const consultar = () => {
    const alvo = caso.current?.value.trim() ?? '';
    definirCasoConsultado(alvo);
    return ciclo.executar(() => servico.listarDespesas(alvo));
  };

  const gravar = async () => {
    if (emCurso.current) return;
    const centavos = lerCentavos(dinheiro.current?.value ?? '');
    const selecionado = arquivo.current?.files?.[0] ?? null;
    if (centavos === null) {
      definirAviso('Informe o valor em reais, com até dois decimais.');
      dinheiro.current?.focus();
      return;
    }
    if (!selecionado) {
      definirAviso('Anexe o comprovante da despesa.');
      arquivo.current?.focus();
      return;
    }
    const tipo = MIMES_COMPROVANTE.find((mime) => mime === selecionado.type);
    if (!tipo || selecionado.size === 0 || selecionado.size > TAMANHO_MAXIMO_COMPROVANTE_BYTES) {
      definirAviso('O comprovante precisa ser JPEG, PNG, WebP ou PDF, de até 5 MB.');
      return;
    }
    // Os valores são lidos antes de qualquer espera: editar o formulário durante o envio
    // não muda o que está sendo gravado nem para qual caso o comprovante vai.
    const pacienteId = caso.current?.value.trim() ?? '';
    const lancamento = {
      descricao: descricao.current?.value.trim() ?? '',
      data: data.current?.value ?? '',
      responsavel: responsavel.current?.value.trim() ?? '',
      autorizacao: autorizacao.current?.value.trim() ?? '',
    };
    const { despesa_id, chave } = tentativa.current;
    emCurso.current = true;
    definirGravando(true);
    definirAviso('Registrando despesa…');
    try {
      const bytes = new Uint8Array(await selecionado.arrayBuffer());
      let binario = '';
      for (const byte of bytes) binario += String.fromCharCode(byte);
      const base64 = btoa(binario);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      let hex = '';
      for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
      await servico.registrarDespesa(
        {
          despesa_id,
          paciente_id: pacienteId,
          descricao: lancamento.descricao,
          valor_centavos: centavos,
          data: lancamento.data,
          responsavel_usuario_id: lancamento.responsavel,
          autorizacao: lancamento.autorizacao,
          comprovante: {
            objeto_nome: nomeComprovante(despesa_id),
            mime_type: tipo,
            tamanho_bytes: bytes.byteLength,
            digest: hex,
          },
        },
        chave,
      );
      await servico.enviarComprovante(
        pacienteId,
        despesa_id,
        { arquivo_base64: base64, mime_type: tipo, tamanho_bytes: bytes.byteLength },
        crypto.randomUUID(),
      );
      if (!vivo.current) return;
      definirAviso('Despesa registrada com o comprovante.');
      definirPodeRepetir(false);
      tentativa.current = { despesa_id: crypto.randomUUID(), chave: crypto.randomUUID() };
      void consultar();
    } catch (erro) {
      if (!vivo.current) return;
      const codigo = codigoDe(erro);
      // Falha NUNCA vira sucesso e NUNCA repete sozinha: quem decide repetir é a pessoa, e
      // a repetição reaproveita o mesmo lançamento.
      definirAviso(
        codigo === 'conflito_idempotencia'
          ? 'Este lançamento já foi recebido antes com conteúdo diferente. Confira a lista antes de lançar de novo.'
          : codigo === 'sem_permissao'
            ? 'Sua conta não pode registrar despesas.'
            : 'A despesa não foi salva. Nada foi registrado como concluído; se quiser, tente de novo este mesmo lançamento.',
      );
      definirPodeRepetir(codigo !== 'sem_permissao');
    } finally {
      emCurso.current = false;
      if (vivo.current) definirGravando(false);
    }
  };

  return (
    <>
      <form noValidate className="financeiro__formulario" onSubmit={(e) => e.preventDefault()}>
        <CampoTexto
          rotulo="Caso (identificador)"
          entrada={caso}
          type="text"
          required
          autoComplete="off"
          defaultValue={contexto.casoPadrao ?? ''}
        />
      </form>
      <Consulta
        ciclo={ciclo.estado}
        rotuloBotao="Consultar despesas"
        textos={{
          carregando: 'Consultando despesas do caso…',
          vazio: 'Nenhuma despesa registrada neste caso.',
          erro: 'Não foi possível consultar as despesas.',
        }}
        aoConsultar={() => void consultar()}
        vazio={(despesas) => despesas.length === 0}
      >
        {(despesas) =>
          despesas.map((despesa) => (
            <LinhaDespesa
              key={`${despesa.despesa_id}-${String(despesa.versao)}`}
              despesa={despesa}
              servico={servico}
              caso={casoConsultado}
            />
          ))
        }
      </Consulta>
      <form
        noValidate
        className="financeiro__formulario"
        onSubmit={(evento) => {
          evento.preventDefault();
          void gravar();
        }}
      >
        <h3>Registrar despesa</h3>
        <CampoTexto rotulo="Descrição" entrada={descricao} type="text" required maxLength={2000} />
        <CampoTexto
          rotulo="Valor"
          entrada={dinheiro}
          type="text"
          required
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
        />
        <CampoDataFinanceiro rotulo="Data" entrada={data} />
        <CampoTexto
          rotulo="Responsável (identificador)"
          entrada={responsavel}
          type="text"
          required
        />
        <CampoTexto
          rotulo="Autorização aplicável"
          entrada={autorizacao}
          type="text"
          required
          maxLength={512}
        />
        <CampoTexto
          rotulo="Comprovante"
          entrada={arquivo}
          type="file"
          required
          accept={MIMES_COMPROVANTE.join(',')}
        />
        <BotaoOcupavel ocupado={gravando} tipo="submit" peso="principal">
          Registrar despesa
        </BotaoOcupavel>
        <BotaoOcupavel
          ocupado={gravando}
          peso="secundario"
          hidden={!podeRepetir}
          aoAtivar={() => void gravar()}
        >
          Tentar de novo este mesmo lançamento
        </BotaoOcupavel>
        <Recado classe="financeiro__aviso" texto={aviso} />
      </form>
    </>
  );
}

function Apuracao({ servico, contexto }: { servico: ServicoFinanceiro; contexto: Contexto }) {
  const profissional = useRef<HTMLInputElement>(null);
  const inicio = useRef<HTMLInputElement>(null);
  const fim = useRef<HTMLInputElement>(null);
  const ciclo = useCiclo<ApuracaoRepasse>();
  return (
    <>
      <form noValidate className="financeiro__formulario" onSubmit={(e) => e.preventDefault()}>
        <CampoTexto
          rotulo="Profissional (identificador)"
          entrada={profissional}
          type="text"
          required
          autoComplete="off"
          defaultValue={contexto.profissionalPadrao ?? ''}
        />
        <CampoDataFinanceiro rotulo="Início do período" entrada={inicio} />
        <CampoDataFinanceiro rotulo="Fim do período" entrada={fim} />
      </form>
      {/* Sem total antes da consulta: o resumo só ganha texto quando a apuração volta. */}
      <p className="financeiro__destaque">
        {ciclo.estado.fase === 'ok'
          ? `Total ${formatarCentavos(ciclo.estado.dados.total_centavos)} — ${ciclo.estado.dados.pendentes} pendência(s) — consultado em ${ciclo.estado.dados.consultado_em}`
          : ''}
      </p>
      <Consulta
        ciclo={ciclo.estado}
        rotuloBotao="Apurar período"
        textos={{
          carregando: 'Apurando o período…',
          vazio: 'Nenhum turno no período consultado.',
          erro: 'Não foi possível apurar o período.',
        }}
        aoConsultar={() =>
          void ciclo.executar(() =>
            servico.consultarApuracao({
              profissional_usuario_id: profissional.current?.value.trim() ?? '',
              periodo_inicio: inicio.current?.value ?? '',
              periodo_fim: fim.current?.value ?? '',
            }),
          )
        }
        vazio={(apuracao) => apuracao.linhas.length === 0}
      >
        {(apuracao) =>
          apuracao.linhas.map((linha, indice) => (
            // O turno pode repetir no período; a posição desambigua a chave.
            <div className="financeiro__linha" key={`${linha.turno_id}-${String(indice)}`}>
              <p className="financeiro__destaque">
                {linha.valor_centavos === null
                  ? 'Sem valor'
                  : formatarCentavos(linha.valor_centavos)}
              </p>
              <p>{SITUACOES[linha.situacao] ?? linha.situacao}</p>
              <p className="financeiro__secundario">
                Turno {linha.turno_id}
                {linha.data ? ` — ${linha.data}` : ''}
              </p>
            </div>
          ))
        }
      </Consulta>
    </>
  );
}

/** Financeiro do cuidado (FR-068, FR-069, FR-070): valor acordado por turno, despesa do caso
 * com comprovante e apuração de repasse por período.
 *
 * Três regras de apresentação que são requisito, não estilo:
 *
 * - Estado vazio só aparece DEPOIS de uma consulta que voltou com sucesso. Erro nunca mostra
 *   lista vazia, nunca mostra dado de exemplo e nunca mostra total.
 * - Falha ao gravar despesa não apresenta sucesso e não repete sozinha. A repetição é um
 *   clique explícito que reaproveita o mesmo identificador e a mesma chave de idempotência,
 *   de modo que o banco reconheça a repetição em vez de criar segundo lançamento.
 * - Nenhum valor trafega como texto formatado: a tela formata centavos, o contrato não.
 *
 * Sem cache de leituras de propósito: as consultas são por identificador digitado, sob
 * demanda, e trazem dado financeiro. Guardá-las ampliaria a superfície de descarte sem
 * ganho medido. Cada aba é desmontada ao sair e leva junto o que foi lido. */
export function TelaFinanceiro({
  servico,
  profissionalPadrao,
  casoPadrao,
}: { servico: ServicoFinanceiro } & Contexto) {
  const [aba, definirAba] = useState<IdAba>('valores');
  // Com uma gravação em curso a aba não troca: desmontar o painel perderia o aviso e a
  // próxima tentativa sairia com outro identificador e outra chave de idempotência, o que
  // duplicaria o lançamento se a primeira já tivesse dado certo.
  const [gravando, definirGravando] = useState(false);
  const contexto = { profissionalPadrao, casoPadrao };
  return (
    <section className="financeiro">
      <h2>Financeiro do cuidado</h2>
      <p className="financeiro__explicacao">
        Valores combinados por turno, despesas do caso e apuração de repasse. Quem cuida do caso não
        vê esta área; o acesso vem da concessão financeira e é conferido no servidor a cada
        consulta.
      </p>
      <Abas value={aba} onValueChange={(valor) => definirAba(valor as IdAba)}>
        <FaixaAbas aria-label="Seções do financeiro" tabIndex={-1} className="financeiro__abas">
          {ABAS.map((item) => (
            <Aba
              key={item.id}
              value={item.id}
              className="financeiro__aba"
              disabled={gravando && item.id !== aba}
            >
              {item.rotulo}
            </Aba>
          ))}
        </FaixaAbas>
        {ABAS.map((item) => (
          <PainelAba key={item.id} value={item.id} className="financeiro__painel">
            {item.id === 'valores' ? (
              <Valores servico={servico} contexto={contexto} aoGravar={definirGravando} />
            ) : item.id === 'despesas' ? (
              <Despesas servico={servico} contexto={contexto} aoGravar={definirGravando} />
            ) : (
              <Apuracao servico={servico} contexto={contexto} />
            )}
          </PainelAba>
        ))}
      </Abas>
    </section>
  );
}
