import { type ComponentProps, useLayoutEffect, useState } from 'react';
import {
  criarServicoTurnoExecucaoHttp,
  type ServicoTurnoExecucao,
} from './servico-turno-execucao-http.ts';
import { RelatoriosTurno } from './turno-execucao-relatorios.js';

type PropsRelatoriosTurnoFamilia = Pick<
  ComponentProps<typeof RelatoriosTurno>,
  'acessoPerdido' | 'alteracaoPendente'
> & {
  pacienteId: string;
  identidadeAtual: Parameters<typeof criarServicoTurnoExecucaoHttp>[1];
};

export function RelatoriosTurnoFamilia(props: PropsRelatoriosTurnoFamilia) {
  return <RelatoriosTurnoDoPaciente key={props.pacienteId} {...props} />;
}

function RelatoriosTurnoDoPaciente({
  pacienteId,
  identidadeAtual,
  acessoPerdido,
  alteracaoPendente,
}: PropsRelatoriosTurnoFamilia) {
  const [servico, definirServico] = useState<ServicoTurnoExecucao | null>(null);

  useLayoutEffect(() => {
    const atual = criarServicoTurnoExecucaoHttp(pacienteId, identidadeAtual);
    definirServico(atual);
    return () => atual.desmontar();
  }, [pacienteId, identidadeAtual]);

  if (!servico) return null;
  return (
    <RelatoriosTurno
      servico={servico}
      familia
      acessoPerdido={acessoPerdido}
      alteracaoPendente={alteracaoPendente}
    />
  );
}
