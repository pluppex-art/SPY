import type { Product, ProductType } from "../../../types";

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

const STATUS_IMOVEL = ["Disponível", "Reservado", "Vendido", "Locado"];
const STATUS_VEICULO = ["Disponível", "Reservado", "Vendido", "Em Preparação"];

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
  "Imóvel": {
    type: "Imóvel",
    uniqueAsset: true,
    modules: ["imobiliaria"],
    sectionTitle: "Dados do imóvel",
    fields: [
      { key: "tipoImovel", label: "Tipo de imóvel", kind: "select", options: ["Apartamento", "Casa", "Cobertura", "Kitnet", "Terreno", "Comercial", "Sala Comercial", "Galpão", "Rural"], defaultValue: "Apartamento" },
      { key: "operacao", label: "Operação", kind: "select", options: ["Venda", "Locação"], defaultValue: "Venda" },
      { key: "endereco", label: "Endereço", kind: "text", placeholder: "Rua, número", width: "full" },
      { key: "bairro", label: "Bairro", kind: "text" },
      { key: "cidade", label: "Cidade", kind: "text" },
      { key: "areaM2", label: "Área (m²)", kind: "number" },
      { key: "quartos", label: "Quartos", kind: "number" },
      { key: "banheiros", label: "Banheiros", kind: "number" },
      { key: "suites", label: "Suítes", kind: "number" },
      { key: "vagas", label: "Vagas de garagem", kind: "number" },
      { key: "condominio", label: "Condomínio (R$/mês)", kind: "money" },
      { key: "iptu", label: "IPTU (R$)", kind: "money" },
      { key: "corretor", label: "Corretor responsável", kind: "text" },
      { key: "statusAtivo", label: "Disponibilidade", kind: "select", options: STATUS_IMOVEL, defaultValue: "Disponível", tab: "estoque" },
    ],
  },
  "Veículo": {
    type: "Veículo",
    uniqueAsset: true,
    modules: ["automotivo", "concessionaria"],
    sectionTitle: "Dados do veículo",
    fields: [
      { key: "marca", label: "Marca", kind: "text", placeholder: "Ex: Fiat" },
      { key: "modelo", label: "Modelo", kind: "text", placeholder: "Ex: Argo Drive 1.3" },
      { key: "anoFabricacao", label: "Ano de fabricação", kind: "number", placeholder: "2022" },
      { key: "anoModelo", label: "Ano do modelo", kind: "number", placeholder: "2022" },
      { key: "km", label: "Quilometragem (km)", kind: "number" },
      { key: "placa", label: "Placa", kind: "text", placeholder: "ABC1D23" },
      { key: "cor", label: "Cor", kind: "text" },
      { key: "combustivel", label: "Combustível", kind: "select", options: ["Flex", "Gasolina", "Diesel", "Elétrico", "Híbrido"], defaultValue: "Flex" },
      { key: "cambio", label: "Câmbio", kind: "select", options: ["Manual", "Automático", "CVT"], defaultValue: "Manual" },
      { key: "vendedor", label: "Vendedor responsável", kind: "text" },
      { key: "isConsignado", label: "Veículo consignado", kind: "bool", width: "full" },
      { key: "consignanteNome", label: "Nome do consignante", kind: "text", showIf: (a) => !!a.isConsignado },
      { key: "consignanteTelefone", label: "Telefone do consignante", kind: "text", showIf: (a) => !!a.isConsignado },
      { key: "comissaoPercentual", label: "Comissão (%)", kind: "number", showIf: (a) => !!a.isConsignado },
      { key: "repasseRealizado", label: "Repasse ao consignante realizado", kind: "bool", width: "full", showIf: (a) => !!a.isConsignado },
      { key: "statusAtivo", label: "Disponibilidade", kind: "select", options: STATUS_VEICULO, defaultValue: "Disponível", tab: "estoque" },
    ],
  },
};

export function getTypeSchema(type: string | undefined | null): TypeSchema | undefined {
  return type ? TYPE_SCHEMAS[type] : undefined;
}

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

const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "")) || 0);
const fmtKm = (v: unknown) => `${num(v).toLocaleString("pt-BR")} km`;

/** Subtítulo compacto para listas/grades (Imóvel, Veículo e Produto físico). Retorna "" para os demais tipos. */
export function getProductSubtitle(p: Pick<Product, "type" | "typeAttributes">): string {
  const a = (p.typeAttributes || {}) as TypeAttrs;
  const parts: string[] = [];
  if (p.type === "Imóvel") {
    if (a.tipoImovel) parts.push(String(a.tipoImovel));
    if (num(a.quartos)) parts.push(`${num(a.quartos)} qts`);
    if (num(a.banheiros)) parts.push(`${num(a.banheiros)} banh`);
    if (num(a.vagas)) parts.push(`${num(a.vagas)} vaga${num(a.vagas) > 1 ? "s" : ""}`);
    if (num(a.areaM2)) parts.push(`${num(a.areaM2)} m²`);
    if (a.bairro) parts.push(String(a.bairro));
  } else if (p.type === "Veículo") {
    const nome = [a.marca, a.modelo].filter(Boolean).join(" ");
    const ano = a.anoModelo || a.anoFabricacao;
    const head = [nome, ano].filter(Boolean).join(" ");
    if (head) parts.push(head);
    if (num(a.km)) parts.push(fmtKm(a.km));
    if (a.placa) parts.push(String(a.placa));
  }
  else if (p.type === "Físico") {
    if (a.marca) parts.push(String(a.marca));
    if (a.tamanho) parts.push(`Tam ${a.tamanho}`);
    if (a.cor) parts.push(String(a.cor));
    const code = a.ean || a.barcode;
    if (code) parts.push(`EAN ${code}`);
  }
  return parts.join(" · ");
}
