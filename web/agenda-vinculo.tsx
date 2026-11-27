/** Vincular um compromisso da agenda Google a um paciente, reconstruído em React sobre a
 *  ilha (`web/ponte/ilha.ts`).
 *
 *  O hospedeiro é `web/agenda-individual.tsx`, migrado na MESMA leva: o punho que este
 *  componente entrega (`registrar` → `{ abrir, ocultar }`) segue o padrão já usado em
 *  `web/revogacao-vinculo.tsx`.
 *
 *  VIS-012: a versão imperativa guardava `ativa` e testava `if (!ativa) return` em cada
 *  retomada de `await`. Aqui não sobra nenhuma: desmontar a ilha cancela os efeitos, e
 *  `setState` depois disso não produz tela nenhuma. */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Botao } from './componentes/ui/botao.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { confirmar } from './confirmacao.js';

type Pagina = { itens: readonly { id: string; nome: string }[]; proximo_cursor: string | null };

type FasePacientes =
  | { fase: 'carregando' }
  | {
      fase: 'pronto';
      itens: readonly { id: string; nome: string }[];
      proximoCursor: string | null;
    }
  | { fase: 'erro' };

type EstadoVinculacao =
  | { fase: 'ociosa' }
  | { fase: 'enviando' }
  | { fase: 'confirmada' }
  | { fase: 'conflito' }
  | { fase: 'falhou'; pacienteId: string; nome: string };

export type PunhoVinculo = {
  abrir: (id: string, horario: string) => void;
  ocultar: () => void;
};

type PropsVinculoAgenda = {
  cabecalhos: () => Headers;
  listar: (cursor?: string) => Promise<Pagina>;
  atualizado: () => void;
  registrar: (punho: PunhoVinculo) => void;
};

export function VinculoAgenda({ cabecalhos, listar, atualizado, registrar }: PropsVinculoAgenda) {
  const [aberto, definirAberto] = useState(false);
  const [eventoId, definirEventoId] = useState('');
  const [evento, definirEvento] = useState('');
  const [pacientes, definirPacientes] = useState<FasePacientes>({ fase: 'carregando' });
  const [vinculacao, definirVinculacao] = useState<EstadoVinculacao>({ fase: 'ociosa' });
  const [pagina, definirPagina] = useState(0);

  const ocupadoRef = useRef(false);
  const revisaoRef = useRef(0);
  const cursoresRef = useRef<(string | undefined)[]>([undefined]);
  const tituloRef = useRef<HTMLHeadingElement | null>(null);

  const carregar = useCallback(
    async (novaPagina: number) => {
      const numero = ++revisaoRef.current;
      definirPagina(novaPagina);
      definirPacientes({ fase: 'carregando' });
      try {
        const dados = await listar(cursoresRef.current[novaPagina]);
        if (numero !== revisaoRef.current) return;
        definirPacientes({
          fase: 'pronto',
          itens: dados.itens,
          proximoCursor: dados.proximo_cursor,
        });
      } catch {
        if (numero !== revisaoRef.current) return;
        definirPacientes({ fase: 'erro' });
      }
    },
    [listar],
  );

  const abrir = useCallback(
    (id: string, horario: string) => {
      if (ocupadoRef.current) return;
      definirEventoId(id);
      definirEvento(`Compromisso: ${horario}`);
      cursoresRef.current = [undefined];
      definirVinculacao({ fase: 'ociosa' });
      definirAberto(true);
      void carregar(0);
    },
    [carregar],
  );

  const ocultar = useCallback(() => {
    revisaoRef.current += 1;
    definirAberto(false);
    definirEvento('');
  }, []);

  useLayoutEffect(() => {
    registrar({ abrir, ocultar });
  }, [registrar, abrir, ocultar]);

  useLayoutEffect(() => {
    if (aberto) tituloRef.current?.focus();
  }, [aberto]);

  async function vincular(pacienteId: string, nome: string): Promise<void> {
    if (ocupadoRef.current || !eventoId) return;
    if (
      !(await confirmar({
        titulo: `Vincular este compromisso a ${nome}?`,
        detalhe: 'O compromisso passa a aparecer na agenda desta pessoa.',
        acao: 'Vincular',
        cancelar: 'Não vincular',
      }))
    )
      return;
    // A pergunta é assíncrona: o estado pode ter mudado enquanto ela estava na tela.
    if (ocupadoRef.current || !eventoId) return;
    ocupadoRef.current = true;
    definirVinculacao({ fase: 'enviando' });
    try {
      const headers = cabecalhos();
      headers.set('Content-Type', 'application/json');
      const resposta = await fetch('/api/agenda/google/vinculos', {
        method: 'POST',
        headers,
        body: JSON.stringify({ evento_id: eventoId, paciente_id: pacienteId }),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      const dados: unknown = await resposta.json();
      if (!resposta.ok || !dados || typeof dados !== 'object' || !('estado' in dados))
        throw new Error();
      if (dados.estado === 'conflito') {
        definirVinculacao({ fase: 'conflito' });
        return;
      }
      if (dados.estado !== 'vinculado') throw new Error();
      definirVinculacao({ fase: 'confirmada' });
      atualizado();
    } catch {
      definirVinculacao({ fase: 'falhou', pacienteId, nome });
    } finally {
      ocupadoRef.current = false;
    }
  }

  const carregandoPacientes = pacientes.fase === 'carregando';
  const enviando = vinculacao.fase === 'enviando';

  let estadoTexto = '';
  if (vinculacao.fase === 'enviando') estadoTexto = 'Aguardando confirmação do vínculo…';
  else if (vinculacao.fase === 'conflito')
    estadoTexto = 'Este compromisso já possui outro vínculo. Procure a equipe responsável.';
  else if (vinculacao.fase === 'confirmada') estadoTexto = 'Vínculo confirmado.';
  else if (vinculacao.fase === 'falhou')
    estadoTexto = 'Não foi possível confirmar o vínculo. Tente novamente com o mesmo paciente.';
  else if (pacientes.fase === 'erro')
    estadoTexto = 'Não foi possível consultar pacientes. Feche e tente novamente.';
  else if (pacientes.fase === 'pronto')
    estadoTexto = pacientes.itens.length
      ? 'Escolha o paciente para vincular.'
      : 'Nenhum paciente disponível nesta página.';
  else estadoTexto = 'Consultando pacientes…';

  return (
    <section hidden={!aberto} className="grid min-w-0 gap-4">
      <h3
        ref={tituloRef}
        tabIndex={-1}
        className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]"
      >
        Vincular compromisso a paciente
      </h3>
      <p className="m-0">
        Selecione um paciente disponível para seu acesso. Nenhum dado do paciente será enviado ao
        Google.
      </p>
      <p className="m-0">{evento}</p>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as telas e as provas já usam. */}
      <p role="status" aria-live="polite" className="m-0">
        {estadoTexto}
        {enviando ? <span className="loading-indicator" aria-hidden="true" /> : null}
      </p>
      <Esqueleto ocupado={carregandoPacientes || enviando} className="grid gap-2">
        {vinculacao.fase === 'falhou' ? (
          <Botao
            peso="secundario"
            aoAtivar={() => void vincular(vinculacao.pacienteId, vinculacao.nome)}
          >
            Tentar novamente
          </Botao>
        ) : pacientes.fase === 'pronto' ? (
          pacientes.itens.map((paciente) => (
            <Botao
              key={paciente.id}
              peso="secundario"
              disabled={enviando}
              aoAtivar={() => void vincular(paciente.id, paciente.nome)}
            >
              {paciente.nome}
            </Botao>
          ))
        ) : null}
      </Esqueleto>
      <div className="flex flex-wrap gap-3">
        <Botao
          peso="secundario"
          disabled={pagina === 0 || carregandoPacientes}
          aoAtivar={() => void carregar(pagina - 1)}
        >
          Página anterior
        </Botao>
        <Botao
          peso="secundario"
          disabled={pacientes.fase !== 'pronto' || !pacientes.proximoCursor || carregandoPacientes}
          aoAtivar={() => {
            const proximo = pacientes.fase === 'pronto' ? pacientes.proximoCursor : null;
            if (!proximo) return;
            cursoresRef.current = [...cursoresRef.current.slice(0, pagina + 1), proximo];
            void carregar(pagina + 1);
          }}
        >
          Próxima página
        </Botao>
        <Botao peso="secundario" disabled={enviando} aoAtivar={ocultar}>
          Fechar
        </Botao>
      </div>
    </section>
  );
}
