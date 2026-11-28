/** Leitura dos registros de execução do turno (VIS-018). Cada valor é apresentado
 *  como registrado. O estado emocional é declarado como observado. */
import type {
  RegistroExecucaoPublico,
  RelatorioTurnoPublico,
} from '../packages/contracts/src/turno-execucao-http.ts';
import './estilos/tema.css';
import { rotulosClasse, rotuloSinal } from './turno-execucao-editor.js';

export function dataTurno(valor: string) {
  return new Date(valor).toLocaleString('pt-BR');
}

const rotulos: Record<string, string> = {
  cafe: 'Café',
  almoco: 'Almoço',
  lanche: 'Lanche',
  jantar: 'Jantar',
  ceia: 'Ceia',
  total: 'Total',
  parcial: 'Parcial',
  minima: 'Mínima',
  recusou: 'Recusou',
  tranquilo: 'Tranquilo',
  agitado: 'Agitado',
  nao_dormiu: 'Não dormiu',
  urina: 'Urina',
  fezes: 'Fezes',
  administrado: 'Administrado',
  recusado: 'Recusado',
  adiado: 'Adiado',
  nao_administrado: 'Não administrado',
};

/** `rótulo: valor` numa linha só. O rótulo recebe tom suave, nunca o oliva da marca —
 *  3,35:1 sobre branco reprova para texto (`design.md:78-80`). O espaço entre rótulo e
 *  valor é explícito para o `textContent` continuar lendo "Rótulo: valor", que é o que
 *  as provas desta tela procuram. */
export function LinhaRegistro({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <p className="m-0 max-w-[68ch] text-(length:--texto-2) leading-[1.5]">
      <span className="text-texto-suave">{rotulo}:</span> {valor}
    </p>
  );
}

function Corpo({ conteudo }: { conteudo: RegistroExecucaoPublico['conteudo'] }) {
  if (conteudo.classe === 'afericao')
    return (
      <LinhaRegistro
        rotulo={rotuloSinal(conteudo.dados.tipo)}
        valor={`${conteudo.dados.valor} ${conteudo.dados.unidade}`}
      />
    );
  if (conteudo.classe === 'prescricao') {
    const dados = conteudo.dados;
    const campos: readonly [string, string][] = [
      ['Medicamento transcrito', dados.nome],
      ['Dose prescrita', dados.dose],
      ['Via prescrita', dados.via],
      ['Horários previstos', dados.horarios.join(', ')],
      ['Vigência inicial', dataTurno(dados.vigencia_inicio)],
      [
        'Vigência final',
        dados.vigencia_fim ? dataTurno(dados.vigencia_fim) : 'Não informada na fonte',
      ],
      ['Fonte documental', dados.fonte_documental],
    ];
    return campos.map(([nome, valor]) => <LinhaRegistro key={nome} rotulo={nome} valor={valor} />);
  }
  if (conteudo.classe === 'administracao') {
    const dados = conteudo.dados;
    return (
      <>
        <LinhaRegistro rotulo="Executor declarado — quem administrou" valor={dados.executor.nome} />
        <LinhaRegistro rotulo="Vínculo declarado do executor" valor={dados.executor.vinculo} />
        <LinhaRegistro rotulo="Situação" valor={rotulos[dados.situacao] ?? dados.situacao} />
        <LinhaRegistro rotulo="Versão da prescrição referenciada" valor={String(dados.versao)} />
        {dados.motivo ? <LinhaRegistro rotulo="Motivo da situação" valor={dados.motivo} /> : null}
      </>
    );
  }
  if (conteudo.classe === 'ocorrencia')
    return (
      <>
        <LinhaRegistro rotulo="Descrição" valor={conteudo.dados.descricao} />
        <LinhaRegistro rotulo="Providência tomada" valor={conteudo.dados.providencia} />
      </>
    );
  const dados = conteudo.dados;
  return (
    <>
      {dados.tipo === 'refeicao' ? (
        <>
          <LinhaRegistro
            rotulo="Momento da refeição"
            valor={rotulos[dados.momento] ?? dados.momento}
          />
          <LinhaRegistro
            rotulo="Aceitação observada"
            valor={rotulos[dados.aceitacao] ?? dados.aceitacao}
          />
        </>
      ) : dados.tipo === 'hidratacao' ? (
        <LinhaRegistro rotulo="Hidratação informada" valor={`${dados.mililitros} mL`} />
      ) : dados.tipo === 'sono' ? (
        <>
          <LinhaRegistro rotulo="Início do sono" valor={dataTurno(dados.inicio)} />
          <LinhaRegistro rotulo="Fim do sono" valor={dataTurno(dados.fim)} />
          <LinhaRegistro
            rotulo="Qualidade observada"
            valor={rotulos[dados.qualidade] ?? dados.qualidade}
          />
        </>
      ) : dados.tipo === 'eliminacao' ? (
        <>
          <LinhaRegistro
            rotulo="Eliminação"
            valor={rotulos[dados.eliminacao] ?? dados.eliminacao}
          />
          <LinhaRegistro rotulo="Contagem observada" valor={String(dados.contagem)} />
        </>
      ) : (
        /* Estado emocional observado (FR-076): termo declarado, vindo do catálogo
           administrado. O rótulo diz "observado" de propósito — não é medida, não é
           escala validada e não há número algum a apresentar. */
        <LinhaRegistro
          rotulo="Estado emocional observado"
          valor={rotulos[dados.qualidade] ?? dados.qualidade}
        />
      )}
      {dados.observacao ? (
        <LinhaRegistro rotulo="Observações adicionais" valor={dados.observacao} />
      ) : null}
    </>
  );
}

/* `.turno-execucao__registro` é preservada de propósito: é gancho de folha de estilo e de
   prova fora do alcance desta frente, e trocá-la não entrega nada a quem usa. */
const classeRegistro =
  'turno-execucao__registro grid min-w-0 gap-1 rounded-cartao border border-borda bg-superficie p-4';

export function RegistroTurno({ registro }: { registro: RegistroExecucaoPublico }) {
  const conteudo = registro.conteudo;
  return (
    <article className={classeRegistro}>
      <h4 className="m-0 mb-1 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
        {`${rotulosClasse[conteudo.classe]} · versão ${registro.versao}`}
      </h4>
      <LinhaRegistro
        rotulo="Registrador"
        valor={registro.registrador_nome ?? 'Registrador sem identificação disponível'}
      />
      <LinhaRegistro rotulo="Registrado pelo sistema em" valor={dataTurno(registro.criado_em)} />
      <LinhaRegistro rotulo="Instante informado" valor={dataTurno(registro.instante_ocorrencia)} />
      {registro.retificada ? (
        <p className="m-0 text-(length:--texto-1) text-texto-suave">
          Versão anterior preservada no histórico.
        </p>
      ) : null}
      <Corpo conteudo={conteudo} />
      {registro.motivo ? (
        <LinhaRegistro rotulo="Motivo da retificação" valor={registro.motivo} />
      ) : null}
    </article>
  );
}

function tituloRelatorio(tipo: RelatorioTurnoPublico['tipo']) {
  return tipo === 'semanal'
    ? 'Consolidado de sete dias'
    : tipo === 'diario'
      ? 'Consolidado diário'
      : tipo === 'caso'
        ? 'Exportação do caso'
        : 'Relatório de turno';
}

export function RelatorioTurno({ relatorio }: { relatorio: RelatorioTurnoPublico }) {
  return (
    <section className="grid min-w-0 gap-3">
      <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
        {tituloRelatorio(relatorio.tipo)}
      </h3>
      <p className="m-0 max-w-[68ch] text-(length:--texto-2)">
        {`${dataTurno(relatorio.inicio)} a ${dataTurno(relatorio.fim)}. Dados consultados na persistência, conforme sua autorização.`}
      </p>
      {relatorio.itens.length ? null : (
        <p className="m-0 text-(length:--texto-2)">Nenhum registro neste período.</p>
      )}
      {relatorio.itens.map((evento) => {
        const dados = evento.dados;
        if ('registrador_usuario_id' in dados)
          return <RegistroTurno key={evento.id} registro={dados} />;
        if ('aberto_em' in dados)
          return (
            <article key={evento.id} className={classeRegistro}>
              <h4 className="m-0 mb-1 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
                Turno
              </h4>
              <LinhaRegistro rotulo="Abertura registrada" valor={dataTurno(dados.aberto_em)} />
              {dados.encerrado_em ? (
                <LinhaRegistro
                  rotulo="Encerramento registrado"
                  valor={dataTurno(dados.encerrado_em)}
                />
              ) : null}
              <LinhaRegistro
                rotulo="Situação"
                valor={dados.situacao === 'aberto' ? 'Aberto' : 'Encerrado'}
              />
            </article>
          );
        if ('autor_nome' in dados)
          return (
            <article key={evento.id} className={classeRegistro}>
              <h4 className="m-0 mb-1 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
                Passagem de turno
              </h4>
              <LinhaRegistro
                rotulo="Autor"
                valor={dados.autor_nome ?? 'Autor sem identificação disponível'}
              />
              <LinhaRegistro rotulo="Publicada em" valor={dataTurno(dados.publicado_em)} />
              <LinhaRegistro
                rotulo="Audiência"
                valor={dados.audiencia === 'equipe' ? 'Equipe' : 'Equipe e família'}
              />
              <p className="m-0 max-w-[68ch] whitespace-pre-wrap text-(length:--texto-2)">
                {dados.conteudo}
              </p>
            </article>
          );
        return null;
      })}
      {relatorio.lacunas.map((lacuna) => (
        <p
          key={`${lacuna.inicio}-${lacuna.fim}`}
          className="m-0 text-(length:--texto-2) text-texto-suave"
        >
          {`Lacuna de cobertura: ${dataTurno(lacuna.inicio)} a ${dataTurno(lacuna.fim)}.`}
        </p>
      ))}
      <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
        Valores apresentados como registrados, sem interpretação clínica automática.
      </p>
    </section>
  );
}
