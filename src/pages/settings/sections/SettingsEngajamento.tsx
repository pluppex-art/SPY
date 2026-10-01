import { useState, useEffect } from "react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Plus, MessageSquare, ExternalLink, Bell } from "lucide-react";
import { NovoModeloModal } from "../../../components/ui/modals/marketing/NovoModeloModal";
import { Reorder } from "motion/react";
import { toast } from "sonner";
import { useData } from "../../../contexts/DataContext";

const ENGAJAMENTO_MODELOS_KEY = "engajamento_modelos_mensagem";
const BUSINESS_DASHBOARD_KPIS_KEY = "business_dashboard_kpis";
// Contadores de disparo abaixo ("1.240 disparos" etc.) são apenas exemplos
// ilustrativos dos modelos padrão — ainda não existe rastreamento real de
// envios por modelo; um modelo novo sempre nasce com "0 disparos".
const DEFAULT_TEMPLATES = [
  { id: '1', nome: 'Apresentação Comercial Inicial', tipo: 'WhatsApp', conteudo: '', uso: '1.240 disparos' },
  { id: '2', nome: 'Recuperação de Lead Inativo (7 dias)', tipo: 'E-mail', conteudo: '', uso: '450 disparos' },
  { id: '3', nome: 'Confirmação de Reunião com Closer', tipo: 'WhatsApp', conteudo: '', uso: '890 disparos' },
  { id: '4', nome: 'Cobrança Prévia de Fatura', tipo: 'SMS', conteudo: '', uso: '120 disparos' },
];

export function ConfigEngajamentoModelos() {
  const { appSettings, saveAppSetting } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [templates, setTemplates] = useState<any[]>(DEFAULT_TEMPLATES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    const saved = appSettings?.[ENGAJAMENTO_MODELOS_KEY];
    if (saved) { setTemplates(saved); setHydrated(true); }
  }, [appSettings, hydrated]);

  const persistTemplates = (next: any[]) => {
    setTemplates(next);
    setHydrated(true);
    saveAppSetting(ENGAJAMENTO_MODELOS_KEY, next);
  };

  const handleSave = (modelo: any) => {
    if (editingTemplate) {
      persistTemplates(templates.map((t) => (t.id === editingTemplate.id ? { ...t, ...modelo } : t)));
      toast.success("Modelo atualizado com sucesso!");
    } else {
      persistTemplates([...templates, { ...modelo, id: Date.now().toString(), uso: '0 disparos' }]);
      toast.success("Modelo criado com sucesso!");
    }
    setIsModalOpen(false);
    setEditingTemplate(null);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">Modelos de Mensagem</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Gerencie os templates de comunicação automatizada da sua empresa.</p>
        </div>
        <Button onClick={() => { setEditingTemplate(null); setIsModalOpen(true); }} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
          <Plus className="w-4 h-4 mr-1" /> Novo Modelo
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {templates.map((modelo: any) => (
          <Card key={modelo.id} className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-[var(--color-surface-sunken)] rounded-lg text-[var(--color-primary-blue)] border border-[var(--color-border-subtle)]">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-[var(--color-text-primary)]">{modelo.nome}</h4>
                <div className="text-xs text-[var(--color-text-muted)] mt-1 flex gap-2 items-center">
                  <span className="bg-[var(--color-surface-sunken)] px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">{modelo.tipo}</span>
                  <span>&bull;</span>
                  <span>Usado: {modelo.uso}</span>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setEditingTemplate(modelo); setIsModalOpen(true); }}
              className="shrink-0 text-xs font-bold border-[var(--color-border-default)] hover:bg-[var(--color-surface-sunken)]"
            >
              Editar Modelo
            </Button>
          </Card>
        ))}
      </div>

      <NovoModeloModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingTemplate(null); }}
        initialValue={editingTemplate}
        title={editingTemplate ? "Editar Modelo" : "Novo Modelo"}
        submitText={editingTemplate ? "Salvar Alterações" : "Salvar"}
        onSave={handleSave}
      />
    </div>
  );
}

export function ConfigEngajamentoAutomacoes() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">Regras de Automação</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Gatilhos do sistema baseados em eventos do pipeline.</p>
        </div>
        <Button onClick={() => window.location.href = '/app/automacoes'} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
          <Plus className="w-4 h-4 mr-1" /> Nova Automação
        </Button>
      </div>

      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          O construtor central de automações agora possui uma tela dedicada em tela cheia.
        </p>
        <Button 
          onClick={() => window.location.href = '/app/automacoes'} 
          variant="outline"
          className="mt-4 h-9 px-4 text-xs font-bold gap-2 text-[var(--color-text-primary)] border-[var(--color-border-default)] hover:bg-[var(--color-surface-sunken)]"
        >
          Abrir Motor de Automação <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </Card>
    </div>
  );
}

export function ConfigBusinessDashboard() {
  const { appSettings, saveAppSetting } = useData();
  const [selectedKPIs, setSelectedKPIs] = useState<{ name: string, alertEnabled: boolean, target: number }[]>([]);
  const [availableKPIs] = useState(['Receita (MRR)', 'Leads Totais', 'Conversão', 'Win Rate', 'Churn Rate', 'Score IA Médio']);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    const saved = appSettings?.[BUSINESS_DASHBOARD_KPIS_KEY];
    if (saved) { setSelectedKPIs(saved); setHydrated(true); }
  }, [appSettings, hydrated]);

  const handleSaveDashboard = async () => {
    setHydrated(true);
    await saveAppSetting(BUSINESS_DASHBOARD_KPIS_KEY, selectedKPIs);
    toast.success("Configuração de Dashboard salva com sucesso!");
  };

  const toggleKPI = (kpiName: string) => {
    if (selectedKPIs.find(k => k.name === kpiName)) {
      setSelectedKPIs(prev => prev.filter(p => p.name !== kpiName));
    } else {
      setSelectedKPIs(prev => [...prev, { name: kpiName, alertEnabled: false, target: 0 }]);
    }
  };

  const updateKPI = (name: string, field: 'alertEnabled' | 'target', value: any) => {
    setSelectedKPIs(prev => prev.map(k => k.name === name ? { ...k, [field]: value } : k));
  };

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8,"
      + ["Nome,Alerta,Meta"].concat(selectedKPIs.map(kpi => `${kpi.name},${kpi.alertEnabled},${kpi.target}`)).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "relatorio_kpis.csv");
    document.body.appendChild(link);
    link.click();
    toast.success("Relatório de KPIs exportado com sucesso!");
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">Dashboard de Negócios</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Personalize os KPIs e alertas da tela inicial.</p>
        </div>
        <Button onClick={handleExport} variant="outline" className="h-9 px-4 text-xs font-bold border-[var(--color-border-default)]">
          Exportar Relatório
        </Button>
      </div>

      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <Reorder.Group axis="y" values={selectedKPIs} onReorder={setSelectedKPIs} className="space-y-3">
          {selectedKPIs.map((kpi) => (
            <Reorder.Item key={kpi.name} value={kpi} className="flex items-center justify-between p-3.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] cursor-grab active:cursor-grabbing">
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-[var(--color-text-primary)]">{kpi.name}</span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={kpi.alertEnabled} onChange={(e) => updateKPI(kpi.name, 'alertEnabled', e.target.checked)} className="rounded border-[var(--color-border-default)] bg-[var(--color-surface)]" />
                  <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1"><Bell className="w-3 h-3 text-[var(--color-primary-blue)]" /> Alerta (Meta: {kpi.target})</span>
                  <input type="number" value={kpi.target} onChange={(e) => updateKPI(kpi.name, 'target', Number(e.target.value))} className="w-20 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded px-2 py-1 text-xs text-[var(--color-text-primary)]" />
                </div>
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => toggleKPI(kpi.name)}
                  className="w-4 h-4 rounded border-[var(--color-border-default)] bg-[var(--color-surface)] cursor-pointer"
                />
              </div>
            </Reorder.Item>
          ))}
          {availableKPIs.filter(kpi => !selectedKPIs.find(s => s.name === kpi)).map(kpi => (
            <div key={kpi} className="flex items-center justify-between p-3.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] opacity-60">
              <span className="font-bold text-sm text-[var(--color-text-muted)]">{kpi}</span>
              <input
                type="checkbox"
                checked={false}
                onChange={() => toggleKPI(kpi)}
                className="w-4 h-4 rounded border-[var(--color-border-default)] bg-[var(--color-surface)] cursor-pointer"
              />
            </div>
          ))}
        </Reorder.Group>
        <Button onClick={handleSaveDashboard} className="mt-6 h-9 px-6 text-xs font-bold shadow-xs">
          Salvar Dashboards
        </Button>
      </Card>
    </div>
  );
}
