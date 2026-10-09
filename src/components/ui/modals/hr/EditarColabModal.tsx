import { useEffect, useState } from "react";
import { Pencil, ShieldCheck, User, Mail, Phone, Briefcase, Building2, Users, MapPin, Activity, Gauge } from "lucide-react";
import { useData } from "../../../../contexts/DataContext";
import { useDepartamentoOptions } from "../../../../hooks/useDepartamentoOptions";
import { Modal } from "../../modal";
import { Button } from "../../../ui/button";
import { supabase } from "../../../../lib/supabase";
import { wrapClass, iconBox, fieldClass, Field, SectionTitle } from "./MembroFormKit";

type EditarColabModalProps = {
  colab: any | null;
  onClose: () => void;
  /** tenantAccess só é passado quando o colaborador tem login vinculado (colab.user_id) e
   * quem está editando é master (única role que consegue de fato gravar isso — ver
   * setUserPartnerTenantAccess). */
  onSave: (id: string, updates: any, tenantAccess?: { userId: string; enabled: boolean }) => void;
  /** Só master vê/edita essa opção — escrever em partners/tenant_partners é restrito a
   * master via RLS. */
  canGrantTenantAccess?: boolean;
  filiais?: { id: string; nome: string }[];
};

const STATUS_OPTIONS = ["Ativo", "Inativo", "Férias", "Afastado"];

export function EditarColabModal({ colab, onClose, onSave, canGrantTenantAccess = false, filiais = [] }: EditarColabModalProps) {
  const [form, setForm] = useState({
    nome: "",
    cargo: "",
    email: "",
    phone: "",
    departamento: "",
    squad: "",
    status: "Ativo",
    desempenho: 100,
    filial_id: "",
  });
  const [permiteTrocarEmpresa, setPermiteTrocarEmpresa] = useState(false);
  const [permiteTrocarEmpresaInicial, setPermiteTrocarEmpresaInicial] = useState(false);
  const [tentou, setTentou] = useState(false);

  useEffect(() => {
    if (colab) {
      setTentou(false);
      setForm({
        nome: colab.nome || "",
        cargo: colab.cargo || "",
        email: colab.email || "",
        phone: colab.phone || "",
        departamento: colab.departamento || "",
        squad: colab.squad || "",
        status: colab.status || "Ativo",
        desempenho: colab.desempenho ?? 100,
        filial_id: colab.filial_id || "",
      });
    }
  }, [colab]);

  // Estado de acesso parceiro vive em `users.partner_id`, não em `colaboradores` — só dá
  // pra saber consultando à parte, e só faz sentido quando há um login vinculado.
  useEffect(() => {
    let active = true;
    setPermiteTrocarEmpresa(false);
    setPermiteTrocarEmpresaInicial(false);
    if (!colab?.user_id || !canGrantTenantAccess || !supabase) return;
    supabase.from("users").select("partner_id").eq("id", colab.user_id).maybeSingle().then(({ data }) => {
      if (!active) return;
      const has = !!data?.partner_id;
      setPermiteTrocarEmpresa(has);
      setPermiteTrocarEmpresaInicial(has);
    });
    return () => { active = false; };
  }, [colab?.user_id, canGrantTenantAccess]);

  const { cargos, squads } = useData();
  const departamentoOptions = useDepartamentoOptions();

  if (!colab) return null;

  const set = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));

  const erroNome = !form.nome.trim() ? "Informe o nome." : "";
  const erroEmail = form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim()) ? "E-mail inválido." : "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (erroNome || erroEmail) return;
    const tenantAccess = (canGrantTenantAccess && colab.user_id && permiteTrocarEmpresa !== permiteTrocarEmpresaInicial)
      ? { userId: colab.user_id, enabled: permiteTrocarEmpresa }
      : undefined;
    // filial_id é FK: "sem filial" precisa ir como null, nunca como string vazia.
    onSave(colab.id, { ...form, nome: form.nome.trim(), email: form.email.trim(), filial_id: form.filial_id || null }, tenantAccess);
    onClose();
  };

  const desempenho = Math.min(100, Math.max(0, Number(form.desempenho) || 0));

  return (
    <Modal
      isOpen={!!colab}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
            <Pencil className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-black text-[var(--color-text-primary)] leading-tight">Editar Colaborador</div>
            <div className="text-xs font-normal text-[var(--color-text-muted)] truncate">{colab.nome}</div>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <section className="space-y-3">
          <SectionTitle>Dados Pessoais</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nome Completo" required error={tentou ? erroNome : ""}>
              <div className={wrapClass(tentou && !!erroNome)}>
                <span className={iconBox}><User className="w-4 h-4" /></span>
                <input value={form.nome} onChange={e => set("nome", e.target.value)} placeholder="Ex: João da Silva" className={fieldClass} />
              </div>
            </Field>
            <Field label="E-mail" error={tentou ? erroEmail : ""}>
              <div className={wrapClass(tentou && !!erroEmail)}>
                <span className={iconBox}><Mail className="w-4 h-4" /></span>
                <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="joao@empresa.com.br" className={fieldClass} />
              </div>
            </Field>
            <Field label="Telefone / WhatsApp" className="sm:col-span-2">
              <div className={wrapClass()}>
                <span className={iconBox}><Phone className="w-4 h-4" /></span>
                <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(11) 98765-4321" className={fieldClass} />
              </div>
            </Field>
          </div>
        </section>

        <section className="space-y-3 pt-4 border-t border-[var(--color-border-subtle)]">
          <SectionTitle>Função na Equipe</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Cargo / Função">
              <div className={wrapClass()}>
                <span className={iconBox}><Briefcase className="w-4 h-4" /></span>
                <select value={form.cargo} onChange={e => set("cargo", e.target.value)} className={`${fieldClass} cursor-pointer`}>
                  <option value="">Selecione um cargo...</option>
                  {form.cargo && !cargos.some(c => c.nome === form.cargo) && <option value={form.cargo}>{form.cargo}</option>}
                  {cargos.map(c => (<option key={c.id} value={c.nome}>{c.nome}</option>))}
                </select>
              </div>
            </Field>
            <Field label="Departamento">
              <div className={wrapClass()}>
                <span className={iconBox}><Building2 className="w-4 h-4" /></span>
                <select value={form.departamento} onChange={e => set("departamento", e.target.value)} className={`${fieldClass} cursor-pointer`}>
                  <option value="">Selecione...</option>
                  {form.departamento && !departamentoOptions.includes(form.departamento) && <option value={form.departamento}>{form.departamento}</option>}
                  {departamentoOptions.map(d => (<option key={d} value={d}>{d}</option>))}
                </select>
              </div>
            </Field>
            <Field label="Squad">
              <div className={wrapClass()}>
                <span className={iconBox}><Users className="w-4 h-4" /></span>
                <select value={form.squad} onChange={e => set("squad", e.target.value)} className={`${fieldClass} cursor-pointer`}>
                  <option value="">Sem squad</option>
                  {form.squad && !squads.some(s => s.nome === form.squad) && <option value={form.squad}>{form.squad}</option>}
                  {squads.map(s => (<option key={s.id} value={s.nome}>{s.nome}</option>))}
                </select>
              </div>
            </Field>
            {filiais.length > 1 && (
              <Field label="Filial">
                <div className={wrapClass()}>
                  <span className={iconBox}><MapPin className="w-4 h-4" /></span>
                  <select value={form.filial_id} onChange={e => set("filial_id", e.target.value)} className={`${fieldClass} cursor-pointer`}>
                    <option value="">Sem filial específica</option>
                    {filiais.map(f => (<option key={f.id} value={f.id}>{f.nome}</option>))}
                  </select>
                </div>
              </Field>
            )}
          </div>
        </section>

        <section className="space-y-3 pt-4 border-t border-[var(--color-border-subtle)]">
          <SectionTitle>Situação</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Status">
              <div className={wrapClass()}>
                <span className={iconBox}><Activity className="w-4 h-4" /></span>
                <select value={form.status} onChange={e => set("status", e.target.value)} className={`${fieldClass} cursor-pointer`}>
                  {STATUS_OPTIONS.map(o => (<option key={o} value={o}>{o}</option>))}
                </select>
              </div>
            </Field>
            <Field label="Desempenho (%)">
              <div className={wrapClass()}>
                <span className={iconBox}><Gauge className="w-4 h-4" /></span>
                <input type="number" min={0} max={100} value={form.desempenho} onChange={e => set("desempenho", Number(e.target.value))} className={fieldClass} />
              </div>
              <div className="h-1.5 mt-2 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                <div className={`h-full rounded-full ${desempenho >= 70 ? "bg-emerald-500" : desempenho >= 40 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${desempenho}%` }} />
              </div>
            </Field>
          </div>
        </section>

        {canGrantTenantAccess && (
          <section className="space-y-3 pt-4 border-t border-[var(--color-border-subtle)]">
            <SectionTitle>Permissões Adicionais</SectionTitle>
            <label className={`flex items-start gap-3 p-3.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl ${colab.user_id ? "cursor-pointer" : "opacity-70 cursor-not-allowed"}`}>
              <input
                type="checkbox"
                disabled={!colab.user_id}
                checked={permiteTrocarEmpresa}
                onChange={(e) => setPermiteTrocarEmpresa(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[var(--color-primary-blue)] cursor-pointer disabled:cursor-not-allowed"
              />
              <ShieldCheck className="w-5 h-5 text-[var(--color-primary-blue)] shrink-0" />
              <span className="text-xs text-[var(--color-text-primary)]">
                <span className="font-bold block">Permitir trocar entre empresas clientes</span>
                <span className="block text-[var(--color-text-muted)] mt-0.5">
                  {colab.user_id
                    ? "Libera o seletor de tenant na barra lateral — a pessoa passa a ver e alternar entre todos os tenants ativos, não só este."
                    : "Esse colaborador não tem login vinculado (não veio de um cadastro com acesso) — nada pra liberar aqui."}
                </span>
              </span>
            </label>
          </section>
        )}

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--color-border-subtle)]">
          <Button type="button" variant="outline" onClick={onClose} className="h-10 px-5 text-xs font-bold border-[var(--color-border-default)]">
            Cancelar
          </Button>
          <Button type="submit" className="h-10 px-5 text-xs font-bold gap-2 shadow-xs">
            Salvar Alterações
          </Button>
        </div>
      </form>
    </Modal>
  );
}
