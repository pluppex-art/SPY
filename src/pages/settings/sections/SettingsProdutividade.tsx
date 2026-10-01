import React, { useState, useMemo, useEffect } from "react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Plus, DollarSign, TrendingUp, AlertCircle, Briefcase, Target, Zap, Pencil, Trash2 } from "lucide-react";
import { useData } from "../../../contexts/DataContext";
import { NovaCategoriaTarefaModal } from "../../../components/ui/modals/productivity/NovaCategoriaTarefaModal";
import { NovoPlanoContasModal, type FinanceCategorySubtipo } from "../../../components/ui/modals/settings/NovoPlanoContasModal";
import { confirmDialog } from "../../../components/ui/confirm-dialog";
import { toast } from "sonner";

const SUBTIPO_LABELS: Record<FinanceCategorySubtipo, string> = {
    DESPESA_FIXA: "Fixa",
    DESPESA_VARIAVEL: "Variável",
    PESSOAS: "Pessoas",
    IMPOSTOS: "Impostos",
};

const TASK_CATEGORIES_SETTING_KEY = "produtividade_categorias_tarefa";
const DEFAULT_TASK_CATEGORIES = [
    { id: "1", nome: "Follow-up", cor: "bg-[var(--color-primary-blue)]" },
    { id: "2", nome: "Reunião", cor: "bg-[var(--color-text-muted)]" },
    { id: "3", nome: "Proposta", cor: "bg-success" }
];
// O modal usa nomes de cor em português (Azul, Verde...); as categorias
// armazenadas usam classes Tailwind (bg-blue-500...) — sem esse mapeamento,
// uma categoria nova salvava "Azul" como classe CSS e a bolinha de cor
// nunca aparecia.
const CATEGORIA_COR_TO_CLASS: Record<string, string> = {
    Azul: "bg-[var(--color-primary-blue)]",
    Verde: "bg-success",
    Vermelho: "bg-danger",
    Laranja: "bg-warning",
    Roxo: "bg-[var(--color-text-muted)]",
};
const CATEGORIA_CLASS_TO_COR: Record<string, string> = {
    "bg-[var(--color-primary-blue)]": "Azul",
    "bg-success": "Verde",
    "bg-danger": "Vermelho",
    "bg-warning": "Laranja",
    "bg-[var(--color-text-muted)]": "Roxo",
};

export function ConfigProdutividadeCategorias() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<any | null>(null);
    const { squads, leads, appSettings, saveAppSetting } = useData();
    const [categories, setCategories] = useState<any[]>(DEFAULT_TASK_CATEGORIES);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        if (hydrated) return;
        const saved = appSettings?.[TASK_CATEGORIES_SETTING_KEY];
        if (saved) { setCategories(saved); setHydrated(true); }
    }, [appSettings, hydrated]);

    const persistCategories = (next: any[]) => {
        setCategories(next);
        setHydrated(true);
        saveAppSetting(TASK_CATEGORIES_SETTING_KEY, next);
    };

    const handleSave = (data: { nome: string; cor: string }) => {
        const corClass = CATEGORIA_COR_TO_CLASS[data.cor] || "bg-[var(--color-primary-blue)]";
        if (editingCategory) {
            persistCategories(categories.map((c) => (c.id === editingCategory.id ? { ...c, nome: data.nome, cor: corClass } : c)));
            toast.success("Categoria de tarefa atualizada!");
        } else {
            persistCategories([{ id: Date.now().toString(), nome: data.nome, cor: corClass }, ...categories]);
            toast.success("Categoria de tarefa criada!");
        }
        setIsModalOpen(false);
        setEditingCategory(null);
    };

    const cacData = useMemo(() => {
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        return squads.map(sq => {
            // Count leads assigned to members of this squad in current month
            const newLeads = leads.filter(l => {
                const leadDate = new Date(l.date.replace('Hoje, ', '').replace('Ontem, ', '')); // Simple parser
                const isCurrentMonth = leadDate.getMonth() === currentMonth && leadDate.getFullYear() === currentYear;
                return isCurrentMonth && sq.membros.some(m => l.seller && m.includes(l.seller.split(' ')[0]));
            }).length;

            const cac = newLeads > 0 ? (sq.orcamentoMensal / newLeads) : 0;

            return {
                name: sq.nome.split(' ')[1] || sq.nome,
                cac: cac,
                leads: newLeads,
                budget: sq.orcamentoMensal
            };
        });
    }, [squads, leads]);

    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">Categorias & Produtividade</h1>
                    <p className="text-sm text-[var(--color-text-muted)]">Organize as tarefas e visualize o CAC por time comercial.</p>
                </div>
                <Button onClick={() => { setEditingCategory(null); setIsModalOpen(true); }} className="font-bold px-6"><Plus className="w-4 h-4 mr-2" /> Nova Categoria</Button>
            </div>

            {/* CAC Visualization Section */}
            <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden relative group">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-widest flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-[var(--color-primary-blue)]" /> Custo de Aquisição (CAC) por Squad
                        </h3>
                        <p className="text-[10px] text-[var(--color-text-faint)] font-medium uppercase mt-1">Investimento Mensal / Novos Leads (Mês Atual)</p>
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8 items-center">
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={cacData}>
                                <XAxis dataKey="name" stroke="var(--color-text-faint)" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="var(--color-text-faint)" fontSize={10} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-default)', borderRadius: '12px' }}
                                    itemStyle={{ fontSize: '10px', color: 'var(--color-text-primary)' }}
                                    formatter={(value: any) => [`R$ ${value.toFixed(2)}`, 'CAC']}
                                />
                                <Bar dataKey="cac" radius={[4, 4, 0, 0]} barSize={32}>
                                    {cacData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.cac > 200 ? 'var(--color-danger)' : 'var(--color-success)'} fillOpacity={0.6} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="space-y-4">
                        {cacData.map((sq, i) => (
                            <div key={i} className="p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl hover:border-[var(--color-border-default)] transition-colors">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase truncate max-w-[150px]">{sq.name}</span>
                                    <span className={`text-[10px] font-black ${sq.cac > 200 ? 'text-danger' : 'text-success'}`}>R$ {sq.cac.toFixed(0)}</span>
                                </div>
                                <div className="flex items-center gap-4 text-[9px] text-[var(--color-text-faint)] font-bold uppercase">
                                    <span>leads: {sq.leads}</span>
                                    <span>verba: R$ {sq.budget}</span>
                                </div>
                            </div>
                        ))}
                        {cacData.some(s => s.leads === 0) && (
                            <div className="p-2.5 bg-warning/10 border border-warning/20 rounded-lg flex items-center gap-2">
                                <AlertCircle className="w-3.5 h-3.5 text-warning" />
                                <span className="text-[9px] text-warning font-bold uppercase">Alguns squads estão sem leads novos este mês</span>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
                {categories.map((cat: any) => (
                    <Card key={cat.id} className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex justify-between items-center group">
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${cat.cor}`}></div>
                            <span className="font-semibold text-[var(--color-text-primary)]">{cat.nome}</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditingCategory(cat); setIsModalOpen(true); }}
                        >
                            Editar
                        </Button>
                    </Card>
                ))}
            </div>

            <NovaCategoriaTarefaModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingCategory(null); }}
                initialValue={editingCategory ? { nome: editingCategory.nome, cor: (CATEGORIA_CLASS_TO_COR[editingCategory.cor] || "Azul") as "Azul" | "Verde" | "Vermelho" | "Laranja" | "Roxo" } : null}
                title={editingCategory ? "Editar Categoria de Tarefa" : "Nova Categoria de Tarefa"}
                submitText={editingCategory ? "Salvar Alterações" : "Salvar"}
                onSave={handleSave}
            />
        </div>
    );
}

export function ConfigFinanceiroCategorias() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<{ id: string; nome: string; tipo: "Receita" | "Despesa"; subtipo: FinanceCategorySubtipo | null } | null>(null);
    const { financeCategories, addFinanceCategory, updateFinanceCategory, deleteFinanceCategory, financeEntries, ensureNicheModulesLoaded } = useData();
    useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);
    const categories: { id: string, nome: string, tipo: "Receita" | "Despesa", subtipo: FinanceCategorySubtipo | null }[] =
        financeCategories.map((c: any) => ({ id: c.id, nome: c.nome, tipo: c.tipo, subtipo: c.subtipo ?? null }));

    // Categoria em uso não pode ser excluída — deixaria lançamentos órfãos e
    // quebraria o DRE/relatórios históricos que dependem dela.
    const emUso = useMemo(() => new Set((financeEntries as any[]).map(e => e.category_id).filter(Boolean)), [financeEntries]);

    const handleSave = (data: { nome: string, tipo: "Receita" | "Despesa", subtipo: FinanceCategorySubtipo | null }) => {
        if (editing) {
            updateFinanceCategory(editing.id, data);
            toast.success("Categoria atualizada!");
        } else {
            addFinanceCategory(data);
            toast.success("Nova categoria financeira cadastrada!");
        }
        setIsModalOpen(false);
        setEditing(null);
    };

    const handleEdit = (cat: typeof categories[number]) => {
        setEditing(cat);
        setIsModalOpen(true);
    };

    const handleDelete = async (cat: typeof categories[number]) => {
        if (emUso.has(cat.id)) {
            toast.error("Esta categoria tem lançamentos vinculados e não pode ser excluída.");
            return;
        }
        if (!(await confirmDialog({ title: "Excluir categoria", description: `Excluir "${cat.nome}"? Essa ação não pode ser desfeita.` }))) return;
        deleteFinanceCategory(cat.id);
        toast.success("Categoria excluída.");
    };

    const renderRow = (cat: typeof categories[number]) => (
        <div key={cat.id} className="p-3 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg flex justify-between items-center group">
            <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--color-text-primary)]">{cat.nome}</span>
                {cat.subtipo && (
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border border-[var(--color-border-default)]">
                        {SUBTIPO_LABELS[cat.subtipo]}
                    </span>
                )}
                {!emUso.has(cat.id) && <span className="text-[9px] text-[var(--color-text-faint)] italic">Categoria ainda não utilizada</span>}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={() => handleEdit(cat)} title="Editar" className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10">
                    <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => handleDelete(cat)} title="Excluir" className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-danger hover:bg-danger/10">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );

    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">Planos de Contas (Categorias)</h1>
                    <p className="text-sm text-[var(--color-text-muted)]">Categorias para classificar receitas e despesas — o par tipo/subtipo define em qual linha do DRE cada lançamento é somado.</p>
                </div>
                <Button onClick={() => { setEditing(null); setIsModalOpen(true); }} className="font-bold px-6"><Plus className="w-4 h-4 mr-2" /> Nova Categoria</Button>
            </div>

            <div className="space-y-6">
                <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
                    <h3 className="font-bold text-lg mb-4 text-success flex items-center gap-2"><DollarSign className="w-5 h-5" /> Receitas</h3>
                    <div className="space-y-2">
                        {categories.filter(c => c.tipo === "Receita").map(renderRow)}
                    </div>
                </Card>

                <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
                    <h3 className="font-bold text-lg mb-4 text-danger flex items-center gap-2"><DollarSign className="w-5 h-5" /> Despesas</h3>
                    <div className="space-y-2">
                        {categories.filter(c => c.tipo === "Despesa").map(renderRow)}
                    </div>
                </Card>
            </div>

            <NovoPlanoContasModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditing(null); }}
                onSave={handleSave}
                title={editing ? "Editar Categoria Financeira" : undefined}
                submitText={editing ? "Salvar Alterações" : undefined}
                initialValue={editing}
            />
        </div>
    );
}

export function ConfigFinanceiroSquads() {
    const { squads, updateSquad, leads } = useData();

    const handleUpdateBudget = (id: string, budget: string) => {
        updateSquad(id, { orcamentoMensal: parseFloat(budget) || 0 });
        toast.success("Orçamento do squad atualizado!");
    };

    return (
        <div className="max-w-4xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">Gestão Financeira de Times & CAC <Briefcase className="w-5 h-5 text-[var(--color-primary-blue)]" /></h1>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">Configure o orçamento mensal de cada squad para cálculo automático de Custo de Aquisição de Clientes (CAC) em tempo real.</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {squads.map(sq => {
                    const squadLeadsCount = leads.filter(l => sq.membros.some(m => l.seller && m.includes(l.seller))).length || 1;
                    const cac = sq.orcamentoMensal / squadLeadsCount;

                    return (
                        <Card key={sq.id} className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] p-5 flex flex-col md:flex-row justify-between items-center gap-4 hover:border-[var(--color-primary-blue)]/30 transition-all">
                            <div className="flex items-center gap-4 w-full md:w-1/3">
                                <div className="w-10 h-10 rounded-full bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center text-[var(--color-primary-blue)]">
                                    <Target className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-[var(--color-text-primary)]">{sq.nome}</h4>
                                    <p className="text-[10px] text-[var(--color-text-faint)] uppercase font-black">{sq.membros.length} Integrantes</p>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-6 w-full md:w-2/3 justify-end items-center">
                                <div className="w-full sm:w-48 space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-[var(--color-text-faint)] tracking-widest block">Orçamento Mensal (Spend)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--color-text-faint)]">R$</span>
                                        <input
                                            type="number"
                                            defaultValue={sq.orcamentoMensal}
                                            onBlur={(e) => handleUpdateBudget(sq.id, e.target.value)}
                                            className="w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-lg p-2 pl-9 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-primary-blue)] focus:outline-none font-bold"
                                        />
                                    </div>
                                </div>

                                <div className="bg-[var(--color-primary-blue)]/5 border border-[var(--color-primary-blue)]/10 p-2 px-4 rounded-xl text-center min-w-[120px]">
                                    <span className="text-[9px] font-black text-[var(--color-primary-blue)] uppercase tracking-widest block mb-0.5">CAC Sugerido</span>
                                    <span className="text-sm font-bold text-[var(--color-text-primary)] italic">R$ {cac.toFixed(2)}</span>
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>

            <div className="p-4 bg-warning/5 border border-warning/10 rounded-2xl flex gap-3">
                <Zap className="w-5 h-5 text-warning shrink-0" />
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    <strong className="text-[var(--color-text-primary)] block mb-0.5 uppercase tracking-wide">Como funciona o CAC por Squad?</strong>
                    O sistema cruza o orçamento mensal alocado acima com os leads ganhos/gerados atribuídos aos membros do squad.
                    O cálculo é: <code className="text-warning font-mono">Orcamento / Total_Leads_no_Periodo</code>.
                    Manter orçamentos precisos permite que a IA identifique qual squad tem a melhor eficiência financeira na prospecção.
                </p>
            </div>
        </div>
    );
}
