/** Esqueleto de carregamento. A lista de pessoas já carregava assim; ficha, cadastro e
 *  contatos usavam texto solto, e a troca de linguagem visual a cada tela parecia defeito. */
export function esqueletoCarregando(linhas = 3, compacto = false): HTMLElement {
  const bloco = document.createElement('div');
  bloco.className = 'list-loading';
  if (compacto) bloco.dataset.compacto = '';
  // O texto de carregamento continua no elemento com role="status" de cada tela.
  bloco.setAttribute('aria-hidden', 'true');
  for (let linha = 0; linha < linhas; linha += 1) bloco.append(document.createElement('span'));
  return bloco;
}
