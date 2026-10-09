import React, { useEffect, useMemo, useState } from "react";
import { UserPlus, ShieldCheck, Eye, EyeOff, User, Mail, Phone, Briefcase, Building2, Users, Lock, Link2, Info, MapPin, Loader2 } from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import { useData } from "../../../../contexts/DataContext";
import { useDepartamentoOptions } from "../../../../hooks/useDepartamentoOptions";

export type NovoMembroPayload = {
  nome: string;
  email: string;
  phone: string;
  senha: string;
  cargo: string;
  departamento: string;
  squad: string;
  filialId: string;
  permiteTrocarEmpresa: boolean;
  /** "senha": o admin define a senha inicial; "convite": o colaborador recebe um link por e-mail para criar a própria. */
  modoAcesso: "senha" | "convite";
};

type NovoMembroModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: NovoMembroPayload) => void;
  title?: string;
  submitText?: string;
  initialValue?: Partial<NovoMembroPayload> | null;
  /** Só master vê essa opção — escrever em partners/tenant_partners é restrito a
   * master via RLS, então mostrar pra quem não é master criaria um controle que nunca
   * funcionaria de verdade. */
  canGrantTenantAccess?: boolean;
  /** Lista de filiais do tenant ativo — o campo só aparece quando há mais de uma. */
  filiais?: { id: string; nome: string }[];
  /** Esconde a seção "Acesso ao Sistema" (telas que só cadastram o membro, sem criar login). */
  showAccess?: boolean;
};

// Gera uma senha temporária forte quando o admin deixa o campo em branco —
// substitui o antigo fallback fixo "123456" (previsível/fraco, mesma senha
// pra toda conta criada sem senha explícita).
function generateTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 14) + "!A1";
}

const labelClass = "text-[11px] font-bold text-[var(--color-text-primary)] mb-1.5 block";
const wrapClass = (invalid?: boolean) =>
  `flex items-stretch w-full bg-[var(--color-surface-sunken)] border rounded-lg overflow-hidden transition-all focus-within:ring-2 focus-within:ring-[var(--color-primary-blue)] ${invalid ? "border-[var(--color-danger)]" : "border-[var(--color-border-default)]"}`;
const iconBox = "w-10 shrink-0 flex items-center justify-center border-r border-[var(--color-border-subtle)] text-[var(--color-text-muted)]";
const fieldClass = "flex-1 min-w-0 bg-transparent h-10 px-3 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none";

function Field({ label, required, error, hint, children, className }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelClass}>{label}{required && <span className="text-[var(--color-danger)]"> *</span>}</label>
      {children}
      {error ? <p className="text-[10px] text-[var(--color-danger)] mt-1">{error}</p> : hint ? <p className="text-[10px] text-[var(--color-text-faint)] mt-1">{hint}</p> : null}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-black text-[var(--color-text-primary)]">{children}</h3>;
}

export function NovoMembroModal({
  isOpen,
  onClose,
  onSave,
  title = "Novo Colaborador / Membro",
  submitText = "Adicionar à Equipe",
  initialValue,
  canGrantTenantAccess = false,
  filiais = [],
  showAccess = true,
}: NovoMembroModalProps) {
  const [nome, setNome] = useState(initialValue?.nome || "");
  const [email, setEmail] = useState(initialValue?.email || "");
  const [phone, setPhone] = useState(initialValue?.phone || "");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [modoAcesso, setModoAcesso] = useState<"senha" | "convite">("senha");
  const [tentou, setTentou] = useState(false);
  const [cargo, setCargo] = useState(initialValue?.cargo || "");
  const [departamento, setDepartamento] = useState(initialValue?.departamento || "");
  const [squad, setSquad] = useState("");
  const [filialId, setFilialId] = useState(initialValue?.filialId || "");
  const [permiteTrocarEmpresa, setPermiteTrocarEmpresa] = useState(initialValue?.permiteTrocarEmpresa ?? false);
  const [loading, setLoading] = useState(false);
  const { cargos, squads } = useData();
  const departamentoOptions = useDepartamentoOptions();

  useEffect(() => {
    if (!isOpen) return;
    setNome(initialValue?.nome || "");
    setEmail(initialValue?.email || "");
    setPhone(initialValue?.phone || "");
    setSenha("");
    setShowSenha(false);
    setConfirmaSenha("");
    setModoAcesso("senha");
    setTentou(false);
    setCargo(initialValue?.cargo || "");
    setDepartamento(initialValue?.departamento || "");
    setSquad("");
    setFilialId(initialValue?.filialId || "");
    setPermiteTrocarEmpresa(initialValue?.permiteTrocarEmpresa ?? false);
    setLoading(false);
  }, [isOpen, initialValue]);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const senhaFraca = modoAcesso === "senha" && senha.length > 0 && (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha));
  const senhaDiverge = modoAcesso === "senha" && senha.length > 0 && senha !== confirmaSenha;
  const erros = {
    nome: !nome.trim() ? "Informe o nome." : "",
    email: !email.trim() ? "Informe o e-mail." : !emailOk ? "E-mail inválido." : "",
    senha: senhaFraca ? "Mínimo 8 caracteres, com letras e números." : "",
    confirma: senhaDiverge ? "As senhas não coincidem." : "",
  };
  const temErro = Object.values(erros).some(Boolean);
  const canSubmit = !loading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (!canSubmit || temErro) return;

    setLoading(true);
    try {
      onSave({
        nome: nome.trim(),
        email: email.trim(),
        phone: phone.trim(),
        senha: modoAcesso === "senha" && senha ? senha : generateTempPassword(),
        modoAcesso,
        cargo: cargo.trim() || "Colaborador",
        departamento: departamento.trim() || "Geral",
        squad: squad.trim(),
        filialId,
        permiteTrocarEmpresa: canGrantTenantAccess && permiteTrocarEmpresa,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-black text-[var(--color-text-primary)] leading-tight">{title}</div>
            <div className="text-xs font-normal text-[var(--color-text-muted)]">Adicione um novo membro à sua equipe e defina suas permissões de acesso.</div>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <section className="space-y-3">
          <SectionTitle>Dados Pessoais</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nome Completo" required error={tentou ? erros.nome : ""}>
              <div className={wrapClass(tentou && !!erros.nome)}>
                <span className={iconBox}><User className="w-4 h-4" /></span>
                <input type="text" placeholder="Ex: João da Silva" value={nome} onChange={(e) => setNome(e.target.value)} className={fieldClass} />
              </div>
            </Field>
            <Field label="E-mail Corporativo" required error={tentou ? erros.email : ""}>
              <div className={wrapClass(tentou && !!erros.email)}>
                <span className={iconBox}><Mail className="w-4 h-4" /></span>
                <input type="email" placeholder="joao@empresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} />
              </div>
            </Field>
            <Field label="Telefone / WhatsApp">
              <div className={wrapClass()}>
                <span className={iconBox}><Phone className="w-4 h-4" /></span>
                <input type="tel" placeholder="(11) 98765-4321" value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} />
              </div>
            </Field>
            <Field label="Cargo / Função" hint="Se vazio, será “Colaborador”.">
              <div className={wrapClass()}>
                <span className={iconBox}><Briefcase className="w-4 h-4" /></span>
                <select value={cargo} onChange={(e) => setCargo(e.target.value)} className={`${fieldClass} cursor-pointer`}>
                  <option value="">Selecione...</option>
                  {cargos.map((c) => (<option key={c.id} value={c.nome}>{c.nome}</option>))}
                  <option value="SDR / Pré-Vendas">SDR / Pré-Vendas</option>
                  <option value="Closer / Executivo">Closer / Executivo</option>
                  <option value="Gerente Comercial">Gerente Comercial</option>
                  <option value="Analista de Suporte">Analista de Suporte</option>
                </select>
              </div>
            </Field>
            <Field label="Departamento" hint="Se vazio, será “Geral”.">
              <div className={wrapClass()}>
                <span className={iconBox}><Building2 className="w-4 h-4" /></span>
                <select value={departamento} onChange={(e) => setDepartamento(e.target.value)} className={`${fieldClass} cursor-pointer`}>
                  <option value="">Selecione...</option>
                  {departamentoOptions.map((d) => (<option key={d} value={d}>{d}</option>))}
                </select>
              </div>
            </Field>
            <Field label="Squad">
              <div className={wrapClass()}>
                <span className={iconBox}><Users className="w-4 h-4" /></span>
                <select value={squad} onChange={(e) => setSquad(e.target.value)} className={`${fieldClass} cursor-pointer`}>
                  <option value="">Sem squad</option>
                  {squads.map((s) => (<option key={s.id} value={s.nome}>{s.nome}</option>))}
                </select>
              </div>
            </Field>
            {filiais.length > 1 && (
              <Field label="Filial" className="sm:col-span-2">
                <div className={wrapClass()}>
                  <span className={iconBox}><MapPin className="w-4 h-4" /></span>
                  <select value={filialId} onChange={(e) => setFilialId(e.target.value)} className={`${fieldClass} cursor-pointer`}>
                    <option value="">Sem filial específica</option>
                    {filiais.map((f) => (<option key={f.id} value={f.id}>{f.nome}</option>))}
                  </select>
                </div>
              </Field>
            )}
          </div>
        </section>

        {showAccess && (
          <section className="space-y-3 pt-4 border-t border-[var(--color-border-subtle)]">
            <SectionTitle>Acesso ao Sistema</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { id: "senha", icon: Lock, title: "Criar senha para o colaborador", desc: "Defina uma senha inicial para o acesso." },
                { id: "convite", icon: Link2, title: "Enviar link de convite", desc: "O colaborador define a própria senha." },
              ] as const).map((o) => {
                const active = modoAcesso === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setModoAcesso(o.id)}
                    aria-pressed={active}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all ${active ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] hover:border-[var(--color-primary-blue)]/50"}`}
                  >
                    <span className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"}`}>
                      <o.icon className="w-5 h-5" />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-xs font-bold ${active ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-primary)]"}`}>{o.title}</span>
                      <span className="block text-[11px] text-[var(--color-text-muted)]">{o.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {modoAcesso === "senha" ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Senha" error={tentou ? erros.senha : ""}>
                    <div className={wrapClass(tentou && !!erros.senha)}>
                      <span className={iconBox}><Lock className="w-4 h-4" /></span>
                      <input type={showSenha ? "text" : "password"} placeholder="Mínimo 8 caracteres" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" className={fieldClass} />
                      <button type="button" onClick={() => setShowSenha(!showSenha)} aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"} className="px-3 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-transparent border-none cursor-pointer">
                        {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </Field>
                  <Field label="Confirmar senha" error={tentou ? erros.confirma : ""}>
                    <div className={wrapClass(tentou && !!erros.confirma)}>
                      <span className={iconBox}><Lock className="w-4 h-4" /></span>
                      <input type={showSenha ? "text" : "password"} placeholder="Digite novamente a senha" value={confirmaSenha} onChange={(e) => setConfirmaSenha(e.target.value)} autoComplete="new-password" className={fieldClass} />
                    </div>
                  </Field>
                </div>
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[var(--color-primary-blue)]/8 border border-[var(--color-primary-blue)]/20 text-[11px] text-[var(--color-primary-blue)]">
                  <Info className="w-4 h-4 shrink-0 mt-px" />
                  <span>A senha deve conter no mínimo 8 caracteres, incluindo letras e números. Deixando em branco, geramos uma senha temporária forte e mostramos para você compartilhar.</span>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[var(--color-primary-blue)]/8 border border-[var(--color-primary-blue)]/20 text-[11px] text-[var(--color-primary-blue)]">
                <Info className="w-4 h-4 shrink-0 mt-px" />
                <span>Enviaremos para {email.trim() || "o e-mail do colaborador"} um link para ele definir a própria senha. Até lá, o acesso fica protegido por uma senha temporária que ninguém conhece.</span>
              </div>
            )}
          </section>
        )}

        {canGrantTenantAccess && (
          <section className="space-y-3 pt-4 border-t border-[var(--color-border-subtle)]">
            <SectionTitle>Permissões Adicionais</SectionTitle>
            <label className="flex items-start gap-3 p-3.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={permiteTrocarEmpresa}
                onChange={(e) => setPermiteTrocarEmpresa(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[var(--color-primary-blue)] cursor-pointer"
              />
              <ShieldCheck className="w-5 h-5 text-[var(--color-primary-blue)] shrink-0" />
              <span className="text-xs text-[var(--color-text-primary)]">
                <span className="font-bold block">Permitir trocar entre empresas clientes</span>
                <span className="block text-[var(--color-text-muted)] mt-0.5">
                  Libera o seletor de tenant na barra lateral — a pessoa passa a ver e alternar entre todos os tenants ativos, não só este.
                </span>
              </span>
            </label>
          </section>
        )}

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--color-border-subtle)]">
          <Button type="button" variant="outline" onClick={onClose} className="h-10 px-5 text-xs font-bold border-[var(--color-border-default)]">
            Cancelar
          </Button>
          <Button type="submit" disabled={!canSubmit} className="h-10 px-5 text-xs font-bold gap-2 shadow-xs">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {loading ? "Salvando..." : submitText}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
