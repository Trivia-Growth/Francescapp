/* Rede de cuidado (FR-002), reconstruída em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * Migrada junto com `contexto-cuidado.tsx` e o hospedeiro `editor-documento-paciente.ts` —
 * ver o comentário de topo de `contexto-cuidado.tsx` para o raciocínio completo da
 * migração do trio.
 *
 * O que NÃO mudou (VIS-018): os sete vínculos do requisito, a recusa de pessoa sem nome ou
 * sem vínculo marcado, o aviso de que vínculo é descritivo e não concede acesso, e a
 * ausência de qualquer campo de permissão na estrutura enviada.
 *
 * Botões passaram ao `Botao` de `componentes/ui` em 26/11/2026; as classes de layout da
 * própria tela (`list-loading`, `loading-indicator`) continuam. Mesmos
 * campos não controlados de `contexto-cuidado.tsx`, pela mesma razão. */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  VINCULOS_REDE,
  type PessoaRede,
  type VinculoRede,
} from '../packages/contracts/src/rede-cuidado.js';
import { mensagemFalha } from './api.js';
import {
  type ColetaEditorDocumento,
  usarEditorDocumentoPaciente,
} from './editor-documento-paciente.js';
import { Botao } from './componentes/ui/botao.js';
import { ilha } from './ponte/ilha.js';
import type { ServicoDocumentoPaciente } from './servico-documento-paciente-http.js';
import { Formulario } from './telas/formulario.js';
import type { RefCorpoDocumento } from './contexto-cuidado.js';

export type ServicoRedeCuidado = ServicoDocumentoPaciente<PessoaRede[]>;

/** FR-002: os sete vínculos do requisito, com os rótulos que a equipe usa. */
const ROTULOS: Record<VinculoRede, string> = {
  paciente: 'Paciente',
  familiar: 'Familiar',
  cuidador: 'Cuidador',
  responsavel_legal: 'Responsável legal',
  contato_emergencia: 'Contato de emergência',
  profissional: 'Profissional',
  responsavel_financeiro: 'Responsável financeiro',
};

function IndicadorAcao() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

function EsqueletoCompacto() {
  return (
    <div className="list-loading" data-compacto="" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function idCampo(id: string, sufixo: string): string {
  return `rede-${id}-${sufixo}`;
}

type LinhaLocal = {
  id: string;
  nomeInicial: string;
  contatoInicial: string;
  observacaoInicial: string;
  vinculosIniciais: readonly VinculoRede[];
};

function LinhaRede({ linha, aoRemover }: { linha: LinhaLocal; aoRemover: () => void }) {
  const [nomeAtual, definirNomeAtual] = useState(linha.nomeInicial);
  return (
    <li className="rede-cuidado__pessoa">
      <label htmlFor={idCampo(linha.id, 'nome')}>Nome</label>
      <input
        id={idCampo(linha.id, 'nome')}
        required
        maxLength={200}
        defaultValue={linha.nomeInicial}
        onInput={(evento) => definirNomeAtual(evento.currentTarget.value)}
      />
      <label htmlFor={idCampo(linha.id, 'contato')}>Contato (opcional)</label>
      <input
        id={idCampo(linha.id, 'contato')}
        maxLength={200}
        defaultValue={linha.contatoInicial}
      />
      <label htmlFor={idCampo(linha.id, 'observacao')}>Observação (opcional)</label>
      <textarea
        id={idCampo(linha.id, 'observacao')}
        rows={2}
        maxLength={1000}
        defaultValue={linha.observacaoInicial}
      />
      <fieldset className="rede-cuidado__vinculos">
        <legend>Vínculos com o paciente</legend>
        {/* O vínculo descreve a relação; ele não concede acesso ao caso. Quem pode ver a
            ficha continua sendo definido na aba de acesso, nunca aqui. */}
        <p>
          Vínculo é descritivo: marcar aqui não dá acesso à ficha. O acesso é concedido
          separadamente.
        </p>
        {VINCULOS_REDE.map((vinculo) => (
          <label key={vinculo}>
            <input
              type="checkbox"
              data-linha={linha.id}
              value={vinculo}
              defaultChecked={linha.vinculosIniciais.includes(vinculo)}
            />{' '}
            {ROTULOS[vinculo]}
          </label>
        ))}
      </fieldset>
      {/* Sem isto, um leitor de tela anuncia "Remover pessoa" N vezes iguais para uma ação
          destrutiva e sem confirmação. */}
      <Botao
        peso="discreto"
        rotuloLeitura={`Remover ${nomeAtual.trim() || 'pessoa sem nome'} da rede de cuidado`}
        aoAtivar={aoRemover}
      >
        Remover pessoa
      </Botao>
    </li>
  );
}

type PropsCorpoRedeCuidado = {
  conteudo: PessoaRede[] | null;
  bloqueado: boolean;
  aoAlterar: () => void;
};

const CorpoRedeCuidado = forwardRef<RefCorpoDocumento<PessoaRede[]>, PropsCorpoRedeCuidado>(
  function CorpoRedeCuidado({ conteudo, bloqueado, aoAlterar }, ref) {
    const [linhas, definirLinhas] = useState<LinhaLocal[]>(() =>
      (conteudo ?? []).map((pessoa) => ({
        id: pessoa.id,
        nomeInicial: pessoa.nome,
        contatoInicial: pessoa.contato ?? '',
        observacaoInicial: pessoa.observacao ?? '',
        vinculosIniciais: pessoa.vinculos,
      })),
    );
    const envelope = useRef<HTMLDivElement>(null);
    const focoPendenteRef = useRef<string | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        coletar: (): ColetaEditorDocumento<PessoaRede[]> => {
          const resultado: PessoaRede[] = [];
          for (const linha of linhas) {
            const nome = envelope.current?.querySelector<HTMLInputElement>(
              `[id="${idCampo(linha.id, 'nome')}"]`,
            );
            const nomeLimpo = nome?.value.trim() ?? '';
            if (!nomeLimpo)
              return { aviso: 'Informe o nome de cada pessoa.', foco: nome ?? undefined };
            const caixas = [
              ...(envelope.current?.querySelectorAll<HTMLInputElement>(
                `input[type="checkbox"][data-linha="${linha.id}"]`,
              ) ?? []),
            ];
            const marcadas = caixas.filter((caixa) => caixa.checked);
            if (!marcadas.length)
              return {
                aviso: 'Marque ao menos um vínculo para cada pessoa.',
                foco: caixas[0] ?? undefined,
              };
            const contato = envelope.current?.querySelector<HTMLInputElement>(
              `[id="${idCampo(linha.id, 'contato')}"]`,
            );
            const observacao = envelope.current?.querySelector<HTMLTextAreaElement>(
              `[id="${idCampo(linha.id, 'observacao')}"]`,
            );
            resultado.push({
              id: linha.id,
              nome: nomeLimpo,
              vinculos: marcadas.map((caixa) => caixa.value as VinculoRede),
              contato: contato?.value.trim() || null,
              observacao: observacao?.value.trim() || null,
            });
          }
          return { conteudo: resultado };
        },
      }),
      [linhas],
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies: `linhas` não é lida no corpo — é o GATILHO: depois de cada pintura em que a lista de linhas muda, o foco pendente (se houver) é aplicado ao nó recém-montado.
    useEffect(() => {
      const pendente = focoPendenteRef.current;
      if (!pendente) return;
      focoPendenteRef.current = null;
      envelope.current
        ?.querySelector<HTMLInputElement>(`[id="${idCampo(pendente, 'nome')}"]`)
        ?.focus();
    }, [linhas]);

    const adicionar = () => {
      const id = crypto.randomUUID();
      focoPendenteRef.current = id;
      flushSync(() => {
        definirLinhas((atuais) => [
          ...atuais,
          { id, nomeInicial: '', contatoInicial: '', observacaoInicial: '', vinculosIniciais: [] },
        ]);
      });
      aoAlterar();
    };

    const remover = (id: string) => {
      flushSync(() => {
        definirLinhas((atuais) => atuais.filter((linha) => linha.id !== id));
      });
      aoAlterar();
    };

    return (
      <div
        ref={envelope}
        className="rede-cuidado"
        inert={bloqueado || undefined}
        onInput={aoAlterar}
        onChange={aoAlterar}
      >
        <ul className="rede-cuidado__lista">
          {linhas.map((linha) => (
            <LinhaRede key={linha.id} linha={linha} aoRemover={() => remover(linha.id)} />
          ))}
        </ul>
        <Botao peso="secundario" disabled={bloqueado} aoAtivar={adicionar}>
          Adicionar pessoa
        </Botao>
      </div>
    );
  },
);

function TelaRedeCuidado({
  pacienteId,
  servico,
  acessoPerdido,
  alteracaoPendente,
}: {
  pacienteId: string;
  servico: ServicoRedeCuidado;
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
}) {
  const editor = usarEditorDocumentoPaciente<PessoaRede[]>(
    pacienteId,
    servico,
    acessoPerdido,
    alteracaoPendente,
    {
      carregando: 'Carregando rede de cuidado…',
      salvando: 'Salvando rede de cuidado…',
      salvo: 'Rede de cuidado salva.',
      conflito:
        'A rede foi alterada por outra pessoa. Copie seu rascunho antes de recarregar a página para consultar a versão atual; suas alterações ainda não foram salvas.',
    },
  );
  const corpoRef = useRef<RefCorpoDocumento<PessoaRede[]>>(null);

  if (editor.descartada) return null;

  if (editor.consulta.fase === 'carregando')
    return (
      <>
        {/* biome-ignore lint/a11y/useSemanticElements: idem anamnese.tsx. */}
        <p role="status">Carregando rede de cuidado…</p>
        <div aria-busy="true">
          <EsqueletoCompacto />
        </div>
      </>
    );

  if (editor.consulta.fase === 'erro')
    return (
      <>
        {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
        <p role="status">{mensagemFalha(editor.consulta.erro)}</p>
        <Botao peso="secundario" aoAtivar={editor.tentarNovamenteConsulta}>
          Tentar novamente
        </Botao>
      </>
    );

  const travado = editor.temPendente || editor.enviando;
  const vazio = !(editor.consulta.conteudo ?? []).length;

  return (
    <Formulario
      aoEnviar={(_formulario) => {
        if (editor.temPendente || editor.conflitoVersao) return;
        const coletado = corpoRef.current?.coletar();
        if (coletado) editor.enviarColetado(coletado);
      }}
      noValidate
    >
      <h2>Rede de cuidado</h2>
      {vazio ? <p>Nenhuma pessoa registrada ainda. Use “Adicionar pessoa”.</p> : null}
      <CorpoRedeCuidado
        key={editor.geracao}
        ref={corpoRef}
        conteudo={editor.consulta.conteudo}
        bloqueado={travado}
        aoAlterar={() => alteracaoPendente(true)}
      />
      {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
      <p role="status" aria-live="polite" data-tone={editor.conflitoVersao ? 'error' : undefined}>
        {editor.aviso}
      </p>
      <Botao tipo="submit" peso="principal" disabled={travado || editor.conflitoVersao}>
        Salvar rede de cuidado
        {editor.enviando && !editor.retryVisivel ? <IndicadorAcao /> : null}
      </Botao>
      {editor.retryVisivel ? (
        <Botao peso="secundario" disabled={editor.enviando} aoAtivar={editor.confirmarRetry}>
          Tentar confirmar salvamento
          {editor.enviando ? <IndicadorAcao /> : null}
        </Botao>
      ) : null}
    </Formulario>
  );
}

/** Interface isolada; montagem depende da integração segura do servidor. */
export function montarRedeCuidado(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoRedeCuidado,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  return ilha(
    raiz,
    <TelaRedeCuidado
      pacienteId={pacienteId}
      servico={servico}
      acessoPerdido={acessoPerdido}
      alteracaoPendente={alteracaoPendente}
    />,
  );
}
