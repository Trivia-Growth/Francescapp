/** Referências identificam segredos no Vault; nenhuma chave é configurada no ambiente. */
export function configurarIdempotenciaConcessao(
  fonte: Readonly<Record<string, string | undefined>>,
) {
  const ativa = fonte.FFCM_VAULT_IDEMPOTENCIA_EQUIPE_ATIVA;
  const mapa = fonte.FFCM_VAULT_IDEMPOTENCIA_EQUIPE_REFERENCIAS;
  if (!ativa || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(ativa) || !mapa || mapa.length > 4096)
    throw new Error('Configuração indisponível.');
  const entradas = mapa.split(',');
  if (entradas.length > 16) throw new Error('Configuração indisponível.');
  const referencias: Record<string, string> = Object.create(null);
  const vistos = new Set<string>();
  for (const entrada of entradas) {
    const partes = entrada.split('=');
    const [id, referencia] = partes;
    if (
      partes.length !== 2 ||
      !id ||
      !referencia ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) ||
      !/^ffcmapp\.cifra\.[a-z0-9][a-z0-9_-]{0,63}$/.test(referencia) ||
      Object.hasOwn(referencias, id) ||
      vistos.has(referencia)
    )
      throw new Error('Configuração indisponível.');
    referencias[id] = referencia;
    vistos.add(referencia);
  }
  if (!Object.hasOwn(referencias, ativa)) throw new Error('Configuração indisponível.');
  return Object.freeze({ ativa, referencias: Object.freeze(referencias) });
}
