import React, { useEffect, useRef, useState } from 'react';
import { AI_OUTSIDE_AURORA_ENABLED } from "../../../lib/featureFlags";
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import {
  Calendar, Clock, AlignLeft, FileText, Globe, Zap,
  Image, Plus, Sparkles, Loader2, Copy, CheckCircle2, Paperclip, Trash2, Link2, ExternalLink, StickyNote, User as UserIcon, X as XIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../../lib/apiClient';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useData } from '../../../contexts/DataContext';
import { BlocoAprovacao } from './Aprovacao';
import { dataCurta } from '../useMarketingConteudo';
import { confirmDialog } from '../../../components/ui/confirm-dialog';

const FORMATOS_CONTEUDO = ['Post', 'Carrossel', 'Reels / Vídeo curto', 'Stories', 'Vídeo longo', 'Artigo / Blog', 'E-mail', 'Live', 'Outro'];

const TIPOS_ANEXO = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const LIMITE_ANEXO = 25 * 1024 * 1024;

interface TaskDetailsDrawerProps {
  selectedTask: any;
  setSelectedTask: (task: any) => void;
  tasks: any[];
  setTasks: React.Dispatch<React.SetStateAction<any[]>>;
  initialColumns: any[];
  activeTab: 'overview' | 'script' | 'refs' | 'ai' | 'notas';
  setActiveTab: (t: 'overview' | 'script' | 'refs' | 'ai' | 'notas') => void;
  updateTaskInDatabase: (task: any) => void;
  /** Clientes atendidos (agência/BPO). Sem nenhum, o campo não aparece. */
  clientes: { id: string; nome: string }[];
  onPedirAprovacao: () => void;
  onCancelarAprovacao: () => void;
}

export function TaskDetailsDrawer({
  selectedTask,
  setSelectedTask,
  tasks,
  setTasks,
  initialColumns,
  activeTab,
  setActiveTab,
  updateTaskInDatabase,
  clientes,
  onPedirAprovacao,
  onCancelarAprovacao,
}: TaskDetailsDrawerProps) {
  const { activeTenantId, user } = useAuth() as any;
  const { colaboradores } = useData();
  const [novaNota, setNovaNota] = useState('');
  const nomesEquipe = Array.from(new Set([...(colaboradores as any[]).map((c) => String(c.nome || '').trim()).filter(Boolean), ...(selectedTask?.responsavel ? [selectedTask.responsavel] : [])])).sort();
  const notas: { id: string; autor: string; texto: string; em: string }[] = Array.isArray(selectedTask?.notas) ? selectedTask.notas : [];
  const [checklist, setChecklistLocal] = useState<boolean[]>([false, false, false, false]);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState("");
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [novoLink, setNovoLink] = useState("");
  const [enviando, setEnviando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  // Cada pauta guarda seu checklist, roteiro, hashtags, links e anexos (antes ficavam só na tela e sumiam ao fechar).
  useEffect(() => {
    setChecklistLocal(Array.isArray(selectedTask?.checklist) && selectedTask.checklist.length === 4 ? selectedTask.checklist : [false, false, false, false]);
    setGeneratedScript(selectedTask?.script || "");
    setGeneratedHashtags(Array.isArray(selectedTask?.hashtags) ? selectedTask.hashtags : []);
    setNovoLink("");
    setNovaNota('');
  }, [selectedTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvarExtras = (patch: Record<string, any>) => {
    const updatedTask = { ...selectedTask, ...patch };
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? updatedTask : t));
    setSelectedTask(updatedTask);
    updateTaskInDatabase(updatedTask);
  };
  const setChecklist = (fn: (prev: boolean[]) => boolean[]) => {
    const novo = fn(checklist);
    setChecklistLocal(novo);
    salvarExtras({ checklist: novo });
  };
  // Trocar de cliente tira a pauta do link do cliente anterior.
  const trocarCliente = async (clienteId: string) => {
    if (selectedTask.aprovacao) {
      const ok = await confirmDialog({
        title: 'Trocar o cliente?',
        description: 'O pedido de aprovação desta pauta é cancelado e ela sai do link do cliente atual.',
        confirmLabel: 'Trocar cliente',
      });
      if (!ok) return;
    }
    salvarExtras({ clienteId, aprovacao: undefined });
  };
  const mudarData = (iso: string) => {
    const atualizada = { ...selectedTask, publishDateISO: iso, date: iso ? dataCurta(iso) : 'Sem data' };
    setSelectedTask(atualizada);
    // Enquanto o ano é digitado o campo passa por datas como 0002-12-01: só grava a data completa.
    if (iso && iso < '2000-01-01') return;
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? atualizada : t));
    updateTaskInDatabase(atualizada);
  };
  const refs: { id: string; url: string }[] = Array.isArray(selectedTask?.refs) ? selectedTask.refs : [];
  const anexos: { url: string; nome: string; tamanho: number }[] = Array.isArray(selectedTask?.anexos) ? selectedTask.anexos : [];

  const adicionarLink = () => {
    let url = novoLink.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { new URL(url); } catch { toast.error('Link inválido.'); return; }
    if (refs.some(r => r.url === url)) { toast.info('Esse link já está na lista.'); return; }
    salvarExtras({ refs: [...refs, { id: crypto.randomUUID(), url }] });
    setNovoLink('');
  };

  const enviarArquivo = async (file: File) => {
    if (!supabase || !activeTenantId) { toast.error('Sem conexão com o armazenamento.'); return; }
    if (!TIPOS_ANEXO.includes(file.type)) { toast.error('Tipo não aceito. Use PDF, imagem (PNG/JPG/WebP), Word ou Excel.'); return; }
    if (file.size > LIMITE_ANEXO) { toast.error('O arquivo passa de 25 MB.'); return; }
    setEnviando(true);
    try {
      const seguro = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
      const path = `${activeTenantId}/marketing/${selectedTask.id}/${Date.now()}-${seguro}`;
      const { error } = await supabase.storage.from('products').upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('products').getPublicUrl(path);
      salvarExtras({ anexos: [...anexos, { url: data.publicUrl, nome: file.name, tamanho: file.size, path }] });
      toast.success('Arquivo anexado.');
    } catch (e: any) {
      toast.error(`Não foi possível anexar: ${e?.message || 'erro desconhecido'}`);
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  };

  const removerAnexo = async (a: any) => {
    if (a.path && supabase) await supabase.storage.from('products').remove([a.path]).catch(() => {});
    salvarExtras({ anexos: anexos.filter(x => x.url !== a.url) });
  };

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
      salvarExtras({ script: data.script || "", hashtags: data.hashtags || [] });
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
                     <UserIcon className="w-3.5 h-3.5" /> {selectedTask.responsavel || 'Sem responsável'}
                  </span>
                  {selectedTask.formato && <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{selectedTask.formato}</span>}
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
           { id: 'notas', label: `NOTAS${notas.length ? ` (${notas.length})` : ''}`, icon: StickyNote },
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
             <BlocoAprovacao task={selectedTask} onEnviar={onPedirAprovacao} onCancelar={onCancelarAprovacao} />
             <div className="grid grid-cols-2 gap-4">
               {clientes.length > 0 && (
                 <div className="space-y-1.5">
                   <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Cliente</h4>
                   <select
                     value={clientes.some((c) => c.id === selectedTask.clienteId) ? selectedTask.clienteId : ''}
                     onChange={(e) => void trocarCliente(e.target.value)}
                     className="bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-3.5 py-2 text-xs text-white outline-none w-full cursor-pointer hover:border-white/20 transition-all"
                   >
                     <option value="">Sem cliente</option>
                     {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                   </select>
                 </div>
               )}
               <div className="space-y-1.5">
                 <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Data de publicação</h4>
                 <input
                   type="date"
                   value={selectedTask.publishDateISO || ''}
                   onChange={(e) => mudarData(e.target.value)}
                   className="bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-3.5 py-2 text-xs text-white outline-none w-full cursor-pointer hover:border-white/20 transition-all"
                 />
               </div>
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
                 <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Responsável</h4>
                 <select
                   value={selectedTask.responsavel || ''}
                   onChange={(e) => { salvarExtras({ responsavel: e.target.value }); toast.success(e.target.value ? `Responsável: ${e.target.value}` : 'Responsável removido'); }}
                   className="bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-3.5 py-2 text-xs text-white outline-none w-full cursor-pointer hover:border-white/20 transition-all font-bold"
                 >
                   <option value="">Sem responsável</option>
                   {nomesEquipe.map((n) => <option key={n} value={n}>{n}</option>)}
                 </select>
               </div>
               <div className="space-y-1.5">
                 <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Formato</h4>
                 <select
                   value={selectedTask.formato || ''}
                   onChange={(e) => salvarExtras({ formato: e.target.value })}
                   className="bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-3.5 py-2 text-xs text-white outline-none w-full cursor-pointer hover:border-white/20 transition-all font-bold"
                 >
                   <option value="">Não definido</option>
                   {FORMATOS_CONTEUDO.map((f) => <option key={f} value={f}>{f}</option>)}
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
                  <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Anexos</h4>
                  <input ref={arquivoRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarArquivo(f); }} />
                  <div className="space-y-2">
                    {anexos.map(a => (
                      <div key={a.url} className="flex items-center gap-2 p-2.5 bg-white/5 rounded-xl border border-white/5">
                        <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <a href={a.url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-slate-300 hover:text-white truncate flex-1">{a.nome}</a>
                        <span className="text-[10px] text-slate-500 shrink-0">{(a.tamanho / 1024 / 1024).toFixed(1)} MB</span>
                        <button type="button" onClick={() => void removerAnexo(a)} className="text-slate-500 hover:text-rose-400" aria-label="Remover anexo"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    <button type="button" disabled={enviando} onClick={() => arquivoRef.current?.click()}
                      className="w-full h-10 rounded-xl border border-dashed border-white/10 flex items-center justify-center gap-2 text-[10px] uppercase font-bold text-slate-500 hover:text-white hover:border-white/30 transition-colors cursor-pointer">
                      {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {enviando ? 'Enviando…' : 'Anexar arquivo (PDF, imagem, Word, Excel — até 25 MB)'}
                    </button>
                  </div>
               </div>
             </div>
          </div>
        )}

        {activeTab === 'notas' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = novaNota.trim();
                if (!t) return;
                salvarExtras({ notas: [...notas, { id: crypto.randomUUID(), autor: String(user?.name || user?.email || 'Você'), texto: t.slice(0, 2000), em: new Date().toISOString() }] });
                setNovaNota('');
              }}
            >
              <textarea rows={3} value={novaNota} onChange={(e) => setNovaNota(e.target.value)} maxLength={2000} placeholder="Registre uma decisão, um pedido de ajuste, um feedback…"
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-blue-500 resize-none" />
              <div className="flex justify-end"><Button type="submit" disabled={!novaNota.trim()} className="h-8 px-4 text-[10px] uppercase font-bold cursor-pointer">Salvar nota</Button></div>
            </form>
            <ul className="space-y-2">
              {[...notas].reverse().map((n) => (
                <li key={n.id} className="p-3 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 mb-1">
                    <span className="font-black text-slate-400 truncate">{n.autor || '—'}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {n.em ? new Date(n.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      <button type="button" aria-label="Excluir nota" onClick={() => salvarExtras({ notas: notas.filter((x) => x.id !== n.id) })} className="hover:text-rose-400 cursor-pointer bg-transparent border-none p-0"><XIcon className="w-3 h-3" /></button>
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 whitespace-pre-wrap break-words">{n.texto}</p>
                </li>
              ))}
              {notas.length === 0 && <li className="text-[11px] text-slate-500">Nenhuma nota ainda.</li>}
            </ul>
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
              onBlur={() => { if (generatedScript !== (selectedTask.script || "")) salvarExtras({ script: generatedScript }); }}
              className="w-full bg-white/5 border border-white/5 rounded-2xl p-6 text-slate-300 text-sm leading-relaxed focus:border-blue-500 outline-none transition-all min-h-[300px] shadow-inner font-mono"
              placeholder="Escreva seu roteiro passo-a-passo aqui..."
            ></textarea>
          </div>
        )}

        {activeTab === 'refs' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Referências Externas</h4>
            <div className="space-y-3">
              {refs.length === 0 && <p className="text-[11px] text-slate-500">Nenhuma referência adicionada ainda.</p>}
              {refs.map(r => (
                <div key={r.id} className="flex items-center gap-2 p-2.5 bg-white/5 rounded-xl border border-white/5">
                  <Link2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-slate-300 hover:text-white truncate flex-1">{r.url}</a>
                  <a href={r.url} target="_blank" rel="noreferrer" aria-label="Abrir"><ExternalLink className="w-3.5 h-3.5 text-slate-500 hover:text-white" /></a>
                  <button type="button" onClick={() => salvarExtras({ refs: refs.filter(x => x.id !== r.id) })} className="text-slate-500 hover:text-rose-400" aria-label="Remover link"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={novoLink} onChange={(e) => setNovoLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarLink(); } }} placeholder="Cole o link de uma ideia ou referência"
                  className="flex-1 h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 outline-none focus:border-blue-500" />
                <Button onClick={adicionarLink} variant="outline" className="h-10 px-4 text-[10px] uppercase font-bold gap-1.5 cursor-pointer"><Plus className="w-3.5 h-3.5" />Adicionar</Button>
              </div>
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
