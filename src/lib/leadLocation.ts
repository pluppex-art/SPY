// Cidade e estado do lead. O sistema guarda a cidade em dois lugares (coluna `city` e `customFields.cidade`, do formulário
// do lead) e o estado em `state` ou `customFields.estado`; as telas devem ler pelos dois para nunca mostrar "vazio" à toa.
const clean = (v: unknown) => String(v ?? "").trim();

export function leadCity(l: any): string {
  return clean(l?.city) || clean(l?.customFields?.cidade);
}

/** UF em maiúsculas (2 letras) quando for sigla; senão o texto como veio. */
export function leadState(l: any): string {
  const raw = clean(l?.state) || clean(l?.customFields?.estado) || clean(l?.customFields?.uf);
  return /^[a-zA-Z]{2}$/.test(raw) ? raw.toUpperCase() : raw;
}
