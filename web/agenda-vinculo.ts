type Pagina = { itens: readonly { id: string; nome: string }[]; proximo_cursor: string | null };

export function montarVinculoAgenda(
  raiz: HTMLElement,
  cabecalhos: () => Headers,
  listar: (cursor?: string) => Promise<Pagina>,
) {
  let ativa = true;
  let ocupado = false;
  let revisao = 0;
  let eventoId = '';
  let cursores: (string | undefined)[] = [undefined];
  let pagina = 0;
  let proximo: string | null = null;
  const secao = document.createElement('section');
  secao.hidden = true;
  const titulo = document.createElement('h3');
  titulo.textContent = 'Vincular compromisso a paciente';
  const descricao = document.createElement('p');
  descricao.textContent =
    'Selecione um paciente disponível para seu acesso. Nenhum dado do paciente será enviado ao Google.';
  const evento = document.createElement('p');
  const estado = document.createElement('p');
  estado.setAttribute('role', 'status');
  estado.setAttribute('aria-live', 'polite');
  const lista = document.createElement('div');
  const anterior = document.createElement('button');
  anterior.type = 'button';
  anterior.className = 'button-secondary';
  anterior.textContent = 'Página anterior';
  const seguinte = document.createElement('button');
  seguinte.type = 'button';
  seguinte.className = 'button-secondary';
  seguinte.textContent = 'Próxima página';
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'button-secondary';
  fechar.textContent = 'Fechar';
  secao.append(titulo, descricao, evento, estado, lista, anterior, seguinte, fechar);
  raiz.append(secao);
  async function carregar() {
    const numero = ++revisao;
    lista.replaceChildren();
    anterior.disabled = seguinte.disabled = true;
    estado.textContent = 'Consultando pacientes…';
    try {
      const dados = await listar(cursores[pagina]);
      if (!ativa || numero !== revisao) return;
      proximo = dados.proximo_cursor;
      for (const paciente of dados.itens) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'button-secondary';
        botao.textContent = paciente.nome;
        botao.addEventListener('click', () => void vincular(paciente.id, paciente.nome));
        lista.append(botao);
      }
      estado.textContent = dados.itens.length
        ? 'Escolha o paciente para vincular.'
        : 'Nenhum paciente disponível nesta página.';
      anterior.disabled = pagina === 0;
      seguinte.disabled = !proximo;
    } catch {
      if (ativa && numero === revisao)
        estado.textContent = 'Não foi possível consultar pacientes. Feche e tente novamente.';
    }
  }
  async function vincular(pacienteId: string, nome: string) {
    if (ocupado || !eventoId || !window.confirm(`Vincular este compromisso a ${nome}?`)) return;
    ocupado = true;
    lista.replaceChildren();
    anterior.disabled = seguinte.disabled = fechar.disabled = true;
    estado.textContent = 'Aguardando confirmação do vínculo…';
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
      if (!ativa) return;
      if (!resposta.ok || !dados || typeof dados !== 'object' || !('estado' in dados))
        throw new Error();
      if (dados.estado === 'conflito') {
        estado.textContent =
          'Este compromisso já possui outro vínculo. Procure a equipe responsável.';
        return;
      }
      if (dados.estado !== 'vinculado') throw new Error();
      estado.textContent = 'Vínculo confirmado.';
    } catch {
      if (ativa) {
        estado.textContent =
          'Não foi possível confirmar o vínculo. Tente novamente com o mesmo paciente.';
        const repetir = document.createElement('button');
        repetir.type = 'button';
        repetir.className = 'button-secondary';
        repetir.textContent = 'Tentar novamente';
        repetir.addEventListener('click', () => void vincular(pacienteId, nome));
        lista.replaceChildren(repetir);
      }
    } finally {
      if (ativa) {
        ocupado = false;
        fechar.disabled = false;
      }
    }
  }
  anterior.addEventListener('click', () => {
    if (pagina > 0) {
      pagina -= 1;
      void carregar();
    }
  });
  seguinte.addEventListener('click', () => {
    if (proximo) {
      cursores = cursores.slice(0, pagina + 1);
      cursores.push(proximo);
      pagina += 1;
      void carregar();
    }
  });
  fechar.addEventListener('click', () => {
    if (!ocupado) {
      revisao += 1;
      secao.hidden = true;
      lista.replaceChildren();
    }
  });
  return {
    abrir: (id: string, horario: string) => {
      if (ocupado) return;
      eventoId = id;
      evento.textContent = `Compromisso: ${horario}`;
      cursores = [undefined];
      pagina = 0;
      secao.hidden = false;
      titulo.tabIndex = -1;
      titulo.focus();
      void carregar();
    },
    desmontar: () => {
      ativa = false;
      revisao += 1;
      secao.replaceChildren();
    },
  };
}
