/* Dados do paciente vistos pela conta de família, reconstruído em React sobre a ilha
 * (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarDadosFamiliar(raiz, pacienteId, servico,
 * acessoPerdido) => desmontar`.
 *
 * VIS-012: os dois `if (!ativa) return` da versão imperativa desapareceram — `ilha()`
 * desmonta a raiz React e os efeitos são cancelados por construção. O guardião de
 * `numero !== geracao` virou `valida` dentro do efeito, como nas demais telas migradas:
 * ele impede a resposta de uma consulta anterior sobrescrever a seguinte.
 *
 * O que NÃO mudou (VIS-018): `acessoPerdido` continua com o contrato `(erro) => boolean`
 * — devolve se JÁ tratou a recusa — e esta seção não mostra mensagem de erro nem oferece
 * nova tentativa quando ele devolve `true`; o estado fica exatamente como estava. Só
 * quando `acessoPerdido` devolve `false` é que a seção assume o erro e oferece "Tentar
 * novamente". O paciente devolvido é sempre conferido contra o `pacienteId` pedido antes
 * de ir para a tela.
 */
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { mensagemFalha, type ClienteFFCM } from './api.js';
import { Botao } from './componentes/ui/botao.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';

type ServicoDadosFamiliar = Pick<ClienteFFCM, 'consultarPacienteFamiliar'>;
type PacienteFamiliar = Awaited<ReturnType<ClienteFFCM['consultarPacienteFamiliar']>>;

function TelaDadosFamiliar({
  pacienteId,
  servico,
  acessoPerdido,
}: {
  pacienteId: string;
  servico: ServicoDadosFamiliar;
  acessoPerdido: (erro: unknown) => boolean;
}) {
  const [status, definirStatus] = useState('Consultando paciente…');
  const [erro, definirErro] = useState(false);
  const [paciente, definirPaciente] = useState<PacienteFamiliar | null>(null);
  const [tentativa, definirTentativa] = useState(0);

  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;
  const acessoPerdidoAtual = useRef(acessoPerdido);
  acessoPerdidoAtual.current = acessoPerdido;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tentativa` não é lida no corpo de propósito — é o GATILHO de recarga que o botão "Tentar novamente" incrementa.
  useEffect(() => {
    let valida = true;
    flushSync(() => {
      definirErro(false);
      definirStatus('Consultando paciente…');
      definirPaciente(null);
    });
    servicoAtual.current
      .consultarPacienteFamiliar(pacienteId)
      .then((recebido) => {
        if (!valida) return;
        if (recebido.id !== pacienteId)
          throw new Error('Paciente retornado não corresponde à consulta.');
        flushSync(() => {
          definirPaciente(recebido);
          definirStatus('');
        });
      })
      .catch((erroRecebido: unknown) => {
        if (!valida || acessoPerdidoAtual.current(erroRecebido)) return;
        flushSync(() => {
          definirErro(true);
          definirStatus(`${mensagemFalha(erroRecebido)} Tente novamente.`);
        });
      });
    return () => {
      valida = false;
    };
  }, [pacienteId, tentativa]);

  return (
    <div className="grid min-w-0 gap-4">
      <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
        Dados do paciente
      </h2>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as telas e as provas já usam. */}
      <p
        role="status"
        aria-live="polite"
        data-tone={erro ? 'error' : undefined}
        className="m-0 text-(length:--texto-1) text-texto-suave"
      >
        {status}
      </p>
      <Esqueleto ocupado={!erro && !paciente}>
        {paciente ? (
          <dl className="ficha-dados">
            <div>
              <dt>Nome</dt>
              <dd>{paciente.nome}</dd>
            </div>
            <div>
              <dt>Nome de preferência</dt>
              <dd>{paciente.nome_preferencia ?? 'Não informado'}</dd>
            </div>
          </dl>
        ) : null}
      </Esqueleto>
      <Botao
        peso="secundario"
        hidden={!erro}
        className="justify-self-start"
        aoAtivar={() => definirTentativa((valor) => valor + 1)}
      >
        Tentar novamente
      </Botao>
    </div>
  );
}

/** Dados que a conta de família pode consultar do paciente vinculado. */
export function montarDadosFamiliar(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoDadosFamiliar,
  acessoPerdido: (erro: unknown) => boolean,
): () => void {
  return ilha(
    raiz,
    <TelaDadosFamiliar pacienteId={pacienteId} servico={servico} acessoPerdido={acessoPerdido} />,
  );
}
