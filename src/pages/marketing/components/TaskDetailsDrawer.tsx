import React, { useState } from 'react';
import { AI_OUTSIDE_AURORA_ENABLED } from "../../../lib/featureFlags";
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import {
  Calendar, Clock, AlignLeft, FileText, Globe, Zap,
  Image, Plus, Sparkles, Loader2, Copy, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../../lib/apiClient';

interface TaskDetailsDrawerProps {
  selectedTask: any;
  setSelectedTask: (task: any) => void;
  tasks: any[];
  setTasks: React.Dispatch<React.SetStateAction<any[]>>;
  initialColumns: any[];
  activeTab: 'overview' | 'script' | 'refs' | 'ai';
  setActiveTab: (t: 'overview' | 'script' | 'refs' | 'ai') => void;
  updateTaskInDatabase: (task: any) => void;
}

export function TaskDetailsDrawer({
  selectedTask,
  setSelectedTask,
  tasks,
  setTasks,
  initialColumns,
  activeTab,
  setActiveTab,
  updateTaskInDatabase
}: TaskDetailsDrawerProps) {
  const [checklist, setChecklist] = useState<boolean[]>([false, false, false, false]);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState("");
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);

  const handleGenerateScript = async () => {
    setIsGeneratingScript(true);
    try {
      const res = await apiFetch("/api/ai/content-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: selectedTask.title, desc: selectedTask.desc, platform: selectedTask.platform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao gerar script.");
      setGeneratedScript(data.script || "");
      setGeneratedHashtags(data.hashtags || []);
      setActiveTab("script");
      toast.success("Script gerado pela IA!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar script.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 text-left">
      {/* Dynamic Content Stages Navigation */}
      <div className="flex items-center gap-2 mb-1 overflow-x-auto pb-3 scrollbar-none shrink-0 border-b border-white/5">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] shrink-0 mr-1.5">Mover para:</span>
        {initialColumns.map(col => {
          const isActive = selectedTask.colId === col.id;
          return (
            <button 
              key={col.id} 
              onClick={() => {
                const updatedTask = { ...selectedTask, colId: col.id };
                setTasks(prev => prev.map(t => t.id === selectedTask.id ? updatedTask : t));
                setSelectedTask(updatedTask);
                toast.success(`Movido para: ${col.title}`);
                updateTaskInDatabase(updatedTask);
              }}
              className={`px-3.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all border shrink-0 cursor-pointer ${
                isActive 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' 
                  : 'bg-[var(--color-surface-elevated)] border-white/10 text-slate-400 hover:text-white hover:border-white/20'
              }`}
            >
              {col.title}
            </button>
          );
        })}
      </div>

      {/* Progress Bar indicator */}
      <div className="h-1 w-full bg-slate-800 rounded-full mb-2 overflow-hidden shrink-0">
        <div 
          className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-500 ease-out"
          style={{ 
            width: `${(initialColumns.findIndex(c => c.id === selectedTask.colId) + 1) / initialColumns.length * 100}%` 
          }}
        />
      </div>

      {/* Header Block */}
      <Card className="p-5 border-white/10 bg-white/5 backdrop-blur-xl relative overflow-hidden rounded-2xl">
         <div className="absolute top-2 right-2 flex gap-1">
            <span className="text-[8px] font-black px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
              {selectedTask.platform}
            </span>
         </div>
         <div className="flex items-center gap-4 py-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-white shrink-0">
               {selectedTask.platform === 'Instagram' ? <Image className="w-6 h-6" /> : selectedTask.platform === 'TikTok' ? <Zap className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
            </div>
            <div className="min-w-0">
               <h3 className="text-lg font-black text-white leading-tight truncate uppercase tracking-tighter">
                  {selectedTask.title}
               </h3>
               <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                     <Calendar className="w-3.5 h-3.5" /> {selectedTask.date}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                     <Clock className="w-3.5 h-3.5" /> ID: {selectedTask.id}
                  </span>
               </div>
            </div>
         </div>
      </Card>

      {/* Tabs for Drawer Layout */}
      <div className="flex gap-2 border-b border-white/10 overflow-x-auto scrollbar-none shrink-0">
         {[
           { id: 'overview', label: 'GERAL', icon: AlignLeft },
           { id: 'script', label: 'ROTEIRO', icon: FileText },
           { id: 'refs', label: 'REFERÊNCIAS', icon: Globe },
           ...(AI_OUTSIDE_AURORA_ENABLED ? [{ id: 'ai', label: 'ASSISTENTE IA', icon: Zap }] : []),
         ].map((tab) => {
           const isActive = activeTab === tab.id;
           return (
             <button 
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`flex items-center gap-2 pb-2.5 pt-1.5 px-3 font-bold text-[10px] tracking-widest border-b-2 transition-all border-none bg-transparent shrink-0 whitespace-nowrap cursor-pointer ${
                 isActive 
                   ? 'border-blue-500 text-blue-500' 
                   : 'border-transparent text-slate-400 hover:text-white'
               }`}
             >
               <tab.icon className="w-3.5 h-3.5" />
               {tab.label}
             </button>
           );
         })}
      </div>

      {/* Content per Tab */}
      <div className="flex-1">
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-200">
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1.5">
                 <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Valor da Oportunidade</h4>
                 <div className="relative">
                   <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">R$</span>
                   <input
                     type="number"
                     value={selectedTask.value || 0}
                     onChange={(e) => {
                       const updatedValue = parseFloat(e.target.value) || 0;
                       const updatedTask = { ...selectedTask, value: updatedValue };
                       setSelectedTask(updatedTask);
                       const updatedTasks = tasks.map(t => t.id === selectedTask.id ? updatedTask : t);
                       setTasks(updatedTasks);
                       updateTaskInDatabase(updatedTask);
                     }}
                     className="bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white outline-none w-full cursor-pointer hover:border-white/20 transition-all font-bold"
                   />
                 </div>
               </div>
               <div className="space-y-1.5">
                 <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Prioridade</h4>
                 <select 
                   value={selectedTask.priority || "Média"}
                   onChange={(e) => {
                     const updatedPriority = e.target.value;
                     const updatedTask = { ...selectedTask, priority: updatedPriority };
                     setSelectedTask(updatedTask);
                     const updatedTasks = tasks.map(t => t.id === selectedTask.id ? updatedTask : t);
                     setTasks(updatedTasks);
                     updateTaskInDatabase(updatedTask);
                     toast.success(`Prioridade alterada para ${updatedPriority}`);
                   }}
                   className="bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-3.5 py-2 text-xs text-white outline-none w-full cursor-pointer hover:border-white/20 transition-all font-bold"
                 >
                   <option value="Alta">🔴 Alta</option>
                   <option value="Média">🟡 Média</option>
                   <option value="Baixa">🟢 Baixa</option>
                 </select>
               </div>
               <div className="space-y-1.5">
                 <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Canal / Rede</h4>
                 <select 
                   value={selectedTask.platform}
                   onChange={(e) => {
                     const updatedPlatform = e.target.value;
                     const updatedTask = { ...selectedTask, platform: updatedPlatform };
                     setSelectedTask(updatedTask);
                     const updatedTasks = tasks.map(t => t.id === selectedTask.id ? updatedTask : t);
                     setTasks(updatedTasks);
                     updateTaskInDatabase(updatedTask);
                     toast.success(`Plataforma alterada para ${updatedPlatform}`);
                   }}
                   className="bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-3.5 py-2 text-xs text-white outline-none w-full cursor-pointer hover:border-white/20 transition-all font-bold"
                 >
                   <option value="Instagram">Instagram</option>
                   <option value="TikTok">TikTok</option>
                   <option value="LinkedIn">LinkedIn</option>
                   <option value="YouTube">YouTube</option>
                   <option value="Blog">Blog</option>
                 </select>
               </div>
             </div>

             <div className="space-y-3">
               <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Descrição Detalhada</h4>
                <textarea
                  value={selectedTask.desc}
                  onChange={(e) => {
                    const updatedDesc = e.target.value;
                    const updatedTask = { ...selectedTask, desc: updatedDesc };
                    setSelectedTask(updatedTask);
                    const updatedTasks = tasks.map(t => t.id === selectedTask.id ? updatedTask : t);
                    setTasks(updatedTasks);
                  }}
                  onBlur={() => {
                    updateTaskInDatabase(selectedTask);
                  }}
                  className="w-full bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl p-4 text-xs text-slate-300 leading-relaxed outline-none focus:border-blue-500/50 resize-none h-24"
                />
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="space-y-3">
                  <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Tarefas</h4>
                  <div className="space-y-2">
                     {['Definir briefing', 'Criar roteiro', 'Gravar / Produzir', 'Aprovar'].map((t, i) => (
                       <button
                         key={i}
                         type="button"
                         onClick={() => setChecklist(prev => prev.map((v, idx) => idx === i ? !v : v))}
                         className="w-full flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors text-left"
                       >
                          <CheckCircle2 className={`w-4 h-4 shrink-0 ${checklist[i] ? 'text-emerald-500' : 'text-slate-600'}`} />
                          <span className={`text-[11px] font-bold ${checklist[i] ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{t}</span>
                       </button>
                     ))}
                  </div>
               </div>
               <div className="space-y-3">
                  <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Links / Anexos</h4>
                  <div className="flex flex-wrap gap-2">
                     <button
                       onClick={() => toast.info("Upload de anexos ainda não disponível — em breve.")}
                       className="w-10 h-10 rounded-xl border border-dashed border-white/10 flex items-center justify-center text-slate-500 hover:text-white hover:border-white/30 transition-all bg-transparent cursor-pointer"
                     >
                        <Plus className="w-4 h-4" />
                     </button>
                  </div>
               </div>
             </div>
          </div>
        )}

        {activeTab === 'script' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex justify-between items-center">
              <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Editor de Roteiro</h4>
              <Button
                variant="ghost"
                className="h-6 text-[9px] uppercase font-black px-2 hover:bg-white/5 cursor-pointer gap-1"
                onClick={() => {
                  if (!generatedScript) { toast.error("Nada para copiar ainda."); return; }
                  navigator.clipboard.writeText(generatedScript);
                  toast.success('Copiado para área de transferência!');
                }}
              >
                <Copy className="w-3 h-3" /> Copiar Tudo
              </Button>
            </div>
            <textarea
              value={generatedScript}
              onChange={(e) => setGeneratedScript(e.target.value)}
              className="w-full bg-white/5 border border-white/5 rounded-2xl p-6 text-slate-300 text-sm leading-relaxed focus:border-blue-500 outline-none transition-all min-h-[300px] shadow-inner font-mono"
              placeholder="Escreva seu roteiro passo-a-passo aqui..."
            ></textarea>
          </div>
        )}

        {activeTab === 'refs' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Referências Externas</h4>
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500">Nenhuma referência adicionada ainda.</p>
              <Button
                onClick={() => toast.info("Anexar links de referência ainda não disponível — em breve.")}
                variant="outline" className="w-full border-dashed border-white/10 h-12 text-[10px] uppercase font-bold text-slate-500 gap-2 hover:bg-white/5 cursor-pointer bg-transparent"
              >
                 <Plus className="w-3.5 h-3.5" /> Adicionar Link de Ideia
              </Button>
            </div>
          </div>
        )}

        {AI_OUTSIDE_AURORA_ENABLED && activeTab === 'ai' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-gradient-to-br from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-2xl p-6 relative overflow-hidden">
               <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                     <Zap className="w-5 h-5 text-blue-400" />
                     <h4 className="text-[10px] font-black text-white uppercase tracking-widest">CoPilot IA Content</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6">
                     Gere um roteiro curto otimizado para <strong>{selectedTask.platform}</strong> com base no título e na descrição desta pauta.
                  </p>
                  <Button
                    onClick={handleGenerateScript}
                    disabled={isGeneratingScript}
                    className="w-full bg-blue-600 hover:bg-blue-700 h-10 font-bold uppercase text-[10px] tracking-widest cursor-pointer disabled:opacity-50 gap-2"
                  >
                    {isGeneratingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {isGeneratingScript ? "Gerando..." : "Gerar Script de Alta Conversão"}
                  </Button>
               </div>
            </div>

            <Card className="p-4 bg-white/5 border-white/5 rounded-xl">
               <h5 className="text-[9px] font-black text-white uppercase tracking-[0.2em] mb-3 flex gap-2 items-center">
                  <Sparkles className="w-3 h-3 text-yellow-500" /> Hashtags sugeridas
               </h5>
               <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
                  {generatedHashtags.length > 0
                    ? generatedHashtags.map(h => `#${h}`).join(' ')
                    : "Gere um script para receber sugestões de hashtags baseadas nesta pauta."}
               </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
