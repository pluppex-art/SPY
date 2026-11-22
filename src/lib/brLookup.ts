// Consultas públicas de CNPJ e CEP (BrasilAPI) usadas no formulário de implementação — funciona
// também na página pública do cliente (chamada direta do navegador, sem credencial).

export const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

export function formatCnpjMask(input: string): string {
  const d = onlyDigits(input).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function formatCepMask(input: string): string {
  const d = onlyDigits(input).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Valida os dígitos verificadores do CNPJ (rejeita sequências repetidas). */
export function isValidCnpj(input: string): boolean {
  const d = onlyDigits(input);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export interface CnpjInfo {
  razao_social: string;
  nome_fantasia: string;
  situacao: string;
  segmento: string;
  endereco: string;
  cep: string;
  email: string;
  telefone: string;
}

export class LookupError extends Error {}

async function getJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 404) throw new LookupError("Não encontrado.");
    if (res.status === 400) throw new LookupError("Formato inválido.");
    if (!res.ok) throw new LookupError("O serviço de consulta está indisponível agora. Preencha manualmente.");
    return await res.json();
  } catch (e: any) {
    if (e instanceof LookupError) throw e;
    throw new LookupError(e?.name === "AbortError" ? "A consulta demorou demais. Tente de novo." : "Não foi possível consultar agora. Preencha manualmente.");
  } finally {
    clearTimeout(timer);
  }
}

/** Consulta de reserva pelo servidor do SPY (exige login); qualquer falha devolve null e vale o erro original. */
async function reservaDoServidor(caminho: string): Promise<any | null> {
  try {
    const { apiFetch } = await import("./apiClient");
    const r = await apiFetch(caminho);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

const title = (s: string) => (s || "").trim();

export async function fetchCnpj(input: string): Promise<CnpjInfo> {
  const d = onlyDigits(input);
  if (!isValidCnpj(d)) throw new LookupError("CNPJ inválido — confira os dígitos.");
  let j: any;
  try { j = await getJson(`https://brasilapi.com.br/api/cnpj/v1/${d}`); }
  catch (e) {
    if (e instanceof LookupError && e.message === "Não encontrado.") throw new LookupError("CNPJ não encontrado na Receita.");
    // BrasilAPI fora do ar: o servidor tenta a fonte reserva (Receita WS).
    const r = await reservaDoServidor(`/api/br/cnpj/${d}`);
    if (!r) throw e;
    return { razao_social: r.razaoSocial, nome_fantasia: r.fantasia, situacao: r.situacao, segmento: r.cnaeDescricao,
      endereco: [r.endereco, [r.cidade, r.uf].filter(Boolean).join("/")].filter(Boolean).join(" — "), cep: r.cep, email: r.email, telefone: onlyDigits(r.telefone) };
  }
  const rua = [title(j.descricao_tipo_de_logradouro), title(j.logradouro)].filter(Boolean).join(" ");
  const endereco = [
    [rua, j.numero && j.numero !== "S/N" ? title(j.numero) : null].filter(Boolean).join(", "),
    title(j.complemento), title(j.bairro), [title(j.municipio), title(j.uf)].filter(Boolean).join("/"),
  ].filter(Boolean).join(" — ");
  const tel = onlyDigits(j.ddd_telefone_1 || "");
  return {
    razao_social: title(j.razao_social),
    nome_fantasia: title(j.nome_fantasia),
    situacao: title(j.descricao_situacao_cadastral),
    segmento: title(j.cnae_fiscal_descricao),
    endereco,
    cep: onlyDigits(j.cep || ""),
    email: title(j.email).toLowerCase(),
    telefone: tel,
  };
}

export interface CepInfo { endereco: string; cidade: string; uf: string }

export async function fetchCep(input: string): Promise<CepInfo> {
  const d = onlyDigits(input);
  if (d.length !== 8) throw new LookupError("CEP precisa ter 8 dígitos.");
  let j: any;
  try { j = await getJson(`https://brasilapi.com.br/api/cep/v2/${d}`); }
  catch (e) {
    if (e instanceof LookupError && e.message === "Não encontrado.") throw new LookupError("CEP não encontrado.");
    // BrasilAPI fora do ar: o servidor tenta a fonte reserva (ViaCEP).
    const r = await reservaDoServidor(`/api/br/cep/${d}`);
    if (!r) throw e;
    return { endereco: [r.logradouro, r.bairro, [r.cidade, r.uf].filter(Boolean).join("/")].filter(Boolean).join(" — "), cidade: r.cidade, uf: r.uf };
  }
  const endereco = [title(j.street), title(j.neighborhood), [title(j.city), title(j.state)].filter(Boolean).join("/")].filter(Boolean).join(" — ");
  return { endereco, cidade: title(j.city), uf: title(j.state) };
}
