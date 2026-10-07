import { Wand2, Building2, Search, ChevronDown, CheckCircle2, Building } from "lucide-react";
import { toast } from "sonner";
import { ProductType } from "../../../../types";

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
}

export function ProdutoTabInfo({
  clientSearch, setClientSearch, clientId, clientName, showClientDropdown, setShowClientDropdown,
  filteredClients, handleSelectClient, clearClient,
  formName, setFormName, formSKU, setFormSKU, formCategory, setFormCategory,
  formType, setFormType, formTypeAttributes, setFormTypeAttributes, formIsBestSeller, setFormIsBestSeller,
  formDescription, setFormDescription, formTags, setFormTags, categories,
}: ProdutoTabInfoProps) {
  const inputCls = "w-full bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#2563EB]/40 font-medium transition-all";
  const labelCls = "text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider";

  const setAttr = (key: string, value: string | number | boolean) => {
    setFormTypeAttributes(prev => ({ ...prev, [key]: value }));
  };
  const attr = (key: string) => formTypeAttributes[key];

  return (
    <div className="space-y-4">
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

      {/* Step Banner */}
      <div className="bg-[var(--color-surface-elevated)] border border-white/5 p-4 rounded-xl flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-[#2563EB] shrink-0 font-black text-xs font-mono">1</div>
        <div>
          <h4 className="text-xs font-black text-white uppercase tracking-wider">Identificação Geral do Produto</h4>
          <p className="text-[10px] text-slate-500">Defina o nome, categoria e o código SKU identificador único.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider">
            Nome do Produto <strong className="text-rose-400">*</strong>
          </label>
          <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
            placeholder="Ex: Licença Enterprise SaaS" className={inputCls} required />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider flex justify-between items-center">
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
          <select value={formType} onChange={(e) => setFormType(e.target.value as ProductType)} className={inputCls}>
            <option value="Serviço">Serviço</option>
            <option value="Assinatura">Assinatura</option>
            <option value="Digital">Digital</option>
            <option value="Físico">Físico</option>
            <option value="Imóvel">Imóvel</option>
            <option value="Curso/Turma">Curso/Turma</option>
          </select>
        </div>
      </div>

      {/* Campos que variam conforme o tipo de item escolhido acima */}
      {formType === "Serviço" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Duração estimada</label>
            <input type="text" value={(attr("duracao") as string) || ""} onChange={(e) => setAttr("duracao", e.target.value)}
              placeholder="Ex: 1h, 3 sessões" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Modalidade de atendimento</label>
            <select value={(attr("modalidadeAtendimento") as string) || "Presencial"} onChange={(e) => setAttr("modalidadeAtendimento", e.target.value)} className={inputCls}>
              <option value="Presencial">Presencial</option>
              <option value="Remoto">Remoto</option>
              <option value="Híbrido">Híbrido</option>
            </select>
          </div>
        </div>
      )}

      {formType === "Assinatura" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Ciclo de cobrança</label>
            <select value={(attr("cicloCobranca") as string) || "Mensal"} onChange={(e) => setAttr("cicloCobranca", e.target.value)} className={inputCls}>
              <option value="Mensal">Mensal</option>
              <option value="Trimestral">Trimestral</option>
              <option value="Anual">Anual</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Dias de trial</label>
            <input type="number" value={(attr("diasTrial") as number) ?? ""} onChange={(e) => setAttr("diasTrial", parseInt(e.target.value) || 0)}
              placeholder="Ex: 7" className={inputCls} />
          </div>
        </div>
      )}

      {formType === "Digital" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Tipo de entrega</label>
            <select value={(attr("tipoEntrega") as string) || "Download"} onChange={(e) => setAttr("tipoEntrega", e.target.value)} className={inputCls}>
              <option value="Download">Download</option>
              <option value="Chave de Licença">Chave de Licença</option>
              <option value="Acesso por Login">Acesso por Login</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Link de entrega</label>
            <input type="text" value={(attr("linkEntrega") as string) || ""} onChange={(e) => setAttr("linkEntrega", e.target.value)}
              placeholder="https://..." className={inputCls} />
          </div>
        </div>
      )}

      {formType === "Imóvel" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <label className={labelCls}>Endereço</label>
            <input type="text" value={(attr("endereco") as string) || ""} onChange={(e) => setAttr("endereco", e.target.value)}
              placeholder="Rua, número, bairro, cidade" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Área (m²)</label>
            <input type="number" value={(attr("areaM2") as number) ?? ""} onChange={(e) => setAttr("areaM2", parseFloat(e.target.value) || 0)}
              className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Quartos</label>
            <input type="number" value={(attr("quartos") as number) ?? ""} onChange={(e) => setAttr("quartos", parseInt(e.target.value) || 0)}
              className={inputCls} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <label className={labelCls}>Tipo de imóvel</label>
            <select value={(attr("tipoImovel") as string) || "Apartamento"} onChange={(e) => setAttr("tipoImovel", e.target.value)} className={inputCls}>
              <option value="Apartamento">Apartamento</option>
              <option value="Casa">Casa</option>
              <option value="Comercial">Comercial</option>
              <option value="Terreno">Terreno</option>
            </select>
          </div>
        </div>
      )}

      {formType === "Curso/Turma" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Carga horária (horas)</label>
            <input type="number" value={(attr("cargaHoraria") as number) ?? ""} onChange={(e) => setAttr("cargaHoraria", parseInt(e.target.value) || 0)}
              className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Modalidade</label>
            <select value={(attr("modalidadeCurso") as string) || "Presencial"} onChange={(e) => setAttr("modalidadeCurso", e.target.value)} className={inputCls}>
              <option value="Presencial">Presencial</option>
              <option value="EAD">EAD</option>
              <option value="Híbrido">Híbrido</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex items-center gap-2.5 pt-1">
            <input type="checkbox" id="checkboxCertificado" checked={!!attr("certificadoIncluso")}
              onChange={(e) => setAttr("certificadoIncluso", e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-slate-900 focus:ring-[#2563EB] cursor-pointer" />
            <label htmlFor="checkboxCertificado" className="text-xs font-bold text-white cursor-pointer select-none">Inclui certificado</label>
          </div>
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
        <label className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider flex items-center justify-between">
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

      {/* Conhecimento do produto para a Júlia (IA de vendas) — gravado em type_attributes (chaves ia_*)
          e lido ao vivo pelo n8n junto com a descrição, o valor e os arquivos/criativos da aba Arquivos. */}
      <div className="p-4 bg-blue-500/5 border border-blue-500/15 rounded-xl space-y-3">
        <div>
          <label className="text-[10px] font-black text-blue-400 uppercase tracking-wider block">Para a Júlia vender este produto</label>
          <p className="text-[10px] text-slate-500">Escreva como explicaria a um vendedor novo. O que ficar vazio, ela não inventa: diz que a equipe confirma.</p>
        </div>
        {([
          ["ia_oque_e", "O que é o produto", "Explique em linguagem simples, como se fosse para um cliente leigo."],
          ["ia_para_quem", "Para quem é", "Perfil ideal e quando indicar."],
          ["ia_beneficios", "Benefícios e resultados", "O que o cliente ganha. Não prometa números que a empresa não garante."],
          ["ia_como_funciona", "Como funciona e o que está incluso", "Formato, etapas, entregáveis, local, data/turma, duração."],
          ["ia_objecoes", "Objeções comuns e respostas", "Ex.: \"é caro\" → resposta oficial."],
        ] as const).map(([key, label, hint]) => (
          <div key={key} className="space-y-1.5">
            <label className={labelCls}>{label}</label>
            <textarea value={String(attr(key) ?? "")} onChange={(e) => setAttr(key, e.target.value)}
              placeholder={hint} className={`${inputCls} h-16`} />
          </div>
        ))}
      </div>
    </div>
  );
}
