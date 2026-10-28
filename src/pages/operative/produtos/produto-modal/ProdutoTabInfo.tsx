import { Wand2, Building2, Search, ChevronDown, CheckCircle2, Building } from "lucide-react";
import { toast } from "sonner";
import { ProductType } from "../../../../types";
import { getTypeSchema, typeLabel, type TypeField } from "../typeSchemas";
import { useNicheProfiles } from "../useNicheProfiles";
import { advancedSectionTitle, hasStockFocus } from "../nicheProfiles";
import { TypeFieldInput } from "./TypeFieldInput";

interface ProdutoTabInfoProps {
  clientSearch: string;
  setClientSearch: (v: string) => void;
  clientId: string;
  clientName: string;
  showClientDropdown: boolean;
  setShowClientDropdown: (v: boolean) => void;
  filteredClients: any[];
  handleSelectClient: (c: any) => void;
  clearClient: () => void;
  formName: string;
  setFormName: (v: string) => void;
  formSKU: string;
  setFormSKU: (v: string) => void;
  formCategory: string;
  setFormCategory: (v: string) => void;
  formType: ProductType;
  setFormType: (v: ProductType) => void;
  formTypeAttributes: Record<string, string | number | boolean>;
  setFormTypeAttributes: React.Dispatch<React.SetStateAction<Record<string, string | number | boolean>>>;
  formIsBestSeller: boolean;
  setFormIsBestSeller: (v: boolean) => void;
  formDescription: string;
  setFormDescription: (v: string) => void;
  formTags: string;
  setFormTags: (v: string) => void;
  categories: string[];
  typeOptions?: ProductType[];
}

export function ProdutoTabInfo({
  clientSearch, setClientSearch, clientId, clientName, showClientDropdown, setShowClientDropdown,
  filteredClients, handleSelectClient, clearClient,
  formName, setFormName, formSKU, setFormSKU, formCategory, setFormCategory,
  formType, setFormType, formTypeAttributes, setFormTypeAttributes, formIsBestSeller, setFormIsBestSeller,
  formDescription, setFormDescription, formTags, setFormTags, categories, typeOptions,
}: ProdutoTabInfoProps) {
  const inputCls = "w-full bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#2563EB]/40 font-medium transition-all";
  const labelCls = "text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider";

  const setAttr = (key: string, value: string | number | boolean) => {
    setFormTypeAttributes(prev => ({ ...prev, [key]: value }));
  };
  const attr = (key: string) => formTypeAttributes[key];

  const typeList: ProductType[] = typeOptions && typeOptions.length > 0
    ? typeOptions
    : ["Serviço", "Assinatura", "Digital", "Físico", "Curso/Turma"];
  const profiles = useNicheProfiles();
  const schema = getTypeSchema(formType, profiles);
  const schemaFields = (schema?.fields || []).filter(f => (f.tab || "info") === "info" && (!f.showIf || f.showIf(formTypeAttributes)));

  const renderField = (f: TypeField) => (
    <TypeFieldInput key={f.key} field={f} attrs={formTypeAttributes} setAttr={setAttr} />
  );
  const advOpen = hasStockFocus(profiles, formType);
  const IA_KEYS = ["ia_oque_e", "ia_para_quem", "ia_beneficios", "ia_como_funciona", "ia_planos_valores", "ia_objecoes"];
  const iaFilled = IA_KEYS.filter(k => String(attr(k) ?? "").trim().length > 0).length;
  const baseFields = schemaFields.filter(f => !f.advanced && !f.group);
  const advFields = schemaFields.filter(f => f.advanced);
  // campos extras dos perfis de nicho, agrupados pelo título do perfil
  const groups = schemaFields.filter(f => !f.advanced && f.group).reduce<Record<string, TypeField[]>>((acc, f) => {
    (acc[f.group as string] ||= []).push(f); return acc;
  }, {});
  return (
    <div className="space-y-4">
      {/* Step Banner */}
      <div className="bg-[var(--color-surface-elevated)] border border-white/5 p-4 rounded-xl flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-[#2563EB] shrink-0 font-black text-xs font-mono">1</div>
        <div>
          <h4 className="text-xs font-black text-white uppercase tracking-wider">Identificação Geral do Produto</h4>
          <p className="text-[10px] text-slate-500">Defina o nome, categoria e o código SKU identificador único.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider">
            Nome do Produto <strong className="text-rose-400">*</strong>
          </label>
          <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
            placeholder="Ex: Licença Enterprise SaaS" className={inputCls} required />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider flex justify-between items-center">
            <span>SKU <strong className="text-rose-400">*</strong></span>
            <button type="button" onClick={() => {
              let prefix = "PROD";
              if (formName.trim().length > 2) prefix = formName.trim().split(" ").map(w => w.substring(0, 3).toUpperCase()).join("-").slice(0, 12);
              setFormSKU(`${prefix}-${Math.floor(100 + Math.random() * 900)}`);
              toast.success("SKU gerado!");
            }} className="text-[9px] text-[#2563EB] hover:underline cursor-pointer flex items-center gap-0.5">
              <Wand2 className="w-2.5 h-2.5" /> Auto-gerar
            </button>
          </label>
          <input type="text" value={formSKU} onChange={(e) => setFormSKU(e.target.value.toUpperCase())}
            placeholder="Ex: SOFT-LIC-999" className={`${inputCls} font-mono font-bold`} required />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider">Categoria</label>
          <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className={inputCls}>
            {categories.filter(c => c !== "Todas").map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Tipo de Item</label>
          <select value={formType} onChange={(e) => {
            const t = e.target.value as ProductType;
            setFormType(t);
            if ((t === "Imóvel" || t === "Veículo") && categories.includes(t) && (!formCategory || formCategory === "Software")) setFormCategory(t);
          }} className={inputCls}>
            {typeList.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
        </div>
      </div>

      {/* Campos que variam conforme o tipo de item (registro em ../typeSchemas.ts) */}
      {schemaFields.length > 0 && (
        <div className="space-y-3">
          {baseFields.length > 0 && (
            <div className="space-y-2">
              {schema?.sectionTitle && (
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{schema.sectionTitle}</h4>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {baseFields.map(renderField)}
              </div>
            </div>
          )}
          {Object.entries(groups).map(([title, fields]) => (
            <div key={title} className="space-y-2 rounded-xl border border-white/5 bg-white/[0.01] p-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{fields.map(renderField)}</div>
            </div>
          ))}
          {advFields.length > 0 && (
            <details open={advOpen} key={`${formType}-${advOpen}`} className="group rounded-xl border border-white/5 bg-white/[0.01] p-4 space-y-3">
              <summary className="cursor-pointer select-none text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                <span>{advancedSectionTitle(profiles)}</span>
                <span className="text-[9px] font-bold normal-case text-slate-500 group-open:hidden">toque para expandir</span>
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
                {advFields.map(renderField)}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="p-4 bg-[var(--color-surface-elevated)]/30 border border-white/5 rounded-xl flex items-center justify-between">
        <div className="space-y-0.5">
          <label htmlFor="checkboxBestSeller" className="text-xs font-bold text-white cursor-pointer select-none">
            Produto Destaque (BestSeller)
          </label>
          <p className="text-[10px] text-slate-500">Adiciona etiqueta visual de alta conversão para o time comercial.</p>
        </div>
        <input type="checkbox" id="checkboxBestSeller" checked={formIsBestSeller}
          onChange={(e) => setFormIsBestSeller(e.target.checked)}
          className="w-4 h-4 rounded border-white/20 bg-slate-900 focus:ring-[#2563EB] cursor-pointer" />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider">Descrição comercial</label>
        <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)}
          placeholder="Ex: Licenciamento anual com suporte 24/7 incluso..."
          className={`${inputCls} h-20`} />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider flex items-center justify-between">
          <span>Tags / Palavras-chave</span>
          <span className="text-[9px] text-slate-500 font-bold lowercase">separe com vírgulas</span>
        </label>
        <input type="text" value={formTags} onChange={(e) => setFormTags(e.target.value)}
          placeholder="Ex: licenca, b2b, anual, cloud" className={inputCls} />
        <div className="flex gap-1.5 flex-wrap pt-1 items-center">
          <span className="text-[9px] text-slate-500 uppercase font-black mr-1">Sugestões:</span>
          {["saas", "premium", "suporte", "vip", "hardware", "anual"].map(tag => (
            <button key={tag} type="button" onClick={() => {
              const list = formTags.split(",").map(t => t.trim()).filter(t => t.length > 0);
              if (!list.includes(tag)) { list.push(tag); setFormTags(list.join(", ")); }
            }} className="bg-white/5 hover:bg-[#2563EB]/20 hover:text-[#2563EB] transition-colors border border-white/5 rounded px-2 py-0.5 text-[9px] text-slate-400 font-bold lowercase">
              +{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Client Association */}
      <div className="p-4 bg-blue-500/5 border border-blue-500/15 rounded-xl space-y-2">
        <label className="text-[10px] font-black text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" /> Vincular a Cliente
          <span className="ml-auto text-[9px] text-slate-500 font-normal normal-case">Opcional</span>
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text" value={clientSearch}
            onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true); if (!e.target.value) clearClient(); }}
            onFocus={() => setShowClientDropdown(true)}
            onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
            placeholder={filteredClients.length > 0 ? "Buscar cliente..." : "Nenhum cliente cadastrado"}
            className="w-full bg-[var(--color-surface)]/60 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-white text-xs focus:border-blue-500/40 focus:outline-none transition-all placeholder:text-slate-600"
          />
          {clientId
            ? <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400" />
            : <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          }
          {showClientDropdown && filteredClients.length > 0 && (
            <div className="absolute z-50 top-full mt-1 w-full bg-[var(--color-surface-elevated)] border border-white/10 rounded-xl shadow-2xl max-h-40 overflow-y-auto">
              {filteredClients.map((c: any) => (
                <button key={c.id} type="button" onMouseDown={() => handleSelectClient(c)}
                  className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors flex items-center gap-2 border-none bg-transparent cursor-pointer">
                  <Building className="w-3 h-3 text-slate-500 shrink-0" />
                  <p className="text-xs font-bold text-white">{c.name || c.nome}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        {clientId && (
          <p className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold">
            <CheckCircle2 className="w-3 h-3" /> Vinculado: {clientName}
            <button type="button" onClick={clearClient} className="ml-2 text-slate-500 hover:text-rose-400 bg-transparent border-none cursor-pointer text-[10px]">
              ✕ desvincular
            </button>
          </p>
        )}
      </div>

      {/* Conhecimento do produto para a Júlia (IA de vendas) — gravado em type_attributes (chaves ia_*)
          e lido ao vivo pelo n8n junto com a descrição, o valor e os arquivos/criativos da aba Arquivos. */}
      <details open={iaFilled > 0} className="group p-4 bg-blue-500/5 border border-blue-500/15 rounded-xl space-y-3">
        <summary className="cursor-pointer select-none list-none flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-black text-blue-400 uppercase tracking-wider block">Para a IA vender este produto</span>
            <p className="text-[10px] text-slate-500 mt-0.5">Escreva como explicaria a um vendedor novo. O que ficar vazio, ela não inventa: diz que a equipe confirma.</p>
          </div>
          <span className="shrink-0 text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5">
            {iaFilled}/6 preenchidos
          </span>
        </summary>
        {([
          ["ia_oque_e", "O que é o produto", "Explique em linguagem simples, como se fosse para um cliente leigo."],
          ["ia_para_quem", "Para quem é", "Perfil ideal e quando indicar."],
          ["ia_beneficios", "Benefícios e resultados", "O que o cliente ganha. Não prometa números que a empresa não garante."],
          ["ia_como_funciona", "Como funciona e o que está incluso", "Formato, etapas, entregáveis, local, data/turma, duração."],
          ["ia_planos_valores", "Planos, valores e condições", "Planos/níveis do produto, valores de referência, créditos, garantias e formas de pagamento. A IA só usa o que estiver escrito aqui ou no preço cadastrado."],
          ["ia_objecoes", "Objeções comuns e respostas", "Ex.: \"é caro\" → resposta oficial."],
        ] as const).map(([key, label, hint]) => (
          <div key={key} className="space-y-1.5">
            <label className={labelCls}>{label}</label>
            <textarea value={String(attr(key) ?? "")} onChange={(e) => setAttr(key, e.target.value)}
              placeholder={hint} className={`${inputCls} min-h-[5.5rem] resize-y leading-relaxed`} />
          </div>
        ))}
      </details>
    </div>
  );
}
