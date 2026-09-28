/**
 * Lista de municípios do Brasil (IBGE) — fonte pro autocomplete de "Cidade"
 * do CRM (NewLeadModal/CompanyBlock e ProfileDataForm). Endpoint público, sem
 * chave, CORS liberado — mesmo padrão já usado pra CNPJ via BrasilAPI direto
 * do navegador (ProfileSection.tsx/NewLeadModal.tsx).
 *
 * Busca a lista inteira (~5.570 municípios) só UMA vez e cacheia em memória
 * pro resto da sessão — não muda em tempo real, não faz sentido rebuscar a
 * cada campo aberto. `inflight` evita duas chamadas concorrentes se dois
 * campos de cidade abrirem quase juntos (ex.: um formulário com mais de um
 * campo de cidade no futuro).
 */
export interface Cidade {
  nome: string;
  /** Sigla do estado (ex.: "SP") — vazio quando o formato de resposta da API
   * mudar de um jeito que não bate com os dois caminhos testados abaixo
   * (nunca quebra a lista inteira por causa disso, só perde o UF daquele item). */
  uf: string;
}

let cache: Cidade[] | null = null;
let inflight: Promise<Cidade[]> | null = null;

export function fetchCidadesIBGE(): Promise<Cidade[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;

  inflight = fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios")
    .then((res) => (res.ok ? res.json() : []))
    .then((data: any[]) => {
      const cidades: Cidade[] = (data || [])
        .map((m) => ({
          nome: m?.nome as string,
          uf:
            m?.microrregiao?.mesorregiao?.UF?.sigla ||
            m?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ||
            "",
        }))
        .filter((c) => !!c.nome);
      cache = cidades;
      return cidades;
    })
    .catch(() => {
      // Sem conexão/API fora do ar: devolve lista vazia (autocomplete some,
      // campo continua um texto livre normal) — nunca quebra o formulário.
      return [];
    })
    .finally(() => { inflight = null; });

  return inflight;
}
