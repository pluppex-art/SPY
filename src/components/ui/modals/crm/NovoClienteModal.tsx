import React, { useState, useEffect } from "react";
import { Building2, Mail, Phone, FileText, MapPin, Briefcase, Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import { useIbgeLocalidades } from "../../../../lib/ibgeLocalidades";

type Setor = "Tecnologia" | "Engenharia" | "Saúde" | "Varejo" | "Indústria" | "Educação" | "Financeiro" | "Outros";

interface NovoClienteForm {
  nome: string;
  documento: string;
  industry: Setor;
  email: string;
  telefone: string;
  cidade: string;
  estado: string;
}

interface ClienteParaEdicao {
  id: string;
  name: string;
  documento?: string | null;
  industry?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
}

interface NovoClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (data: Record<string, string | string[] | null>) => void;
  /** Presente = modal abre em modo edição, pré-preenchido com os dados deste
   * cliente (nada de reabrir em branco e o usuário ter que redigitar tudo
   * de novo só pra corrigir um telefone). */
  cliente?: ClienteParaEdicao | null;
}

const DEFAULT: NovoClienteForm = {
  nome: "",
  documento: "",
  industry: "Tecnologia",
  email: "",
  telefone: "",
  // Sem cidade/estado fixo — nem todo tenant fica em São Paulo (ex.: Palmas/TO).
  // Um valor pré-preenchido nesses campos vira dado real se o usuário não
  // reparar e não mexer, "assumindo" a cidade errada pra qualquer cliente novo.
  cidade: "",
  estado: "",
};

const inputClass =
  "w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all placeholder:text-slate-600";
const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5";

const SETORES: Setor[] = ["Tecnologia", "Engenharia", "Saúde", "Varejo", "Indústria", "Educação", "Financeiro", "Outros"];

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatDocumento(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    // CPF: 000.000.000-00
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  // CNPJ: 00.000.000/0000-00
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

type CnpjStatus = "idle" | "checking" | "active" | "inactive" | "invalid";

export function NovoClienteModal({ isOpen, onClose, onAction, cliente }: NovoClienteModalProps) {
  const isEditMode = !!cliente;
  const [form, setForm] = useState<NovoClienteForm>(DEFAULT);
  const [loading, setLoading] = useState(false);
  const [cnpjStatus, setCnpjStatus] = useState<{ status: CnpjStatus; message?: string }>({ status: "idle" });
  // Estado/Cidade reais (API do IBGE) em vez de texto livre com valor padrão
  // fixo — evita repetir o mesmo bug de sempre "virar São Paulo" sem querer.
  const { estados, municipios, loadingMunicipios } = useIbgeLocalidades(form.estado);

  useEffect(() => {
    if (isOpen) {
      setForm(
        cliente
          ? {
              nome: cliente.name || "",
              documento: cliente.documento ? formatDocumento(cliente.documento) : "",
              industry: (cliente.industry as Setor) || "Tecnologia",
              email: cliente.email || "",
              telefone: cliente.phone ? formatPhone(cliente.phone) : "",
              cidade: cliente.city || "",
              estado: cliente.state || "",
            }
          : DEFAULT
      );
      setCnpjStatus({ status: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cliente?.id]);

  const set = (k: keyof NovoClienteForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleDocumentoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDocumento(e.target.value);
    setForm((prev) => ({ ...prev, documento: formatted }));

    const digits = formatted.replace(/\D/g, "");
    if (digits.length === 14) {
      setCnpjStatus({ status: "checking" });
      try {
        const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
        if (resp.ok) {
          const data = await resp.json();
          const isActive = data.situacao_cadastral === 2;
          setCnpjStatus({
            status: isActive ? "active" : "inactive",
            message: data.descricao_situacao_cadastral,
          });
          setForm((prev) => ({
            ...prev,
            nome: prev.nome || (data.nome_fantasia || data.razao_social || prev.nome),
            email: prev.email || (data.email ? data.email.toLowerCase() : ""),
            telefone: prev.telefone || (data.ddd_telefone_1 ? formatPhone(data.ddd_telefone_1.replace(/\D/g, "")) : ""),
            cidade: data.municipio || prev.cidade,
            estado: data.uf || prev.estado,
          }));
        } else {
          const err = await resp.json().catch(() => ({}));
          setCnpjStatus({ status: "invalid", message: err.message || "CNPJ não encontrado." });
        }
      } catch {
        setCnpjStatus({ status: "invalid", message: "Falha na conexão." });
      }
    } else {
      setCnpjStatus({ status: "idle" });
    }
  };

  const canSubmit = form.nome.trim() && form.email.trim() && form.telefone.trim();

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 300));
    onAction({ ...form });
    setLoading(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="text-base font-black text-white">{isEditMode ? "Editar Cliente" : "Novo Cliente"}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              {isEditMode ? "Atualize os dados desta conta no CRM S.P.Y." : "Cadastro de conta no CRM S.P.Y."}
            </div>
          </div>
        </div>
      }
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-widest"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="novo-cliente-form"
            disabled={!canSubmit || loading}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isEditMode ? "Salvar Alterações" : "Cadastrar Cliente"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Info banner */}
        <div className="bg-[var(--color-surface)]/60 border border-white/10 rounded-xl p-4 flex gap-3 items-start">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-200">Conta registrada no CRM</p>
            <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
              O cliente será adicionado à base de contas e poderá ser vinculado a negócios, propostas e tarefas.
            </p>
          </div>
        </div>

        <form id="novo-cliente-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Nome */}
          <div>
            <label className={labelClass}>
              <span className="flex items-center gap-1.5"><Building2 className="w-3 h-3" /> Nome do Cliente / Empresa *</span>
            </label>
            <input
              required
              value={form.nome}
              onChange={set("nome")}
              placeholder="Ex: Vértice Innovations Ltda"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Documento */}
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1.5 justify-between w-full">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3 h-3" /> CPF / CNPJ
                  </span>
                  <span className="text-[9px] text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded-full">
                    Receita Federal Sync
                  </span>
                </span>
              </label>
              <input
                value={form.documento}
                onChange={handleDocumentoChange}
                placeholder="00.000.000/0001-00"
                maxLength={18}
                inputMode="numeric"
                className={inputClass}
              />
              <div className="mt-1.5 min-h-[20px]">
                {cnpjStatus.status === "checking" && (
                  <p className="text-[10px] text-blue-400 animate-pulse font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" /> Buscando...
                  </p>
                )}
                {cnpjStatus.status === "active" && (
                  <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> CNPJ Ativo e Validado
                  </p>
                )}
                {cnpjStatus.status === "inactive" && (
                  <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {cnpjStatus.message}
                  </p>
                )}
                {cnpjStatus.status === "invalid" && (
                  <p className="text-[10px] text-rose-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {cnpjStatus.message}
                  </p>
                )}
              </div>
            </div>

            {/* Setor */}
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1.5"><Briefcase className="w-3 h-3" /> Setor / Indústria *</span>
              </label>
              <select value={form.industry} onChange={set("industry")} className={inputClass} required>
                {SETORES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Email */}
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> E-mail Principal *</span>
              </label>
              <input
                required
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="contato@empresa.com"
                className={inputClass}
              />
            </div>

            {/* Telefone */}
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> Telefone *</span>
              </label>
              <input
                required
                type="tel"
                value={form.telefone}
                onChange={(e) => setForm((prev) => ({ ...prev, telefone: formatPhone(e.target.value) }))}
                placeholder="(11) 99999-9999"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Estado — vem primeiro porque a lista de cidades depende dele */}
            <div>
              <label className={labelClass}>Estado (UF)</label>
              <select
                value={form.estado}
                onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value, cidade: "" }))}
                className={inputClass + " uppercase"}
              >
                <option value="">Selecione...</option>
                {estados.map((uf) => (
                  <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>
                ))}
              </select>
            </div>

            {/* Cidade — lista real do IBGE pro estado escolhido (API pública,
                sem chave); se a API estiver fora do ar ou nenhum estado for
                escolhido ainda, cai pra texto livre em vez de travar o form. */}
            <div className="col-span-2">
              <label className={labelClass}>
                <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Cidade</span>
              </label>
              {form.estado && municipios.length > 0 ? (
                <select value={form.cidade} onChange={set("cidade")} className={inputClass}>
                  <option value="">{loadingMunicipios ? "Carregando..." : "Selecione..."}</option>
                  {municipios.map((m) => (
                    <option key={m.id} value={m.nome}>{m.nome}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.cidade}
                  onChange={set("cidade")}
                  placeholder={form.estado ? "Digite a cidade" : "Escolha o estado primeiro"}
                  className={inputClass}
                />
              )}
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
