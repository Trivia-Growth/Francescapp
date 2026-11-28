// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { responderConfirmacoes } from './confirmacao-prova.js';
import { PainelRevogacao, type PropsPainel, type PunhoInterno } from './revogacao-vinculo.js';

function montarRevogacaoVinculo(
  raiz: HTMLElement,
  revogar: PropsPainel['revogar'],
  atualizarVinculos: PropsPainel['atualizarVinculos'],
  acessoPerdido: PropsPainel['acessoPerdido'],
  alteracaoPendente: PropsPainel['alteracaoPendente'],
): PunhoInterno {
  const abortar = new AbortController();
  let punho: PunhoInterno | undefined;
  render(
    <PainelRevogacao
      revogar={revogar}
      atualizarVinculos={atualizarVinculos}
      acessoPerdido={acessoPerdido}
      alteracaoPendente={alteracaoPendente}
      sinal={abortar.signal}
      registrar={(recebido) => {
        punho = recebido;
      }}
    />,
    { container: raiz },
  );
  if (!punho) throw new Error('Painel de revogação indisponível.');
  return punho;
}

/* REESCRITA nomeada (VIS-018). Antes, as provas escreviam `motivo.value = …` e
 * despachavam um `Event('input')` cru. Isso não é o comportamento de quem digita: é a
 * implementação de um campo não controlado sendo imitada por fora. O navegador emite um
 * evento que borbulha, e o campo passou a ser controlado pelo componente. `fireEvent`
 * produz exatamente o evento do navegador, então a prova voltou a afirmar o que sempre
 * quis afirmar — que digitar um motivo marca alteração pendente e que o motivo digitado é
 * o que vai para o servidor —, sem depender de como o campo guarda o valor. */
const digitar = (campo: HTMLTextAreaElement, texto: string) =>
  fireEvent.input(campo, { target: { value: texto } });

it('exige confirmação, envia versão e reconsulta após resposta incerta sem repetir', async () => {
  const raiz = document.createElement('div');
  const confirmacoes = responderConfirmacoes(false);
  const revogar = vi.fn().mockRejectedValue(new Error('resposta perdida'));
  const atualizar = vi.fn().mockResolvedValue(undefined);
  const pendente = vi.fn();
  const tela = montarRevogacaoVinculo(raiz, revogar, atualizar, () => false, pendente);
  await tela.selecionar({ id: 'acesso', versao: 3, nome: 'Pessoa fictícia' });
  const motivo = raiz.querySelector('textarea') as HTMLTextAreaElement;
  digitar(motivo, 'Motivo fictício');
  const botao = raiz.querySelector('button') as HTMLButtonElement;
  botao.click();
  await vi.waitFor(() => expect(confirmacoes.chamadas).toHaveLength(1));
  expect(confirmacoes.chamadas[0]).toContain('Revogar o acesso de Pessoa fictícia?');
  expect(revogar).not.toHaveBeenCalled();
  confirmacoes.resposta = true;
  botao.click();
  await vi.waitFor(() => expect(atualizar).toHaveBeenCalledOnce());
  expect(revogar).toHaveBeenCalledOnce();
  expect(revogar).toHaveBeenCalledWith('acesso', { versao_esperada: 3, motivo: 'Motivo fictício' });
  expect(raiz.textContent).toContain('O pedido ainda pode ser concluído');
  expect(motivo.value).toBe('Motivo fictício');
  expect(pendente).toHaveBeenLastCalledWith(true);
  await vi.waitFor(() => expect(botao.disabled).toBe(true));
  await tela.selecionar({ id: 'outro', versao: 1, nome: 'Outra pessoa' });
  botao.click();
  expect(revogar).toHaveBeenCalledOnce();
  expect(raiz.textContent).toContain('O pedido ainda pode ser concluído');
  confirmacoes.encerrar();
});

it('exige nova seleção após atualização para usar versão atual', async () => {
  const raiz = document.createElement('div');
  const confirmacoes = responderConfirmacoes(true);
  const revogar = vi.fn().mockResolvedValue({ id: 'acesso', versao: 3 });
  const tela = montarRevogacaoVinculo(
    raiz,
    revogar,
    async () => {},
    () => false,
    () => {},
  );
  await tela.selecionar({ id: 'acesso', versao: 1, nome: 'Pessoa' });
  const motivo = raiz.querySelector('textarea') as HTMLTextAreaElement;
  digitar(motivo, 'Motivo fictício');
  const botao = raiz.querySelector('button') as HTMLButtonElement;
  tela.invalidarSelecao();
  botao.click();
  expect(revogar).not.toHaveBeenCalled();
  expect(motivo.value).toBe('Motivo fictício');
  await tela.selecionar({ id: 'acesso', versao: 2, nome: 'Pessoa' });
  botao.click();
  await vi.waitFor(() => expect(revogar).toHaveBeenCalledOnce());
  expect(revogar).toHaveBeenCalledWith('acesso', { versao_esperada: 2, motivo: 'Motivo fictício' });
  confirmacoes.encerrar();
});
