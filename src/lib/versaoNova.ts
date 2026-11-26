/**
 * O texto de /build-id.txt indica uma versão publicada diferente da que a aba está rodando?
 * Só vale um id de verdade: se vier uma página HTML (rewrite do servidor) ou vazio, não é versão nova.
 */
export function haVersaoNova(publicado: string, daAba: string): boolean {
  const id = publicado.trim();
  return /^[A-Za-z0-9_-]{6,64}$/.test(id) && id !== daAba;
}
