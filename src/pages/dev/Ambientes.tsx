import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { useEffect, useRef, useState } from 'react';
import { Server, RefreshCw, AlertTriangle, HardDrive, Wifi, Plus, Pencil, Trash2, GitFork } from 'lucide-react';
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/PageContainer";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useAmbientes, type DevEnvironment, type EnvStatus } from './hooks/useAmbientes';
import { normalizarUrl } from './lib/ambientes';
import { AmbienteModal } from './modals/AmbienteModal';
import { ImportarAmbientesModal } from './modals/ImportarAmbientesModal';

const STATUS_CONFIG: Record<EnvStatus, { label: string; color: string; dot: string }> = {
  operacional: { label: 'Operacional', color: 'text-emerald-500', dot: 'bg-emerald-500' },
  degradado: { label: 'Degradado', color: 'text-amber-500', dot: 'bg-amber-500' },
  offline: { label: 'Offline', color: 'text-red-500', dot: 'bg-red-500' },
  'em deploy': { label: 'Em Deploy', color: 'text-slate-400', dot: 'bg-slate-400 animate-pulse' },
};

const VALIDADE_MS = 5 * 60 * 1000; // verificação mais velha que isso é refeita ao abrir a tela

const haQuanto = (iso: string) => {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  return min < 1 ? 'agora' : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.floor(min / 60)} h` : `há ${Math.floor(min / 1440)} d`;
};
const dataDoDeploy = (v: string) => (/^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : v || '—');

export default function Ambientes() {
  const { environments, loading, carregadoDe, verificar, salvar, excluir, sugestoesGitHub, importar, idImportado } = useAmbientes();
  const [verificando, setVerificando] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<DevEnvironment | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [importando, setImportando] = useState(false);

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

  const checar = async (ids: string[]) => {
    if (!ids.length) return;
    setVerificando((v) => new Set([...v, ...ids]));
    await verificar(ids);
    setVerificando((v) => new Set([...v].filter((x) => !ids.includes(x))));
  };
  const comEndereco = environments.filter((e) => e.url).map((e) => e.id);

  // Ao abrir (uma vez por empresa), refaz as verificações antigas.
  const verificadoDe = useRef('');
  useEffect(() => {
    if (!carregadoDe || verificadoDe.current === carregadoDe) return;
    verificadoDe.current = carregadoDe;
    void checar(environments.filter((e) => e.url && (!e.check.em || Date.now() - Date.parse(e.check.em) > VALIDADE_MS)).map((e) => e.id));
  }, [carregadoDe]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirForm = (env: DevEnvironment | null) => { setEditando(env); setFormAberto(true); };
  const remover = async (env: DevEnvironment) => {
    if (await confirmDialog({ title: 'Excluir ambiente', description: `Excluir “${env.name}” da lista? Nada é alterado no site em si.`, confirmText: 'Excluir' })) await excluir(env.id);
  };

  return (
    <PageContainer
      title="Ambientes"
      description="Ambientes de produção, staging, desenvolvimento e QA. Quem tem endereço é verificado ao abrir esta tela."
      breadcrumb={[{ label: "Dev & Tecnologia", path: "/app/dev/painel" }, { label: "Ambientes" }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 px-3 h-10 rounded-xl border border-[var(--color-border-default)] text-xs text-[var(--color-text-muted)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{operacionalCount}/{environments.length} operacionais
          </span>
          <Button onClick={() => void checar(comEndereco)} disabled={!comEndereco.length || verificando.size > 0} variant="outline" className="h-10 rounded-xl text-xs gap-2">
            <RefreshCw className={`w-4 h-4 ${verificando.size ? 'animate-spin' : ''}`} /> Verificar todos
          </Button>
          <Button onClick={() => setImportando(true)} variant="outline" className="h-10 rounded-xl text-xs gap-2"><GitFork className="w-4 h-4" /> Importar do GitHub</Button>
          <Button onClick={() => abrirForm(null)} className="h-10 rounded-xl text-xs gap-2"><Plus className="w-4 h-4" /> Novo ambiente</Button>
        </div>
      }
    >
      <KpiFilterCard
        id="devAmbientes"
        className="mb-6"
        kpis={[
          { label: "Ambientes", value: filteredEnvs.length, icon: Server, tone: "primary" },
          { label: "Operacionais", value: filteredEnvs.filter(e => e.status === 'operacional').length, icon: Wifi, tone: "success" },
          { label: "Degradados", value: filteredEnvs.filter(e => e.status === 'degradado').length, icon: AlertTriangle, tone: "warning" },
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

      <div className="grid md:grid-cols-2 gap-4 pb-10">
        {loading && <p className="col-span-full text-center text-[var(--color-text-muted)] text-xs py-10">Carregando ambientes...</p>}
        {!loading && environments.length > 0 && filteredEnvs.length === 0 && (
          <p className="col-span-full text-center text-[var(--color-text-muted)] text-xs py-10">Nenhum ambiente encontrado para este filtro.</p>
        )}
        {!loading && environments.length === 0 && (
          <Card className="col-span-full flex flex-col items-center text-center gap-3 py-12 px-6">
            <Server className="w-8 h-8 text-[var(--color-text-faint)]" />
            <p className="text-sm font-black text-[var(--color-text-primary)]">Nenhum ambiente cadastrado</p>
            <p className="text-xs text-[var(--color-text-muted)] max-w-md">Importe os sites publicados dos seus repositórios do GitHub ou cadastre o endereço à mão. O sistema verifica se cada um está no ar.</p>
            <div className="flex gap-2 flex-wrap justify-center">
              <Button onClick={() => setImportando(true)} className="h-10 rounded-xl text-xs gap-2"><GitFork className="w-4 h-4" /> Importar do GitHub</Button>
              <Button onClick={() => abrirForm(null)} variant="outline" className="h-10 rounded-xl text-xs gap-2"><Plus className="w-4 h-4" /> Cadastrar à mão</Button>
            </div>
          </Card>
        )}
        {filteredEnvs.map(env => {
          const cfg = STATUS_CONFIG[env.status] ?? STATUS_CONFIG.operacional;
          const ocupado = verificando.has(env.id);
          const dados: [string, string][] = [
            ['Resposta', env.check.latency || '—'],
            ['Último deploy', dataDoDeploy(env.lastDeploy)],
            ['Versão', env.version || '—'],
          ];
          const acao = 'p-1.5 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer bg-transparent disabled:opacity-40';

          return (
            <Card key={env.id} className="overflow-hidden p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-[var(--color-text-primary)] break-words">{env.name}</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">{[env.type, env.region].filter(Boolean).join(' · ')}</p>
                </div>
                <span className={`shrink-0 text-xs font-bold flex items-center gap-1.5 ${cfg.color}`}>
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />{ocupado ? 'Verificando…' : cfg.label}
                </span>
              </div>

              {env.url
                ? <a href={normalizarUrl(env.url) || undefined} target="_blank" rel="noopener noreferrer" className="block text-xs font-mono text-[var(--color-primary-blue)] hover:underline break-all">{env.url}</a>
                : <p className="text-xs italic text-[var(--color-text-faint)]">Sem endereço: o status é o informado no cadastro.</p>}

              <div className="grid grid-cols-3 gap-2">
                {dados.map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-[var(--color-surface-sunken)] px-3 py-2 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">{k}</p>
                    <p className="text-xs font-bold text-[var(--color-text-primary)] break-words">{v}</p>
                  </div>
                ))}
              </div>

              {env.check.aviso && <p className="text-[11px] text-amber-600 dark:text-amber-400">{env.check.aviso}</p>}
              {env.services.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {env.services.map((svc) => (
                    <span key={svc.name} className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-primary)]">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[svc.status]?.dot ?? 'bg-slate-400'}`} />{svc.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[10px] text-[var(--color-text-faint)]">{env.check.em ? `Verificado ${haQuanto(env.check.em)}${env.check.http ? ` · HTTP ${env.check.http}` : ''}` : env.url ? 'Ainda não verificado' : ''}</span>
                <div className="flex gap-1.5">
                  {env.url && <button type="button" title="Verificar agora" aria-label="Verificar agora" disabled={ocupado} onClick={() => void checar([env.id])} className={acao}><RefreshCw className={`w-4 h-4 ${ocupado ? 'animate-spin' : ''}`} /></button>}
                  <button type="button" title="Editar" aria-label="Editar" onClick={() => abrirForm(env)} className={acao}><Pencil className="w-4 h-4" /></button>
                  <button type="button" title="Excluir" aria-label="Excluir" onClick={() => void remover(env)} className={`${acao} hover:!text-rose-500`}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <AmbienteModal aberto={formAberto} ambiente={editando} onClose={() => setFormAberto(false)} onSalvar={salvar} />
      <ImportarAmbientesModal aberto={importando} onClose={() => setImportando(false)} buscar={sugestoesGitHub}
        jaCadastrado={(sug) => environments.some((e) => e.id === idImportado(sug))} onImportar={importar} />
    </PageContainer>
  );
}
