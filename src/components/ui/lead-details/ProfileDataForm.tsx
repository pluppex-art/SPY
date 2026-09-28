import React from "react";
import {
  Mail, Phone, Building2, User, FileCheck, Briefcase, DollarSign, Lock, Edit, Search, Package, Repeat, MapPin, Factory,
} from "lucide-react";
import { formatCNPJ } from "../../../lib/utils";
import { CityAutocomplete } from "../CityAutocomplete";

interface ProfileDataFormProps {
  isEditingInline: boolean;
  setIsEditingInline: (val: boolean) => void;
  companyName: string;
  setCompanyName: (val: string) => void;
  leadName: string;
  setLeadName: (val: string) => void;
  phone: string;
  setPhone: (val: string) => void;
  cnpj: string;
  setCnpj: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  title: string;
  setTitle: (val: string) => void;
  value: string;
  setValue: (val: string) => void;
  displayValue: string;
  /** Referência de catálogo dos produtos vinculados (null quando nenhum) —
   * exibida ao lado do valor da proposta, mas sem ser o número principal. */
  productValue: string | null;
  /** MRR deste lead (soma do `mrr` dos contratos ativos ligados às propostas
   * dele) — null até a proposta ser de fato aceita e virar contrato. */
  leadMRR: string | null;
  seller: string;
  setSeller: (val: string) => void;
  priority: "Alta" | "Média" | "Baixa";
  setPriority: (val: any) => void;
  sellerOptions: string[];
  lead: any;
  updateLead: any;
  customLeadFields: any[];
  customFieldsState: Record<string, string | number>;
  setCustomFieldsState: React.Dispatch<React.SetStateAction<Record<string, string | number>>>;
  cnpjFetching: boolean;
  onFetchCnpj: () => void;
}

const inputActiveClass =
  "w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-1.5 text-[var(--color-text-primary)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all placeholder:text-[var(--color-text-faint)]";

function viewCls(colorCls = "text-[var(--color-text-primary)] font-semibold") {
  return `w-full bg-transparent border-none px-0 py-0 text-xs outline-none cursor-text appearance-none transition-all ${colorCls} placeholder:text-[var(--color-text-faint)]`;
}

function viewSelectCls(colorCls = "text-[var(--color-text-primary)] font-bold") {
  return `w-full bg-transparent border-none px-0 py-0 text-xs outline-none cursor-pointer appearance-none transition-all ${colorCls}`;
}

export function ProfileDataForm({
  isEditingInline,
  setIsEditingInline,
  companyName, setCompanyName,
  leadName, setLeadName,
  phone, setPhone,
  cnpj, setCnpj,
  email, setEmail,
  title, setTitle,
  value, setValue,
  displayValue,
  productValue,
  leadMRR,
  seller, setSeller,
  priority, setPriority,
  sellerOptions,
  lead,
  updateLead,
  customLeadFields,
  customFieldsState, setCustomFieldsState,
  cnpjFetching,
  onFetchCnpj,
}: ProfileDataFormProps) {
  return (
    <div className="border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] rounded-[var(--radius-panel)] overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] flex items-center justify-between">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Dados do Lead</h4>
        <button
          type="button"
          onClick={() => setIsEditingInline(!isEditingInline)}
          className={`text-[10px] font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
            isEditingInline
              ? "text-rose-600 dark:text-rose-400 border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20"
              : "text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/20 bg-[var(--color-primary-blue)]/10 hover:bg-[var(--color-primary-blue)]/20"
          }`}
        >
          {isEditingInline ? (
            <>
              <Lock className="w-3 h-3 shrink-0" />
              <span>Concluir Edição</span>
            </>
          ) : (
            <>
              <Edit className="w-3 h-3 shrink-0" />
              <span>Editar Campos</span>
            </>
          )}
        </button>
      </div>

      <div className="divide-y divide-[var(--color-border-subtle)]">
        <div className="grid grid-cols-2 divide-x divide-[var(--color-border-subtle)]">
          <div className="p-3">
            <div className="text-[10px] font-bold text-[var(--color-text-faint)] mb-1 uppercase tracking-wider flex items-center gap-1">
              <Building2 className="w-3 h-3 text-[var(--color-text-muted)]" /> Empresa / Razão
            </div>
            <input
              type="text"
              value={companyName}
              placeholder="Não informado"
              onFocus={() => setIsEditingInline(true)}
              onChange={(e) => setCompanyName(e.target.value)}
              className={isEditingInline ? inputActiveClass : viewCls()}
            />
          </div>
          <div className="p-3">
            <div className="text-[10px] font-bold text-[var(--color-text-faint)] mb-1 uppercase tracking-wider flex items-center gap-1">
              <User className="w-3 h-3 text-[var(--color-text-muted)]" /> Contato / Decisor
            </div>
            <input
              type="text"
              value={leadName}
              placeholder="Não informado"
              onFocus={() => setIsEditingInline(true)}
              onChange={(e) => setLeadName(e.target.value)}
              className={isEditingInline ? inputActiveClass : viewCls()}
            />
          </div>
        </div>

        <div className="p-3">
          <div
            className="text-[10px] font-bold text-[var(--color-text-faint)] mb-1 uppercase tracking-wider flex items-center gap-1"
            title="Vai junto com o nome do decisor (campo acima) pra proposta gerada a partir deste lead."
          >
            <User className="w-3 h-3 text-[var(--color-text-muted)]" /> Cargo do Decisor
          </div>
          <input
            type="text"
            value={(customFieldsState.currentRole as string) || ""}
            placeholder="Ex: Diretor Financeiro, CEO..."
            onFocus={() => setIsEditingInline(true)}
            onChange={(e) => setCustomFieldsState((prev) => ({ ...prev, currentRole: e.target.value }))}
            className={isEditingInline ? inputActiveClass : viewCls()}
          />
        </div>

        <div className="grid grid-cols-2 divide-x divide-[var(--color-border-subtle)]">
          <div className="p-3">
            <div className="text-[10px] font-bold text-[var(--color-text-faint)] mb-1 uppercase tracking-wider flex items-center gap-1">
              <Mail className="w-3 h-3 text-[var(--color-text-muted)]" /> E-mail
            </div>
            <input
              type="email"
              value={email}
              placeholder="Não informado"
              onFocus={() => setIsEditingInline(true)}
              onChange={(e) => setEmail(e.target.value)}
              className={isEditingInline ? inputActiveClass : viewCls(email ? "text-[var(--color-primary-blue)] font-semibold" : "text-[var(--color-text-faint)]")}
            />
          </div>
          <div className="p-3">
            <div className="text-[10px] font-bold text-[var(--color-text-faint)] mb-1 uppercase tracking-wider flex items-center gap-1">
              <Phone className="w-3 h-3 text-[var(--color-text-muted)]" /> Telefone / WhatsApp
            </div>
            <input
              type="text"
              value={phone}
              placeholder="Não informado"
              onFocus={() => setIsEditingInline(true)}
              onChange={(e) => setPhone(e.target.value)}
              className={isEditingInline ? inputActiveClass : viewCls(phone ? "text-emerald-600 dark:text-emerald-400 font-semibold font-mono" : "text-[var(--color-text-faint)] font-mono")}
            />
          </div>
        </div>

        <div className="p-3">
          <div className="text-[10px] font-bold text-[var(--color-text-faint)] mb-1 uppercase tracking-wider flex items-center gap-1">
            <FileCheck className="w-3 h-3 text-[var(--color-text-muted)]" /> CNPJ
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              maxLength={18}
              value={cnpj}
              placeholder="00.000.000/0000-00"
              onFocus={() => setIsEditingInline(true)}
              onChange={(e) => {
                setIsEditingInline(true);
                const formatted = formatCNPJ(e.target.value);
                setCnpj(formatted);
                updateLead(lead.id, { cnpj: formatted });
              }}
              className={isEditingInline
                ? "flex-1 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-1.5 text-[var(--color-text-primary)] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all placeholder:text-[var(--color-text-faint)]"
                : `flex-1 ${viewCls(cnpj ? "text-[var(--color-text-primary)] font-mono" : "text-[var(--color-text-faint)]")}`}
            />
            <button
              type="button"
              onClick={onFetchCnpj}
              disabled={cnpjFetching || (cnpj || "").replace(/\D/g, "").length !== 14}
              className="px-2.5 py-1.5 bg-[var(--color-primary-blue)]/10 hover:bg-[var(--color-primary-blue)]/20 border border-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)] rounded-[var(--radius-control)] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-xs flex items-center gap-1 font-bold shrink-0"
              title="Consultar CNPJ na Receita Federal"
            >
              <Search className={`w-3.5 h-3.5 ${cnpjFetching ? "animate-spin" : ""}`} />
              <span>Receita</span>
            </button>
          </div>
        </div>

        <div className="p-3">
          <div
            className="text-[10px] font-bold text-[var(--color-text-faint)] mb-1 uppercase tracking-wider flex items-center gap-1"
            title="Preenchida automaticamente ao consultar o CNPJ na Receita, se ainda vazia."
          >
            <MapPin className="w-3 h-3 text-[var(--color-text-muted)]" /> Cidade
          </div>
          <CityAutocomplete
            value={(customFieldsState.cidade as string) || ""}
            onChange={(v) => setCustomFieldsState((prev) => ({ ...prev, cidade: v }))}
            onFocus={() => setIsEditingInline(true)}
            placeholder="Não informado"
            className={isEditingInline ? inputActiveClass : viewCls(customFieldsState.cidade ? "text-[var(--color-text-primary)] font-semibold" : "text-[var(--color-text-faint)]")}
          />
        </div>

        <div className="p-3">
          <div
            className="text-[10px] font-bold text-[var(--color-text-faint)] mb-1 uppercase tracking-wider flex items-center gap-1"
            title="Preenchido automaticamente ao consultar o CNPJ na Receita (CNAE fiscal), se ainda vazio."
          >
            <Factory className="w-3 h-3 text-[var(--color-text-muted)]" /> Setor de Atuação
          </div>
          <input
            type="text"
            value={(customFieldsState.setor as string) || ""}
            placeholder="Não informado"
            onFocus={() => setIsEditingInline(true)}
            onChange={(e) => setCustomFieldsState((prev) => ({ ...prev, setor: e.target.value }))}
            className={isEditingInline ? inputActiveClass : viewCls(customFieldsState.setor ? "text-[var(--color-text-primary)] font-semibold" : "text-[var(--color-text-faint)]")}
          />
        </div>

        <div className="p-3">
          <div className="text-[10px] font-bold text-[var(--color-text-faint)] mb-1 uppercase tracking-wider flex items-center gap-1">
            <Briefcase className="w-3 h-3 text-[var(--color-text-muted)]" /> Iniciativa / Título
          </div>
          <input
            type="text"
            value={title}
            placeholder="Ex: Aquisição de Licenças"
            onFocus={() => setIsEditingInline(true)}
            onChange={(e) => setTitle(e.target.value)}
            className={isEditingInline ? inputActiveClass : viewCls(title ? "text-[var(--color-text-primary)] font-semibold" : "text-[var(--color-text-faint)]")}
          />
        </div>

        {/* Resumo Comercial — antes eram 3 fatos financeiros (valor da proposta,
            referência de catálogo, MRR) espremidos em texto mono empilhado
            dentro de meia coluna da grade acima; agora um bloco próprio,
            destacado, com o valor principal em destaque e os outros dois como
            badges — mesmos 3 valores já calculados em ProfileSection.tsx, só
            reorganizados visualmente. */}
        <div className="p-3.5 bg-[var(--color-surface-sunken)]/60">
          <div
            className="text-[10px] font-bold text-[var(--color-text-faint)] mb-1.5 uppercase tracking-wider flex items-center gap-1"
            title="Editável só pela proposta vinculada — evita que o valor real do negócio (usado no financeiro) divirja do que foi de fato proposto ao cliente."
          >
            <DollarSign className="w-3 h-3 text-[var(--color-text-muted)]" /> Valor da Proposta
            <Lock className="w-2.5 h-2.5 text-[var(--color-text-faint)]" />
          </div>
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-xl font-display font-black font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
              {displayValue}
            </span>
            {productValue && (
              <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-[var(--color-text-muted)] bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-full pl-2 pr-2.5 py-1">
                <Package className="w-2.5 h-2.5 text-[var(--color-text-faint)]" /> Catálogo: {productValue}
              </span>
            )}
            {leadMRR && (
              <span
                className="flex items-center gap-1 text-[10px] font-mono font-bold text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 rounded-full pl-2 pr-2.5 py-1"
                title="Mesma métrica do Financeiro/Dashboard (MRR de contratos ativos) — calculada a partir das propostas deste lead que já viraram contrato."
              >
                <Repeat className="w-2.5 h-2.5" /> MRR: {leadMRR}/mês
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-[var(--color-border-subtle)]">
          <div className="p-3">
            <div className="text-[10px] font-bold text-[var(--color-text-faint)] mb-1 uppercase tracking-wider flex items-center gap-1">
              <User className="w-3 h-3 text-[var(--color-text-muted)]" /> Vendedor Responsável
            </div>
            <select
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              onFocus={() => setIsEditingInline(true)}
              onClick={() => setIsEditingInline(true)}
              className={isEditingInline
                ? inputActiveClass
                : viewSelectCls(seller ? "text-[var(--color-primary-blue)] font-bold" : "text-[var(--color-text-faint)]")}
            >
              <option value="">Não Atribuído</option>
              {sellerOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="p-3">
            <div className="text-[10px] font-bold text-[var(--color-text-faint)] mb-1 uppercase tracking-wider">Prioridade</div>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              onFocus={() => setIsEditingInline(true)}
              onClick={() => setIsEditingInline(true)}
              className={isEditingInline
                ? inputActiveClass
                : viewSelectCls(`font-bold ${priority === "Alta" ? "text-rose-600 dark:text-rose-400" : priority === "Média" ? "text-amber-600 dark:text-amber-400" : "text-[var(--color-primary-blue)]"}`)}
            >
              <option value="Alta">Alta</option>
              <option value="Média">Média</option>
              <option value="Baixa">Baixa</option>
            </select>
          </div>
        </div>
      </div>

      {customLeadFields.length > 0 && (
        <div className="border-t border-[var(--color-border-subtle)] p-3 space-y-2 bg-[var(--color-surface-sunken)]">
          <div className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)] mb-2">Campos Customizados</div>
          <div className="grid grid-cols-2 gap-2.5">
            {customLeadFields.map((field) => (
              <div key={field.id}>
                <div className="text-[9px] font-bold text-[var(--color-text-faint)] mb-1 uppercase tracking-wider">{field.name}</div>
                <input
                  type={field.type === "Data" ? "date" : field.type === "Número" ? "number" : "text"}
                  value={customFieldsState[field.id] || ""}
                  placeholder="—"
                  onFocus={() => setIsEditingInline(true)}
                  onChange={(e) => setCustomFieldsState((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  className={isEditingInline ? inputActiveClass : viewCls("text-[var(--color-text-primary)] font-semibold")}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
