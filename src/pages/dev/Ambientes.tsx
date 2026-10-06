import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useState } from 'react';
import {
  Server, RefreshCw, Cpu, Clock,
  HardDrive, Wifi
} from 'lucide-react';
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { useAmbientes, type EnvStatus } from './hooks/useAmbientes';

const STATUS_CONFIG: Record<EnvStatus, { label: string; color: string; dot: string }> = {
  operacional: { label: 'Operacional', color: 'text-emerald-400', dot: 'bg-emerald-500' },
  degradado: { label: 'Degradado', color: 'text-amber-400', dot: 'bg-amber-500' },
  offline: { label: 'Offline', color: 'text-red-400', dot: 'bg-red-500' },
  'em deploy': { label: 'Em Deploy', color: 'text-slate-300', dot: 'bg-slate-400 animate-pulse' },
};

function MetricBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{value}%</span>
    </div>
  );
}

export default function Ambientes() {
  const { environments, loading, refetch } = useAmbientes();
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const operacionalCount = environments.filter(e => e.status === 'operacional').length;
  const typeOpcoes = Array.from(new Set(environments.map(e => e.type).filter(Boolean))).sort();
  const filteredEnvs = environments.filter(e => {
    const q = search.toLowerCase();
    return (!q || e.name.toLowerCase().includes(q) || e.url.toLowerCase().includes(q) || e.region.toLowerCase().includes(q)) &&
      (!filterStatus || e.status === filterStatus) &&
      (!filterType || e.type === filterType);
  });

  const handleRefresh = async (id: string) => {
    setRefreshing(id);
    await refetch();
    setRefreshing(null);
  };

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    await refetch();
    setRefreshingAll(false);
  };

  return (
    <PageContainer
      title="Ambientes"
      description="Status dos ambientes de produção, staging, desenvolvimento e QA, registrado manualmente pela equipe."
      breadcrumb={[{ label: "Dev & Tecnologia", path: "/app/dev/painel" }, { label: "Ambientes" }]}
      actions={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-slate-300">
              {operacionalCount}/{environments.length} operacionais
            </span>
          </div>
          <Button onClick={handleRefreshAll} disabled={refreshingAll} variant="outline" className="h-10 rounded-xl border-white/5 text-xs gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshingAll ? 'animate-spin' : ''}`} /> Atualizar Todos
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="devAmbientes"
        className="mb-6"
        kpis={[
          { label: "Ambientes", value: filteredEnvs.length, icon: Server, tone: "primary" },
          { label: "Operacionais", value: filteredEnvs.filter(e => e.status === 'operacional').length, icon: Wifi, tone: "success" },
          { label: "Degradados", value: filteredEnvs.filter(e => e.status === 'degradado').length, icon: Cpu, tone: "warning" },
          { label: "Offline", value: filteredEnvs.filter(e => e.status === 'offline').length, icon: HardDrive, tone: "danger" },
        ]}
        activeCount={(search ? 1 : 0) + (filterStatus ? 1 : 0) + (filterType ? 1 : 0)}
        onClear={() => { setSearch(''); setFilterStatus(''); setFilterType(''); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por nome, URL ou região..." />
          <FilterSelect icon={Server} value={filterType} onChange={setFilterType} allLabel="Todos os tipos" options={typeOpcoes} />
          <FilterChips value={filterStatus} onChange={setFilterStatus} options={Object.entries(STATUS_CONFIG).map(([value, c]) => ({ value, label: c.label }))} />
        </FilterBar>
      </KpiFilterCard>

      <div className="grid md:grid-cols-2 gap-6 pb-10">
        {loading && (
          <p className="col-span-2 text-center text-slate-500 text-xs py-10">Carregando ambientes...</p>
        )}
        {!loading && environments.length > 0 && filteredEnvs.length === 0 && (
          <p className="col-span-2 text-center text-slate-500 text-xs py-10">Nenhum ambiente encontrado para este filtro.</p>
        )}
        {!loading && environments.length === 0 && (
          <p className="col-span-2 text-center text-slate-500 text-xs py-10">Nenhum ambiente cadastrado.</p>
        )}
        {filteredEnvs.map(env => {
          const cfg = STATUS_CONFIG[env.status];
          const isRefreshing = refreshing === env.id;

          return (
            <Card key={env.id} className="overflow-hidden">
              {/* Header */}
              <div className="p-6 border-b border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-white/5">
                      <Server className="w-4 h-4 text-slate-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-white">{env.name}</h3>
                      <p className="text-xs text-slate-500">{env.type} · {env.region}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-300 flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                    <button
                      onClick={() => handleRefresh(env.id)}
                      className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">URL</p>
                    <p className="text-xs font-mono text-slate-300 mt-0.5">{env.url}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Versão</p>
                    <p className="text-xs font-mono text-white mt-0.5">{env.version}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Uptime</p>
                    <p className="text-xs text-slate-300 mt-0.5">{env.uptime}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Deploy</p>
                    <p className="text-xs text-slate-300 mt-0.5">{env.lastDeploy}</p>
                  </div>
                </div>
              </div>

              {/* Métricas */}
              <div className="p-6 border-b border-white/5">
                <p className="text-xs text-slate-400 mb-4">Métricas</p>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-500 flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU</span>
                    </div>
                    <MetricBar value={env.metrics.cpu} color={env.metrics.cpu > 80 ? 'bg-red-500' : env.metrics.cpu > 60 ? 'bg-amber-500' : 'bg-slate-400'} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-500 flex items-center gap-1"><HardDrive className="w-3 h-3" /> Memória</span>
                    </div>
                    <MetricBar value={env.metrics.memory} color={env.metrics.memory > 80 ? 'bg-red-500' : env.metrics.memory > 60 ? 'bg-amber-500' : 'bg-slate-400'} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Wifi className="w-3 h-3" /> Requisições</span>
                    <span className="text-xs text-white">{env.metrics.requests}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Latência</span>
                    <span className={`text-xs ${parseInt(env.metrics.latency) > 300 ? 'text-amber-400' : 'text-slate-300'}`}>{env.metrics.latency}</span>
                  </div>
                </div>
              </div>

              {/* Serviços */}
              <div className="p-6">
                <p className="text-xs text-slate-400 mb-3">Serviços</p>
                <div className="grid grid-cols-2 gap-2">
                  {env.services.map((svc: { name: string; status: EnvStatus }) => {
                    const sc = STATUS_CONFIG[svc.status];
                    return (
                      <div key={svc.name} className="flex items-center gap-2 p-2 bg-white/[0.02] rounded-lg">
                        <div className={`w-1.5 h-1.5 rounded-full ${sc.dot} shrink-0`} />
                        <span className="text-xs text-slate-300 truncate">{svc.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
