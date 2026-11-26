/* Acesso da família (concessão de acesso a dado clínico), reconstruído em React sobre a
 * ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarPreautorizacoesFamiliares(raiz, pacienteId,
 * servico, acessoPerdido) => desmontar`, e `Preautorizacao`/`ServicoPreautorizacoes`
 * continuam os mesmos tipos exportados.
 *
 * VIS-012: os `if (!ativa) return` da versão imperativa desapareceram — `ilha()` desmonta
 * a raiz React e os efeitos são cancelados por construção.
 *
 * O que NÃO mudou, de propósito (VIS-018), porque esta tela concede acesso a dado clínico:
 *
 * - `exigeNovoAcesso` continua retirando a seção inteira (`descartada`) ANTES de avisar
 *   `acessoPerdido`: o fluxo de nova entrada nunca encontra o painel de concessões atrás
 *   dele.
 * - A trava de concorrência é ÚNICA para todos os encerramentos da lista: clicar em
 *   "Encerrar acesso" enquanto outro encerramento está em voo não faz nada — só o item em
 *   voo tem o próprio formulário desabilitado, exatamente como na versão imperativa.
 * - O encerramento exige motivo preenchido antes de chamar `servico.cancelar`.
 * - Item já encerrado nunca volta a oferecer o formulário de encerramento.
 * - A mensagem de "acesso da família não liberado" (decisão de produto) continua distinta
 *   da mensagem de falha passageira — nenhuma incentiva repetir algo que não vai funcionar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { z } from 'zod';
import type {
  cancelarPreautorizacaoFamiliarSchema,
  preautorizacaoFamiliarSchema,
} from '../packages/contracts/src/identidade.ts';
import { exigeNovoAcesso, FalhaApi } from './api.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import { Formulario, valorDe } from './telas/formulario.js';

export type Preautorizacao = z.infer<typeof preautorizacaoFamiliarSchema>;
export type ServicoPreautorizacoes = {
  listar(pacienteId: string): Promise<Preautorizacao[]>;
  cancelar(entrada: z.infer<typeof cancelarPreautorizacaoFamiliarSchema>): Promise<void>;
};

const rotulosEstado: Record<Preautorizacao['estado'], string> = {
  pendente: 'Convite a enviar',
  enviado: 'Convite enviado',
  falha: 'Envio falhou',
  ativado: 'E-mail confirmado',
};

/** O convite familiar está desligado por decisão de produto, não por falha passageira:
 * `netlify/functions/preautorizacoes-familiares.ts` recusa com `servico_indisponivel`
 * antes de qualquer dependência. Dizer "tente de novo" nesse caso manda a pessoa repetir
 * algo que nunca vai funcionar. */
function acessoFamiliarNaoLiberado(erro: unknown): boolean {
  return erro instanceof FalhaApi && erro.codigo === 'servico_indisponivel';
}

const AVISO_NAO_LIBERADO =
  'O acesso da família ainda não foi liberado. Ninguém da família entra no aplicativo por ' +
  'enquanto, e não há acessos a mostrar aqui. Combine com a família pelo canal que o ' +
  'acompanhamento já usa.';

function formatarData(valor: string | null): string {
  if (!valor) return '';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '' : data.toLocaleDateString('pt-BR');
}

function ItemAcessoFamilia({
  item,
  desabilitado,
  aoCancelar,
}: {
  item: Preautorizacao;
  desabilitado: boolean;
  aoCancelar: (formulario: HTMLFormElement, item: Preautorizacao) => void;
}) {
  const encerrado = item.acesso_revogado_em !== null;
  const quando = formatarData(item.acesso_autorizado_em ?? item.criado_em);
  const descricao = encerrado
    ? `${rotulosEstado[item.estado]} · acesso encerrado em ${formatarData(item.acesso_revogado_em)}`
    : `${rotulosEstado[item.estado]}${quando ? ` · autorizado em ${quando}` : ''}`;

  return (
    <li className="grid min-w-0 gap-3 rounded-cartao border border-borda p-4">
      <p className="m-0 max-w-[68ch]">{descricao}</p>
      {!encerrado && item.acesso_preautorizado_id ? (
        <Formulario
          aoEnviar={(formulario) => aoCancelar(formulario, item)}
          noValidate
          className="grid min-w-0 gap-3"
        >
          <fieldset disabled={desabilitado} className="m-0 grid min-w-0 gap-3 border-0 p-0">
            <Campo
              id={`preautorizacoes-motivo-${item.convite_id}`}
              name={`motivo-${item.convite_id}`}
              rotulo="Motivo"
              placeholder="Por que está encerrando"
              required
              maxLength={500}
              classeEnvelope="mb-0"
            />
            <div>
              <Botao peso="principal" tipo="submit">
                Encerrar acesso
              </Botao>
            </div>
          </fieldset>
        </Formulario>
      ) : null}
    </li>
  );
}

function TelaPreautorizacoesFamiliares({
  pacienteId,
  servico,
  acessoPerdido,
}: {
  pacienteId: string;
  servico: ServicoPreautorizacoes;
  acessoPerdido: (erro: unknown) => void;
}) {
  const [descartada, definirDescartada] = useState(false);
  const [status, definirStatus] = useState('Carregando os acessos da família…');
  const [itens, definirItens] = useState<readonly Preautorizacao[]>([]);
  const [carregandoLista, definirCarregandoLista] = useState(true);
  const [idEmCurso, definirIdEmCurso] = useState<string | null>(null);

  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;
  const idEmCursoRef = useRef<string | null>(null);

  /** Revalidação de acesso: a seção inteira é retirada ANTES de avisar. */
  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    flushSync(() => definirDescartada(true));
    avisarPerda.current(erro);
    return true;
  }, []);

  const carregar = useCallback(async (): Promise<void> => {
    flushSync(() => {
      definirStatus('Carregando os acessos da família…');
      definirCarregandoLista(true);
    });
    try {
      const recebidos = await servicoAtual.current.listar(pacienteId);
      flushSync(() => {
        definirItens(recebidos);
        definirStatus(recebidos.length === 0 ? 'Nenhum familiar autorizado neste caso ainda.' : '');
        definirCarregandoLista(false);
      });
    } catch (erro) {
      if (descartarAcesso(erro)) return;
      flushSync(() => {
        definirCarregandoLista(false);
        definirStatus(
          acessoFamiliarNaoLiberado(erro)
            ? AVISO_NAO_LIBERADO
            : 'Não foi possível carregar os acessos da família agora. Tente de novo.',
        );
      });
    }
  }, [pacienteId, descartarAcesso]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const cancelar = useCallback(
    (formulario: HTMLFormElement, item: Preautorizacao) => {
      const acessoId = item.acesso_preautorizado_id;
      if (idEmCursoRef.current || !acessoId) return;
      const texto = valorDe(formulario, `motivo-${item.convite_id}`).trim();
      if (texto.length === 0) {
        definirStatus('Informe o motivo para encerrar o acesso.');
        formulario.querySelector('input')?.focus();
        return;
      }
      idEmCursoRef.current = item.convite_id;
      flushSync(() => {
        definirIdEmCurso(item.convite_id);
        definirStatus('Encerrando o acesso…');
      });
      servicoAtual.current
        .cancelar({ convite_id: item.convite_id, acesso_id: acessoId, motivo: texto })
        .then(() => carregar().then(() => definirStatus('Acesso encerrado.')))
        .catch((erro: unknown) => {
          if (descartarAcesso(erro)) return;
          definirStatus(
            acessoFamiliarNaoLiberado(erro)
              ? AVISO_NAO_LIBERADO
              : 'Não foi possível encerrar o acesso agora. Tente de novo.',
          );
        })
        .finally(() => {
          idEmCursoRef.current = null;
          definirIdEmCurso(null);
        });
    },
    [carregar, descartarAcesso],
  );

  if (descartada) return null;

  return (
    <section className="grid min-w-0 gap-4">
      <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
        Acesso da família
      </h3>
      <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
        Quem a equipe autorizou a acompanhar este caso. Encerrar um acesso tem efeito imediato.
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as telas e as provas já usam. */}
      <p role="status" aria-live="polite" className="m-0 text-(length:--texto-1) text-texto-suave">
        {status}
      </p>
      <Esqueleto ocupado={carregandoLista}>
        <ul className="m-0 grid min-w-0 list-none gap-3 p-0">
          {itens.map((item) => (
            <ItemAcessoFamilia
              key={item.convite_id}
              item={item}
              desabilitado={idEmCurso === item.convite_id}
              aoCancelar={cancelar}
            />
          ))}
        </ul>
      </Esqueleto>
    </section>
  );
}

/**
 * Lista os acessos de familiares autorizados no caso e permite encerrar cada um.
 * Encerrar aqui fecha o acesso na hora, inclusive para quem já entrou.
 */
export function montarPreautorizacoesFamiliares(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoPreautorizacoes,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  return ilha(
    raiz,
    <TelaPreautorizacoesFamiliares
      pacienteId={pacienteId}
      servico={servico}
      acessoPerdido={acessoPerdido}
    />,
  );
}
