import { Search, Filter, Building2, Briefcase, Zap } from "lucide-react";
import { DateRangeFilter } from "../../../../components/ui/DateRangeFilter";

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
}

export function PipelineFilterBar({
  comercialFunis, sdrFunis, currentPipeline, setCurrentPipeline,
  selectedFunilId, setSelectedFunilId, searchQuery, setSearchQuery,
  companyFilter, setCompanyFilter, companiesList,
  clientFilter, setClientFilter, clientsList,
  sellerFilter, setSellerFilter, sellers,
  dateFrom, setDateFrom, dateTo, setDateTo,
}: PipelineFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 shrink-0">
      {(comercialFunis.length > 0 || sdrFunis.length > 0) && (
        <div className="flex items-center gap-1.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-2 py-1.5 h-[38px]">
          {comercialFunis.length === 1 ? (
            <button
              onClick={() => { setCurrentPipeline("comercial"); setSelectedFunilId(comercialFunis[0].id); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${currentPipeline === "comercial" ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
            >
              <Briefcase className="w-3 h-3" /> {comercialFunis[0].nome}
            </button>
          ) : comercialFunis.length > 1 ? (
            <div className={`flex items-center gap-1 px-2 rounded-lg ${currentPipeline === "comercial" ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)]"}`}>
              <Briefcase className="w-3 h-3" />
              <select
                value={selectedFunilId}
                onChange={(e) => { setCurrentPipeline("comercial"); setSelectedFunilId(e.target.value); }}
                className="bg-transparent border-none focus:outline-none text-[10px] font-bold cursor-pointer"
              >
                <option value="__todos__" className="bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]">Todos os funis</option>
                {comercialFunis.map((f: any) => <option key={f.id} value={f.id} className="bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]">{f.nome}</option>)}
              </select>
            </div>
          ) : null}

          {comercialFunis.length > 0 && sdrFunis.length > 0 && <div className="w-px h-4 bg-[var(--color-border-default)]" />}

          {sdrFunis.length === 1 ? (
            <button
              onClick={() => { setCurrentPipeline("sdr"); setSelectedFunilId(sdrFunis[0].id); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${currentPipeline === "sdr" ? "bg-accent/15 text-accent" : "text-[var(--color-text-muted)] hover:text-accent"}`}
            >
              <Zap className="w-3 h-3" /> {sdrFunis[0].nome}
            </button>
          ) : sdrFunis.length > 1 ? (
            <div className={`flex items-center gap-1 px-2 rounded-lg ${currentPipeline === "sdr" ? "text-accent" : "text-[var(--color-text-muted)]"}`}>
              <Zap className="w-3 h-3" />
              <select
                value={selectedFunilId}
                onChange={(e) => { setCurrentPipeline("sdr"); setSelectedFunilId(e.target.value); }}
                className="bg-transparent border-none focus:outline-none text-[10px] font-bold cursor-pointer"
              >
                <option value="__todos__" className="bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]">Todos os funis</option>
                {sdrFunis.map((f: any) => <option key={f.id} value={f.id} className="bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]">{f.nome}</option>)}
              </select>
            </div>
          ) : null}
        </div>
      )}

      <div className="relative flex-1 min-w-[160px]">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
        <input
          type="text"
          placeholder="Buscar negócios..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] pl-9 pr-3 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)] w-full h-[38px]"
        />
      </div>

      <div className="flex items-center gap-1.5 bg-[var(--color-surface-elevated)] px-3 rounded-[var(--radius-control)] border border-[var(--color-border-default)] h-[38px]">
        <Building2 className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" />
        <select
          className="bg-transparent border-none text-[var(--color-text-primary)] focus:outline-none text-xs font-bold cursor-pointer"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
        >
          {companiesList.map(c => <option key={c} value={c} className="bg-[var(--color-surface-elevated)]">{c === "Todos" ? "Todas as empresas" : c}</option>)}
        </select>
      </div>

      {clientsList.length > 0 && (
        <div className="flex items-center gap-1.5 bg-[var(--color-surface-elevated)] px-3 rounded-[var(--radius-control)] border border-[var(--color-border-default)] h-[38px]">
          <Building2 className="w-3 h-3 text-[var(--color-primary-blue)] shrink-0" />
          <select
            className="bg-transparent border-none text-[var(--color-text-primary)] focus:outline-none text-xs font-bold cursor-pointer"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="Todos" className="bg-[var(--color-surface-elevated)]">Todos os clientes</option>
            {clientsList.map(c => <option key={c} value={c} className="bg-[var(--color-surface-elevated)]">{c}</option>)}
          </select>
        </div>
      )}

      <div className="flex items-center gap-1.5 bg-[var(--color-surface-elevated)] px-3 rounded-[var(--radius-control)] border border-[var(--color-border-default)] h-[38px]">
        <Filter className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" />
        <select
          className="bg-transparent border-none text-[var(--color-text-primary)] focus:outline-none text-xs font-bold cursor-pointer"
          value={sellerFilter}
          onChange={(e) => setSellerFilter(e.target.value)}
        >
          {sellers.map(s => <option key={s} value={s} className="bg-[var(--color-surface-elevated)]">{s === "Todos" ? "Todos os vendedores" : s}</option>)}
        </select>
      </div>

      <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
    </div>
  );
}
