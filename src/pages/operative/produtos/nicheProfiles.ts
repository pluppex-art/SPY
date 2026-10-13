import type { ProductType, Product } from "../../../types";
import type { TypeField, TypeSchema, TypeAttrs } from "./typeSchemas";

/**
 * REGISTRO DE PERFIS DE NICHO (verticais) do modal de produtos.
 *
 * COMO ADICIONAR UMA NOVA VERTICAL: basta incluir UMA entrada em NICHE_PROFILES abaixo
 * (chave = módulo principal do tenant). Nada mais precisa mudar: o modal de Novo/Editar
 * produto, as categorias, os tipos oferecidos, a aba Estoque e o subtítulo das listas
 * passam a refletir o perfil automaticamente quando o módulo estiver habilitado.
 *
 *  - moduleKeys: chaves de módulo (useAuth().isModuleEnabled) que ativam o perfil.
 *  - niches: valores de user.tenantNiche que tornam este o nicho PRIMÁRIO (decide o tipo padrão).
 *  - offeredTypes + ownSchemas: tipos novos que o nicho acrescenta (ex.: Imóvel, Veículo).
 *  - typeFieldExtras: campos extras anexados a um tipo existente (ex.: Serviço, Físico).
 *    São gravados em products.type_attributes — NUNCA renomeie chaves já usadas.
 *  - categories: sugestões de categoria; hiddenCommercialBlocks: blocos da aba Comercial a esconder;
 *    subtitle: linha compacta nas listas.
 *
 * Um tenant pode ter vários módulos: os perfis ativos são mesclados sem chaves duplicadas.
 */

export type CommercialBlock = "subscription";

export interface NicheProfile {
  key: string;
  label: string;
  moduleKeys: string[];
  niches: string[];
  defaultType: ProductType;
  /** usado como tipo padrão quando nenhum perfil é o nicho primário (ex.: varejo → Físico) */
  fallbackDefault?: boolean;
  offeredTypes: ProductType[];
  /** tipos de item que este nicho enxerga (lista de tipos, filtros e seletor) — união entre perfis ativos */
  allowedTypes: ProductType[];
  ownSchemas: TypeSchema[];
  typeFieldExtras: Partial<Record<ProductType, TypeField[]>>;
  /** título do grupo rotulado onde os campos extras aparecem */
  sectionTitle: string;
  categories: string[];
  hiddenCommercialBlocks: Partial<Record<ProductType, CommercialBlock[]>>;
  /** valores gravados quando o campo ainda não existe (mantém o que os selects exibem) */
  persistDefaults?: Partial<Record<ProductType, Record<string, string | number | boolean>>>;
  /** tipos cuja aba Estoque recebe destaque (estoque da loja) e cujo grupo "avançado" abre expandido */
  stockFocusTypes?: ProductType[];
  /** título do grupo avançado do tipo Físico quando este perfil está ativo */
  advancedSectionTitle?: string;
  subtitle?: Partial<Record<ProductType, (a: TypeAttrs, p: Pick<Product, "type" | "typeAttributes">) => string[]>>;
}

const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "")) || 0);
const fmtKm = (v: unknown) => `${num(v).toLocaleString("pt-BR")} km`;
const txt = (v: unknown) => (v == null || v === "" ? "" : String(v));

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

/**
 * Campos de varejo do tipo Físico (chaves gravadas em type_attributes — NÃO renomear).
 * Pertencem ao perfil varejo; só aparecem para tenants sem nenhum perfil ativo (compatibilidade) ou com varejo.
 */
export const VAREJO_FISICO_FIELDS: TypeField[] = [
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
];

const STATUS_IMOVEL = ["Disponível", "Reservado", "Vendido", "Locado"];
const STATUS_VEICULO = ["Disponível", "Reservado", "Vendido", "Em Preparação"];

const imobiliaria: NicheProfile = {
  key: "imobiliaria",
  label: "Imobiliária",
  moduleKeys: ["imobiliaria"],
  niches: ["Imobiliária"],
  defaultType: "Imóvel",
  offeredTypes: ["Imóvel"],
  allowedTypes: ["Imóvel", "Serviço"],
  ownSchemas: [{
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
  }],
  typeFieldExtras: {},
  sectionTitle: "Imobiliária",
  categories: ["Imóvel"],
  hiddenCommercialBlocks: { "Imóvel": ["subscription"] },
  subtitle: {
    "Imóvel": (a) => {
      const parts: string[] = [];
      if (a.tipoImovel) parts.push(String(a.tipoImovel));
      if (num(a.quartos)) parts.push(`${num(a.quartos)} qts`);
      if (num(a.banheiros)) parts.push(`${num(a.banheiros)} banh`);
      if (num(a.vagas)) parts.push(`${num(a.vagas)} vaga${num(a.vagas) > 1 ? "s" : ""}`);
      if (num(a.areaM2)) parts.push(`${num(a.areaM2)} m²`);
      if (a.bairro) parts.push(String(a.bairro));
      return parts;
    },
  },
};

const automotivo: NicheProfile = {
  key: "automotivo",
  label: "Concessionária / Automotivo",
  moduleKeys: ["automotivo", "concessionaria"],
  niches: ["Automotivo", "Concessionária"],
  defaultType: "Veículo",
  offeredTypes: ["Veículo"],
  allowedTypes: ["Veículo", "Físico", "Serviço"],
  ownSchemas: [{
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
  }],
  typeFieldExtras: {},
  sectionTitle: "Automotivo",
  categories: ["Veículo"],
  hiddenCommercialBlocks: { "Veículo": ["subscription"] },
  subtitle: {
    "Veículo": (a) => {
      const parts: string[] = [];
      const nome = [a.marca, a.modelo].filter(Boolean).join(" ");
      const ano = a.anoModelo || a.anoFabricacao;
      const head = [nome, ano].filter(Boolean).join(" ");
      if (head) parts.push(head);
      if (num(a.km)) parts.push(fmtKm(a.km));
      if (a.placa) parts.push(String(a.placa));
      return parts;
    },
  },
};

// Varejo: barcode/ean ficam no tipo base Físico (PDV/NF usam); marca, grade, fiscal e promoção
// são extras do perfil (VAREJO_FISICO_FIELDS). Sem nenhum perfil ativo o tipo base ainda os mostra.
const varejo: NicheProfile = {
  key: "varejo",
  label: "Varejo",
  moduleKeys: ["varejo"],
  niches: ["Varejo"],
  defaultType: "Físico",
  fallbackDefault: true,
  offeredTypes: [],
  allowedTypes: ["Físico", "Serviço"],
  ownSchemas: [],
  typeFieldExtras: { "Físico": VAREJO_FISICO_FIELDS },
  sectionTitle: "Varejo",
  advancedSectionTitle: "Varejo — marca, grade, fiscal e promoção",
  categories: [],
  hiddenCommercialBlocks: { "Físico": ["subscription"] },
  persistDefaults: { "Físico": { unidade: "UN", controlaEstoque: true, origemMercadoria: "0" } },
  stockFocusTypes: ["Físico"],
  subtitle: {
    "Físico": (a) => {
      const parts: string[] = [];
      if (a.marca) parts.push(String(a.marca));
      if (a.tamanho) parts.push(`Tam ${a.tamanho}`);
      if (a.cor) parts.push(String(a.cor));
      const code = a.ean || a.barcode;
      if (code) parts.push(`EAN ${code}`);
      return parts;
    },
  },
};

const clinica: NicheProfile = {
  key: "clinica",
  label: "Clínica",
  moduleKeys: ["clinica", "clinicas"],
  niches: ["Clínica"],
  defaultType: "Serviço",
  offeredTypes: [],
  allowedTypes: ["Serviço", "Físico"],
  ownSchemas: [],
  sectionTitle: "Clínica — atendimento e insumos",
  categories: ["Consultas", "Exames", "Procedimentos", "Insumos"],
  hiddenCommercialBlocks: { "Físico": ["subscription"] },
  typeFieldExtras: {
    "Serviço": [
      { key: "especialidade", label: "Especialidade", kind: "text", placeholder: "Ex: Dermatologia" },
      { key: "convenios", label: "Convênios aceitos", kind: "text", placeholder: "Ex: Unimed, Bradesco" },
      { key: "exigeAgendamento", label: "Exige agendamento", kind: "bool", defaultBool: true, width: "full" },
      { key: "retornoDias", label: "Prazo de retorno (dias)", kind: "number", placeholder: "Ex: 30" },
    ],
    "Físico": [
      { key: "lote", label: "Lote", kind: "text" },
      { key: "validade", label: "Validade", kind: "date" },
      { key: "registroAnvisa", label: "Registro ANVISA", kind: "text" },
      { key: "temperaturaArmazenamento", label: "Temperatura de armazenamento", kind: "text", placeholder: "Ex: 2 a 8 °C" },
    ],
  },
  subtitle: {
    "Serviço": (a) => [txt(a.especialidade), txt(a.duracao)].filter(Boolean),
    "Físico": (a) => [a.lote ? `Lote ${a.lote}` : "", a.validade ? `Val ${a.validade}` : ""].filter(Boolean),
  },
};

const educacao: NicheProfile = {
  key: "educacao",
  label: "Educação",
  moduleKeys: ["educacao"],
  niches: ["Educação"],
  defaultType: "Curso/Turma",
  offeredTypes: [],
  allowedTypes: ["Curso/Turma", "Digital", "Serviço"],
  ownSchemas: [],
  sectionTitle: "Educação — turma e calendário",
  categories: ["Cursos", "Turmas", "Mensalidades"],
  hiddenCommercialBlocks: {},
  typeFieldExtras: {
    "Curso/Turma": [
      { key: "nivel", label: "Nível", kind: "select", options: ["Livre", "Básico", "Intermediário", "Avançado", "Técnico", "Graduação", "Pós-graduação"], defaultValue: "Livre" },
      { key: "vagas", label: "Vagas", kind: "number" },
      { key: "dataInicio", label: "Data de início", kind: "date" },
      { key: "dataFim", label: "Data de término", kind: "date" },
      { key: "professor", label: "Professor / instrutor", kind: "text" },
    ],
  },
  subtitle: {
    "Curso/Turma": (a) => [
      txt(a.nivel),
      num(a.cargaHoraria) ? `${num(a.cargaHoraria)}h` : "",
      txt(a.modalidadeCurso),
      txt(a.professor),
    ].filter(Boolean),
  },
};

const solar: NicheProfile = {
  key: "solar",
  label: "Energia Solar",
  moduleKeys: ["solar", "energia-solar"],
  niches: ["Solar"],
  defaultType: "Físico",
  offeredTypes: [],
  allowedTypes: ["Físico", "Serviço"],
  ownSchemas: [],
  sectionTitle: "Energia solar — equipamento e serviço",
  categories: ["Painéis", "Inversores", "Estruturas", "Cabos e Conectores", "Baterias", "Kits", "Projetos", "Instalação"],
  hiddenCommercialBlocks: { "Físico": ["subscription"] },
  typeFieldExtras: {
    "Físico": [
      { key: "tipoEquipamento", label: "Tipo de equipamento", kind: "select", options: ["Painel", "Inversor", "Estrutura", "Cabo/Conector", "Bateria", "Kit completo"], defaultValue: "Painel" },
      { key: "fabricante", label: "Fabricante", kind: "text" },
      { key: "potenciaW", label: "Potência (W)", kind: "number" },
      { key: "eficienciaPercent", label: "Eficiência (%)", kind: "number" },
      { key: "garantiaAnos", label: "Garantia (anos)", kind: "number" },
    ],
    "Serviço": [
      { key: "tipoServico", label: "Tipo de serviço", kind: "select", options: ["Projeto", "Instalação", "Homologação", "Manutenção"], defaultValue: "Projeto" },
      { key: "potenciaKwp", label: "Potência do sistema (kWp)", kind: "number" },
    ],
  },
  subtitle: {
    "Físico": (a) => [txt(a.tipoEquipamento), a.fabricante ? txt(a.fabricante) : "", num(a.potenciaW) ? `${num(a.potenciaW)} W` : ""].filter(Boolean),
    "Serviço": (a) => [txt(a.tipoServico), num(a.potenciaKwp) ? `${num(a.potenciaKwp)} kWp` : ""].filter(Boolean),
  },
};

/** Ordem importa só para o desempate do tipo padrão e para a ordem dos tipos oferecidos. */
export const NICHE_PROFILES: Record<string, NicheProfile> = {
  imobiliaria, automotivo, varejo, clinica, educacao, solar,
};

/** Perfis ativos: qualquer módulo do perfil habilitado OU nicho do tenant igual a um dos `niches`. */
export function resolveNicheProfiles(
  isEnabled: (moduleKey: string) => boolean,
  tenantNiche?: string | null,
): NicheProfile[] {
  const safe = (k: string) => { try { return !!isEnabled(k); } catch { return false; } };
  return Object.values(NICHE_PROFILES).filter(p =>
    p.moduleKeys.some(safe) || (!!tenantNiche && p.niches.includes(tenantNiche)));
}

export function getPrimaryProfile(profiles: NicheProfile[], tenantNiche?: string | null): NicheProfile | undefined {
  return (tenantNiche ? profiles.find(p => p.niches.includes(tenantNiche)) : undefined)
    ?? profiles.find(p => p.fallbackDefault)
    ?? (profiles.length === 1 ? profiles[0] : undefined);
}

export function getDefaultType(profiles: NicheProfile[], tenantNiche?: string | null): ProductType {
  return getPrimaryProfile(profiles, tenantNiche)?.defaultType ?? "Digital";
}

/** Categoria inicial para um novo item (nome do tipo para ativos únicos; "Software" para quem não tem nicho). */
export function getDefaultCategory(profiles: NicheProfile[], tenantNiche?: string | null): string {
  const p = getPrimaryProfile(profiles, tenantNiche);
  if (!p) return "Software";
  return p.categories[0] ?? p.defaultType;
}

export function profileCategories(profiles: NicheProfile[]): string[] {
  return profiles.flatMap(p => p.categories);
}

export function hidesSubscription(profiles: NicheProfile[], type: string | undefined | null): boolean {
  return !!type && profiles.some(p => p.hiddenCommercialBlocks[type as ProductType]?.includes("subscription"));
}

export function persistDefaultsFor(profiles: NicheProfile[], type: string | undefined | null): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (type) profiles.forEach(p => Object.assign(out, p.persistDefaults?.[type as ProductType]));
  return out;
}

export function hasStockFocus(profiles: NicheProfile[], type: string | undefined | null): boolean {
  return !!type && profiles.some(p => p.stockFocusTypes?.includes(type as ProductType));
}

/** Título do grupo "avançado" do tipo (varejo) quando houver perfil que o nomeia. */
export function advancedSectionTitle(profiles: NicheProfile[]): string {
  return profiles.find(p => p.advancedSectionTitle)?.advancedSectionTitle ?? "Varejo — marca, grade, fiscal e promoção";
}

/** Subtítulo por tipo — independe de módulo: usa qualquer perfil que saiba descrever o tipo. */
export function profileSubtitle(p: Pick<Product, "type" | "typeAttributes">): string {
  const a = (p.typeAttributes || {}) as TypeAttrs;
  for (const prof of Object.values(NICHE_PROFILES)) {
    const fn = prof.subtitle?.[p.type];
    if (fn) {
      const parts = fn(a, p);
      if (parts.length) return parts.join(" · ");
    }
  }
  return "";
}

/**
 * Tipos de item visíveis. Sem perfil ativo: `base` (lista padrão). Com perfil(is): união dos allowedTypes
 * (tipo padrão primeiro) + `keep` (tipo em edição e tipos já usados por produtos existentes).
 */
export function resolveTypeOptions(
  profiles: NicheProfile[],
  base: ProductType[],
  defaultType: ProductType,
  keep: Array<ProductType | undefined | null> = [],
): ProductType[] {
  if (profiles.length === 0) {
    const list = [...base];
    keep.forEach(t => { if (t && !list.includes(t)) list.push(t); });
    return list;
  }
  const list: ProductType[] = [];
  profiles.forEach(p => [...p.allowedTypes, ...p.offeredTypes].forEach(t => { if (!list.includes(t)) list.push(t); }));
  if (list.includes(defaultType)) { list.splice(list.indexOf(defaultType), 1); list.unshift(defaultType); }
  keep.forEach(t => { if (t && !list.includes(t)) list.push(t); });
  return list;
}
