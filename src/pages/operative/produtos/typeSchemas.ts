import type { Product, ProductType } from "../../../types";
import { NICHE_PROFILES, profileSubtitle, type NicheProfile } from "./nicheProfiles";

/**
 * Registro de campos específicos por tipo de item do catálogo (Products).
 * Os valores ficam em `products.type_attributes` (jsonb) sob as chaves abaixo.
 * ATENÇÃO: não renomeie chaves — outros módulos (PDV/varejo, n8n, migrações) leem estes nomes.
 */
export type TypeFieldKind = "text" | "number" | "money" | "select" | "bool" | "textarea" | "date";

export interface TypeField {
  key: string;
  label: string;
  kind: TypeFieldKind;
  options?: string[];
  /** rótulos curtos exibidos no lugar do valor gravado (chave = valor da option) */
  optionLabels?: Record<string, string>;
  /** só dígitos (ex.: NCM) */
  digitsOnly?: boolean;
  maxLength?: number;
  /** valor assumido para campos bool quando a chave ainda não foi gravada */
  defaultBool?: boolean;
  /** campo "avançado": agrupado em "Varejo", expandido só quando o tenant tem o módulo varejo */
  advanced?: boolean;
  placeholder?: string;
  /** valor exibido (e assumido) quando a chave ainda não foi gravada — mantém o comportamento antigo dos selects */
  defaultValue?: string;
  /** largura no grid de 2 colunas: "full" ocupa a linha inteira */
  width?: "half" | "full";
  /** onde renderizar: "info" (padrão) ou "estoque" (status de disponibilidade / logística) */
  tab?: "info" | "estoque";
  /** grupo rotulado (título do perfil de nicho) onde o campo extra é exibido; vazio = corpo principal */
  group?: string;
  /** só mostra o campo quando a condição for verdadeira */
  showIf?: (attrs: Record<string, string | number | boolean>) => boolean;
}

export interface TypeSchema {
  type: ProductType;
  /** Ativo único (imóvel, veículo): sem recorrência/estoque numérico, usa status de disponibilidade */
  uniqueAsset?: boolean;
  /** título da seção no modal */
  sectionTitle?: string;
  /** módulo(s) do tenant que habilitam este tipo (vazio = sempre disponível) */
  modules?: string[];
  fields: TypeField[];
}

export type TypeAttrs = Record<string, string | number | boolean>;

const GENEROS = ["Unissex", "Masculino", "Feminino", "Infantil"];
const UNIDADES = ["UN", "PAR", "CX", "KG", "L", "M", "PC"];
const ORIGENS = ["0", "1", "2", "3", "4", "5", "6", "7", "8"];
const ORIGEM_LABELS: Record<string, string> = {
  "0": "0 - Nacional",
  "1": "1 - Estrangeira (importação direta)",
  "2": "2 - Estrangeira (mercado interno)",
  "3": "3 - Nacional (import. 40-70%)",
  "4": "4 - Nacional (proc. básicos)",
  "5": "5 - Nacional (import. até 40%)",
  "6": "6 - Estrangeira (s/ similar, direta)",
  "7": "7 - Estrangeira (s/ similar, interna)",
  "8": "8 - Nacional (import. acima de 70%)",
};


export const TYPE_SCHEMAS: Record<string, TypeSchema> = {
  "Serviço": {
    type: "Serviço",
    fields: [
      { key: "duracao", label: "Duração estimada", kind: "text", placeholder: "Ex: 1h, 3 sessões" },
      { key: "modalidadeAtendimento", label: "Modalidade de atendimento", kind: "select", options: ["Presencial", "Remoto", "Híbrido"], defaultValue: "Presencial" },
    ],
  },
  "Assinatura": {
    type: "Assinatura",
    fields: [
      { key: "cicloCobranca", label: "Ciclo de cobrança", kind: "select", options: ["Mensal", "Trimestral", "Anual"], defaultValue: "Mensal" },
      { key: "diasTrial", label: "Dias de trial", kind: "number", placeholder: "Ex: 7" },
    ],
  },
  "Digital": {
    type: "Digital",
    fields: [
      { key: "tipoEntrega", label: "Tipo de entrega", kind: "select", options: ["Download", "Chave de Licença", "Acesso por Login"], defaultValue: "Download" },
      { key: "linkEntrega", label: "Link de entrega", kind: "text", placeholder: "https://..." },
    ],
  },
  "Físico": {
    type: "Físico",
    sectionTitle: "Identificação de estoque",
    fields: [
      { key: "barcode", label: "Código de barras", kind: "text", placeholder: "Leia ou digite o código" },
      { key: "ean", label: "EAN", kind: "text", placeholder: "EAN-13" },
      { key: "marca", label: "Marca", kind: "text", placeholder: "Ex: Nike", advanced: true },
      { key: "colecao", label: "Linha / Coleção", kind: "text", placeholder: "Ex: Verão 2026", advanced: true },
      { key: "tamanho", label: "Tamanho", kind: "text", placeholder: "Ex: 42, M, 500ml", advanced: true },
      { key: "cor", label: "Cor", kind: "text", advanced: true },
      { key: "genero", label: "Gênero", kind: "select", options: GENEROS, defaultValue: "Unissex", advanced: true },
      { key: "unidade", label: "Unidade de medida", kind: "select", options: UNIDADES, defaultValue: "UN", advanced: true },
      { key: "codigoInterno", label: "Código interno", kind: "text", advanced: true },
      { key: "ncm", label: "NCM", kind: "text", placeholder: "8 dígitos", digitsOnly: true, maxLength: 8, advanced: true },
      { key: "cest", label: "CEST", kind: "text", placeholder: "7 dígitos", digitsOnly: true, maxLength: 7, advanced: true },
      { key: "origemMercadoria", label: "Origem da mercadoria", kind: "select", options: ORIGENS, optionLabels: ORIGEM_LABELS, defaultValue: "0", advanced: true },
      { key: "precoPromocional", label: "Preço promocional (R$)", kind: "money", advanced: true },
      { key: "promoAte", label: "Promoção válida até", kind: "date", advanced: true },
      { key: "localizacao", label: "Localização (prateleira / depósito)", kind: "text", placeholder: "Ex: Corredor 3, Prateleira B", advanced: true, tab: "estoque", width: "full" },
      { key: "controlaEstoque", label: "Controla estoque", kind: "bool", defaultBool: true, advanced: true, tab: "estoque", width: "full" },
      { key: "permiteVendaSemEstoque", label: "Permite venda sem estoque", kind: "bool", advanced: true, tab: "estoque", width: "full" },
    ],
  },
  "Curso/Turma": {
    type: "Curso/Turma",
    fields: [
      { key: "cargaHoraria", label: "Carga horária (horas)", kind: "number" },
      { key: "modalidadeCurso", label: "Modalidade", kind: "select", options: ["Presencial", "EAD", "Híbrido"], defaultValue: "Presencial" },
      { key: "certificadoIncluso", label: "Inclui certificado", kind: "bool", width: "full" },
    ],
  },
  // Tipos de ativo único (Imóvel, Veículo...) vêm dos perfis de nicho (nicheProfiles.ts).
  ...Object.fromEntries(Object.values(NICHE_PROFILES).flatMap(p => p.ownSchemas).map(sc => [sc.type, sc])),
};

/**
 * Schema do tipo. Com `profiles` (perfis de nicho ativos), anexa os campos extras de cada perfil
 * ao tipo, sem chaves duplicadas, marcados com `group` = título do perfil.
 */
export function getTypeSchema(type: string | undefined | null, profiles?: NicheProfile[]): TypeSchema | undefined {
  const base = type ? TYPE_SCHEMAS[type] : undefined;
  if (!base || !profiles || profiles.length === 0) return base;
  const seen = new Set(base.fields.map(f => f.key));
  const extra: TypeField[] = [];
  profiles.forEach(p => {
    (p.typeFieldExtras[base.type] || []).forEach(f => {
      if (seen.has(f.key)) return;
      seen.add(f.key);
      extra.push({ ...f, group: f.group ?? p.sectionTitle });
    });
  });
  return extra.length ? { ...base, fields: [...base.fields, ...extra] } : base;
}

/** Tipos que normalmente não têm estoque físico. */
export const NO_STOCK_TYPES: string[] = ["Serviço", "Assinatura", "Digital", "Curso/Turma"];

export function isUniqueAssetType(type: string | undefined | null): boolean {
  return !!getTypeSchema(type)?.uniqueAsset;
}

/** Tipos disponíveis para quem não tem restrição de módulo. */
/** Rótulo visível do tipo (o valor gravado em products.type não muda). */
export function typeLabel(t: string): string {
  return t === "Físico" ? "Produto físico" : t;
}

export const BASE_TYPES: ProductType[] = ["Serviço", "Assinatura", "Digital", "Físico", "Curso/Turma"];

/** Mapeia o status de disponibilidade para os campos nativos de products. */
export function statusToStock(status: string | undefined) {
  const s = status || "Disponível";
  return {
    status: s,
    active: s !== "Vendido" && s !== "Locado",
    currentStock: s === "Disponível" ? 1 : 0,
    stockMin: 0,
    stockMax: 1,
  };
}

/** Subtítulo compacto para listas/grades — definido pelos perfis de nicho. Retorna "" quando não houver. */
export function getProductSubtitle(p: Pick<Product, "type" | "typeAttributes">): string {
  return profileSubtitle(p);
}
