import type { ReactNode } from "react";
import { Search, Building2, Briefcase, Zap, MapPin, Users, Tag, Filter, Layers, Link2, FilterX } from "lucide-react";
import { DateRangeFilter } from "../../../../components/ui/DateRangeFilter";
import { cn } from "../../../../lib/utils";

interface PipelineFilterBarProps {
  comercialFunis: any[];
  sdrFunis: any[];
  currentPipeline: "sdr" | "comercial";
  setCurrentPipeline: React.Dispatch<React.SetStateAction<"sdr" | "comercial">>;
  selectedFunilId: string;
  setSelectedFunilId: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  companyFilter: string;
  setCompanyFilter: (c: string) => void;
  companiesList: string[];
  cityFilter: string;
  setCityFilter: (c: string) => void;
  citiesList: string[];
  clientFilter: string;
  setClientFilter: (c: string) => void;
  clientsList: string[];
  sellerFilter: string;
  setSellerFilter: (s: string) => void;
  sellers: string[];
  dateFrom: string | null;
  setDateFrom: (v: string | null) => void;
  dateTo: string | null;
  setDateTo: (v: string | null) => void;
  stageFilter: string;
  setStageFilter: (v: string) => void;
  stageOptions: { id: string; name: string }[];
  sourceFilter: string;
  setSourceFilter: (v: string) => void;
  sourcesList: string[];
  activeCount: number;
  onClear: () => void;
}

const BOX = "flex items-center gap-2.5 bg-[var(--color-surface-elevated)] px-3.5 rounded-xl border border-[var(--color-border-default)] h-12 min-w-0";
const SEL = "bg-transparent border-none text-[var(--color-text-primary)] focus:outline-none text-[13px] font-semibold cursor-pointer w-full truncate";

function Field({ icon: Icon, children, className, tint }: { icon: typeof Search; children: ReactNode; className?: string; tint?: boolean }) {
  return (
    <div className={cn(BOX, tint && "bg-[var(--color-primary-blue)]/[0.07] border-[var(--color-primary-blue)]/30", className)}>
      <Icon className={cn("w-4 h-4 shrink-0", tint ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)]")} />
      {children}
    </div>
  );
}

export function PipelineFilterBar(p: PipelineFilterBarProps) {
  const hasFunis = p.comercialFunis.length > 0 || p.sdrFunis.length > 0;

  // Um único seletor de funil: cada opção carrega o tipo (comercial/SDR) no valor.
  const funilValue = `${p.currentPipeline}:${p.selectedFunilId}`;
  const onFunilChange = (v: string) => {
    const [tipo, id] = v.split(":");
    p.setCurrentPipeline(tipo as "sdr" | "comercial");
    p.setSelectedFunilId(id);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[2.2fr_1fr_1fr_1fr_1fr] gap-3">
        <div className={cn(BOX, "md:col-span-2 xl:col-span-1")}>
          <Search className="w-4 h-4 shrink-0 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar por negócios, empresa, contato ou palavra-chave..."
            value={p.searchQuery}
            onChange={(e) => p.setSearchQuery(e.target.value)}
            className="bg-transparent border-none text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none w-full"
          />
        </div>
        <Field icon={Building2}>
          <select className={SEL} value={p.companyFilter} onChange={(e) => p.setCompanyFilter(e.target.value)}>
            {p.companiesList.map((c) => <option key={c} value={c}>{c === "Todos" ? "Todas as empresas" : c}</option>)}
          </select>
        </Field>
        <Field icon={MapPin}>
          <select className={SEL} value={p.cityFilter} onChange={(e) => p.setCityFilter(e.target.value)}>
            {p.citiesList.map((c) => <option key={c} value={c}>{c === "Todos" ? "Todas as cidades" : c}</option>)}
          </select>
        </Field>
        <Field icon={Users}>
          <select className={SEL} value={p.clientFilter} onChange={(e) => p.setClientFilter(e.target.value)}>
            <option value="Todos">Todos os clientes</option>
            {p.clientsList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field icon={Tag}>
          <select className={SEL} value={p.sellerFilter} onChange={(e) => p.setSellerFilter(e.target.value)}>
            {p.sellers.map((s) => <option key={s} value={s}>{s === "Todos" ? "Todos os vendedores" : s}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.1fr_1.2fr_1.2fr_1.2fr_auto] gap-3">
        {hasFunis ? (
          <Field icon={p.currentPipeline === "sdr" ? Zap : Briefcase} tint>
            <select className={cn(SEL, "uppercase tracking-wide text-[12px] font-bold text-[var(--color-primary-blue)]")} value={funilValue} onChange={(e) => onFunilChange(e.target.value)}>
              {p.comercialFunis.length > 1 && <option value="comercial:__todos__">Funil comercial — todos</option>}
              {p.comercialFunis.map((f: any) => <option key={f.id} value={`comercial:${f.id}`}>Funil comercial{p.comercialFunis.length > 1 ? ` — ${f.nome}` : `: ${f.nome}`}</option>)}
              {p.sdrFunis.length > 1 && <option value="sdr:__todos__">Funil SDR — todos</option>}
              {p.sdrFunis.map((f: any) => <option key={f.id} value={`sdr:${f.id}`}>Funil SDR{p.sdrFunis.length > 1 ? ` — ${f.nome}` : `: ${f.nome}`}</option>)}
            </select>
          </Field>
        ) : <div className="hidden xl:block" />}
        <DateRangeFilter dateFrom={p.dateFrom} setDateFrom={p.setDateFrom} dateTo={p.dateTo} setDateTo={p.setDateTo} className="!h-12 !rounded-xl" />
        <Field icon={Layers}>
          <select className={SEL} value={p.stageFilter} onChange={(e) => p.setStageFilter(e.target.value)}>
            <option value="Todas">Todas as etapas</option>
            {p.stageOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field icon={Link2}>
          <select className={SEL} value={p.sourceFilter} onChange={(e) => p.setSourceFilter(e.target.value)}>
            {p.sourcesList.map((s) => <option key={s} value={s}>{s === "Todas" ? "Todas as origens" : s}</option>)}
          </select>
        </Field>
        <button
          type="button"
          onClick={p.onClear}
          disabled={p.activeCount === 0}
          className={cn(
            "h-12 px-5 rounded-xl border text-[13px] font-bold flex items-center justify-center gap-2 transition-all",
            p.activeCount > 0
              ? "bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:border-rose-400 hover:text-rose-500 cursor-pointer"
              : "bg-[var(--color-surface-sunken)] border-transparent text-[var(--color-text-faint)] cursor-not-allowed"
          )}
        >
          <FilterX className="w-4 h-4" /> Limpar filtros
        </button>
      </div>
    </div>
  );
}
