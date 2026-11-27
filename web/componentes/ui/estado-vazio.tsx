import type { ReactNode } from 'react';

/** Estado vazio: o que houve e, quando existe, o que fazer a seguir (`ui.css:` bloco
 *  `.ui-vazio`).
 *
 *  Fica DENTRO do painel, não no lugar dele. Sem ilustração: o espaço já separa, e um
 *  desenho decorativo rouba a atenção da única coisa que importa aqui, que é o próximo
 *  passo. Sem inventar métrica nem progresso para preencher o vazio. */
export function EstadoVazio({
  titulo,
  texto,
  acao,
}: {
  titulo: ReactNode;
  texto?: ReactNode;
  /** O próximo passo. Omitir quando não há nada que a pessoa possa fazer dali. */
  acao?: ReactNode;
}) {
  return (
    <div className="grid justify-items-start gap-2 rounded-cartao border border-dashed border-borda bg-superficie px-5 py-7">
      {/* Corpo em Raleway, não a serifa de título. Medido em 25/11/2026: com
          `font-serifada` a 25px, "Nenhuma pessoa com acesso cadastrado" era lido como
          CABEÇALHO DE SEÇÃO, e a tela parecia ter uma seção a mais que não existia.
          Vazio é aviso sobre a região, não assunto novo — e a regra "dado operacional não
          é editorial" já reserva a serifa ao que se lê em prosa. */}
      <p className="m-0 text-(length:--texto-2) font-semibold">{titulo}</p>
      {texto === undefined ? null : <p className="m-0 max-w-[68ch] text-texto-suave">{texto}</p>}
      {acao}
    </div>
  );
}
