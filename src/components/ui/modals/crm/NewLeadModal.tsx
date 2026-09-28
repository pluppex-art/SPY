import React, { useState, useMemo, useEffect } from "react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";
import { formatPhone, validatePhone, formatCurrencyBR, parseCurrencyBR } from "../../../../lib/utils";
import { ClientSelectorBlock } from "../../new-lead/ClientSelectorBlock";
import { BasicInfoBlock } from "../../new-lead/BasicInfoBlock";
import { CompanyBlock } from "../../new-lead/CompanyBlock";
import { QualificationBlock } from "../../new-lead/QualificationBlock";
import { apiFetch } from "../../../../lib/apiClient";
import { UserPlus } from "lucide-react";
import { friendlyError } from "../../../../lib/friendlyError";

interface NewLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  firstStageId?: string;
  firstComercialStageId?: string;
  firstSdrStageId?: string;
}

type CnpjStatus = { status: "idle" | "checking" | "active" | "inactive" | "invalid"; message?: string };

export function NewLeadModal({ isOpen, onClose, firstStageId = "1", firstComercialStageId, firstSdrStageId }: NewLeadModalProps) {
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const { leads, addLead, customLeadFields, clienteBase, colaboradores } = useData();
  const { user, allTenantModules, tenantIdMap } = useAuth();
  const isMaster = user?.isMaster;

  const [selectedTenant, setSelectedTenant] = useState(user?.tenantName || "");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedClientName, setSelectedClientName] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const [cnpjValue, setCnpjValue] = useState("");
  const [companyValue, setCompanyValue] = useState("");
  const [cidadeValue, setCidadeValue] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [cnpjStatus, setCnpjStatus] = useState<CnpjStatus>({ status: "idle" });

  const [linkedinLink, setLinkedinLink] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [valueEstimate, setValueEstimate] = useState("");

  const isEmailDuplicate = leads.some(l => l.email.toLowerCase() === emailValue.toLowerCase() && emailValue !== "");
  const isCnpjDuplicate = leads.some(l => l.cnpj === cnpjValue && cnpjValue !== "");

  const [selectedSeller, setSelectedSeller] = useState(user?.name || "");

  const sellerOptions = useMemo<string[]>(() => {
    let list: string[] = [];
    if (colaboradores && colaboradores.length > 0) {
      list = colaboradores.filter((c: any) => c.nome && c.status !== "Desligado" && c.departamento === "Vendas").map((c: any) => c.nome as string);
    } else {
      list = Array.from(new Set(leads.map((l: any) => l.seller).filter(Boolean))) as string[];
    }
    if (user?.name && !list.includes(user.name)) {
      list = [user.name, ...list];
    }
    return list;
  }, [colaboradores, leads, user?.name]);

  useEffect(() => {
    if (isOpen) {
      if (user?.name) {
        setSelectedSeller(user.name);
      } else if (!selectedSeller && sellerOptions.length > 0) {
        setSelectedSeller(sellerOptions[0]);
      }
    }
  }, [isOpen, user?.name, sellerOptions]);

  const sellerPipelineId = useMemo(() => {
    if (!selectedSeller || !colaboradores?.length) return "comercial";
    const colab = colaboradores.find((c: any) => c.nome === selectedSeller);
    return colab && (colab.cargo || "").toLowerCase().includes("sdr") ? "sdr" : "comercial";
  }, [selectedSeller, colaboradores]);

  const sellerCargoLabel = useMemo(() => {
    if (!selectedSeller || !colaboradores?.length) return "Comercial";
    const colab = colaboradores.find((c: any) => c.nome === selectedSeller);
    if (!colab) return "Comercial";
    const cargo = (colab.cargo || "").toUpperCase();
    if (cargo.includes("SDR")) return "SDR (pré-venda)";
    if (cargo.includes("CLOSER")) return "Comercial (closer)";
    return `Comercial (${colab.cargo || "vendas"})`;
  }, [selectedSeller, colaboradores]);

  const filteredClients = useMemo(() => {
    if (!clienteBase) return [];
    const q = clientSearch.toLowerCase();
    return clienteBase.filter((c: any) => (c.name || c.nome || "").toLowerCase().includes(q)).slice(0, 30);
  }, [clienteBase, clientSearch]);

  function handleSelectClient(client: any) {
    const name = client.name || client.nome || "";
    setSelectedClientId(client.id);
    setSelectedClientName(name);
    setClientSearch(name);
    setCompanyValue(name);
    if (client.cnpj && !cnpjValue) setCnpjValue(client.cnpj);
    if (client.email && !emailValue) setEmailValue(client.email);
    if (client.phone && !phoneValue) setPhoneValue(formatPhone(client.phone));
    if (client.city && !cidadeValue) setCidadeValue(client.city);
    setShowClientDropdown(false);
  }

  function clearClient() {
    setSelectedClientId(""); setSelectedClientName(""); setClientSearch("");
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => setPhoneValue(formatPhone(e.target.value));

  const handleCnpjChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { formatCNPJ } = await import("../../../../lib/utils");
    const formatted = formatCNPJ(e.target.value);
    setCnpjValue(formatted);
    const clean = formatted.replace(/\D/g, "");
    if (clean.length === 14) {
      setCnpjStatus({ status: "checking" });
      try {
        const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
        if (resp.ok) {
          const result = await resp.json();
          const isActive = result.situacao_cadastral === 2;
          setCnpjStatus({ status: isActive ? "active" : "inactive", message: result.descricao_situacao_cadastral });
          if (result.nome_fantasia || result.razao_social) setCompanyValue(result.nome_fantasia || result.razao_social);
          if (result.email && !emailValue) setEmailValue(result.email.toLowerCase());
          if (result.ddd_telefone_1 && !phoneValue) setPhoneValue(formatPhone(result.ddd_telefone_1.replace(/\D/g, "")));
          if (result.municipio && !cidadeValue) setCidadeValue(result.municipio);
        } else {
          const err = await resp.json().catch(() => ({}));
          setCnpjStatus({ status: "invalid", message: err.message || "CNPJ não encontrado." });
        }
      } catch { setCnpjStatus({ status: "invalid", message: "Falha na conexão de validação." }); }
    } else { setCnpjStatus({ status: "idle" }); }
  };

  const suggestTags = async (e: React.MouseEvent) => {
    e.preventDefault();
    setAiLoading(true);
    const form = document.getElementById("new-lead-form") as HTMLFormElement;
    const formData = new FormData(form);
    try {
      const response = await apiFetch("/api/leads/suggest-tags", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formData.get("name"), company: companyValue, notes: formData.get("notes") }),
      });
      const data = await response.json();
      if (data.tags) setTags(data.tags.join(", "));
    } catch { } finally { setAiLoading(false); }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    for (const field of customLeadFields) {
      if (field.validationRegex) {
        const regex = new RegExp(field.validationRegex);
        if (!regex.test((formData.get(field.name) as string) || "")) {
          import("sonner").then(({ toast }) => toast.error(`Campo ${field.name} inválido`));
          return;
        }
      }
    }
    if (cnpjStatus.status === "invalid") { import("sonner").then(({ toast }) => toast.error(`CNPJ Inválido! (${friendlyError(cnpjStatus)})`)); return; }
    if (!validatePhone(phoneValue)) { import("sonner").then(({ toast }) => toast.error("Telefone inválido!")); return; }
    if (cnpjStatus.status === "inactive") import("sonner").then(({ toast }) => toast.warning(`CNPJ INATIVO: ${cnpjStatus.message}`));

    const { validateCNPJ } = await import("../../../../lib/utils");
    if (cnpjValue && !validateCNPJ(cnpjValue)) { import("sonner").then(({ toast }) => toast.error("Estrutura do CNPJ inválida!")); return; }

    setLoading(true);
    addLead({
      name: formData.get("name") as string,
      company: companyValue || (formData.get("company") as string),
      cnpj: cnpjValue, email: emailValue, phone: phoneValue,
      status: "Novo",
      value: valueEstimate.trim()
        ? formatCurrencyBR(parseCurrencyBR(valueEstimate))
        : "R$ 0",
      date: "Hoje",
      seller: selectedSeller || sellerOptions[0] || "Não Atribuído",
      title: "Novo Negócio", priority: "Média",
      pipelineId: sellerPipelineId,
      stageId: sellerPipelineId === "sdr" ? (firstSdrStageId ?? firstStageId) : (firstComercialStageId ?? firstStageId),
      lead_interesse_cliente: formData.get("lead_interesse_cliente") as string,
      tenantId: tenantIdMap[selectedTenant], tenantName: selectedTenant,
      clientId: selectedClientId || undefined, clientName: selectedClientName || undefined,
      customFields: { linkedinLink, currentRole, teamSize, cidade: cidadeValue || undefined },
    });

    setLoading(false);
    setCnpjValue(""); setCompanyValue(""); setEmailValue(""); setPhoneValue("");
    setCidadeValue("");
    setValueEstimate("");
    setLinkedinLink(""); setCurrentRole(""); setTeamSize("");
    setClientSearch(""); setSelectedClientId(""); setSelectedClientName("");
    setSelectedSeller(user?.name || sellerOptions[0] || "");
    setCnpjStatus({ status: "idle" });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-3xl"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-[var(--color-primary-blue)]" />
          </div>
          <div>
            <h3 className="text-base font-black text-[var(--color-text-primary)]">
              Novo Lead
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              Cadastre um novo lead e direcione para o funil comercial ou de SDR
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button form="new-lead-form" type="submit" loading={loading} className="font-bold px-6">
            Criar Lead
          </Button>
        </div>
      }
    >
      <form id="new-lead-form" onSubmit={handleSubmit} className="space-y-6">
        <ClientSelectorBlock
          clientSearch={clientSearch} setClientSearch={setClientSearch}
          selectedClientId={selectedClientId} selectedClientName={selectedClientName}
          showClientDropdown={showClientDropdown} setShowClientDropdown={setShowClientDropdown}
          filteredClients={filteredClients} handleSelectClient={handleSelectClient}
          clearClient={clearClient} clienteBase={clienteBase}
        />
        <BasicInfoBlock
          emailValue={emailValue} setEmailValue={setEmailValue}
          phoneValue={phoneValue} handlePhoneChange={handlePhoneChange}
          isEmailDuplicate={isEmailDuplicate}
          selectedSeller={selectedSeller} setSelectedSeller={setSelectedSeller}
          sellerOptions={sellerOptions} sellerPipelineId={sellerPipelineId} sellerCargoLabel={sellerCargoLabel}
          valueEstimate={valueEstimate} setValueEstimate={setValueEstimate}
        />
        <CompanyBlock
          cnpjValue={cnpjValue} handleCnpjChange={handleCnpjChange}
          cnpjStatus={cnpjStatus} isCnpjDuplicate={isCnpjDuplicate}
          companyValue={companyValue} setCompanyValue={setCompanyValue}
          cidadeValue={cidadeValue} setCidadeValue={setCidadeValue}
        />
        <QualificationBlock
          teamSize={teamSize} setTeamSize={setTeamSize}
          currentRole={currentRole} setCurrentRole={setCurrentRole}
          linkedinLink={linkedinLink} setLinkedinLink={setLinkedinLink}
          tags={tags} setTags={setTags}
          aiLoading={aiLoading} suggestTags={suggestTags}
          isMaster={!!isMaster} selectedTenant={selectedTenant} setSelectedTenant={setSelectedTenant}
          allTenantModules={allTenantModules}
        />
      </form>
    </Modal>
  );
}
