import type { Product, ProductType } from "../../../types";

/**
 * Registro de campos específicos por tipo de item do catálogo (Products).
 * Os valores ficam em `products.type_attributes` (jsonb) sob as chaves abaixo.
 * ATENÇÃO: não renomeie chaves — outros módulos (PDV/varejo, n8n, migrações) leem estes nomes.
 */
export type TypeFieldKind = "text" | "number" | "money" | "select" | "bool" | "textarea";

export interface TypeField {
  key: string;
  label: string;
  kind: TypeFieldKind;
  options?: string[];
  placeholder?: string;
  /** valor exibido (e assumido) quando a chave ainda não foi gravada — mantém o comportamento antigo dos selects */
  defaultValue?: string;
  /** largura no grid de 2 colunas: "full" ocupa a linha inteira */
  width?: "half" | "full";
  /** onde renderizar: "info" (padrão) ou "estoque" (status de disponibilidade) */
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

/** Subtítulo compacto para listas/grades (Imóvel e Veículo). Retorna "" para os demais tipos. */
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
  return parts.join(" · ");
}
