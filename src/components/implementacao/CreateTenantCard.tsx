import { useEffect, useRef, useState } from "react";
import { Building2, CheckCircle2, CircleAlert } from "lucide-react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { NovoTenantModal } from "../../pages/admin/components/NovoTenantModal";
import { tenantReadiness } from "../../lib/implementationTenant";

interface Props {
  implementationId: string;
  data: Record<string, any>;
  /** Grava edições pendentes antes de abrir — o servidor lê a implementação do banco. */
  beforeCreate?: () => Promise<void> | void;
  onCreated: (tenantId: string) => Promise<void> | void;
  /** Já vinculada (acabou de criar): esconde o cartão, mas mantém o modal do acesso aberto até fechar. */
  linked?: boolean;
  /** Muda de valor (ex.: Date.now()) pra abrir o modal sozinho — usado quando a
   * implementação é marcada "Concluída" com os dados mínimos já prontos, pra
   * não depender de alguém lembrar de entrar na aba "Ambiente do cliente" e
   * clicar o botão manualmente. Continua exigindo confirmação humana na tela
   * (o modal abre pedindo pra conferir/gerar a senha) — a senha do admin
   * nunca fica salva em lugar nenhum (ver NovoTenantModal), então criar o
   * ambiente 100% em segundo plano, sem ninguém olhar, deixaria o acesso
   * perdido pra sempre. */
  autoOpenSignal?: number;
}

/**
 * Cria o ambiente (tenant) + o login do administrador do cliente a partir da implementação, já
 * gravando os Dados da Empresa. Só aparece para a equipe interna (master) e o botão só surge com
 * os dados mínimos completos; enquanto faltar algo, mostra exatamente o que falta.
 */
export function CreateTenantCard({ implementationId, data, beforeCreate, onCreated, linked, autoOpenSignal }: Props) {
  const [open, setOpen] = useState(false);
  const { ready, missing } = tenantReadiness(data);
  const lastAutoOpenSignal = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!autoOpenSignal || autoOpenSignal === lastAutoOpenSignal.current || !ready || linked) return;
    lastAutoOpenSignal.current = autoOpenSignal;
    (async () => { await beforeCreate?.(); setOpen(true); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenSignal, ready, linked]);

  if (linked && !open) return null;

  return (
    <>
    {!linked && (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <Building2 className="w-4 h-4 mt-0.5 text-[var(--color-text-faint)] shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Criar ambiente e acesso do cliente</h3>
          {ready ? (
            <>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                Dados completos. Cria o tenant, o login do administrador (e-mail e senha) e já preenche Configurações › Dados da Empresa.
              </p>
              <Button
                size="sm"
                onClick={async () => { await beforeCreate?.(); setOpen(true); }}
                className="h-8 px-3 text-xs font-medium gap-1.5"
              >
                <Building2 className="w-3 h-3" /> Criar ambiente do cliente
              </Button>
            </>
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 flex items-start gap-1.5">
              <CircleAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-px" />
              <span>O botão aparece quando os dados da empresa estiverem completos. Faltam: <strong>{missing.join(", ")}</strong>.</span>
            </p>
          )}
        </div>
      </div>

    </Card>
    )}
      <NovoTenantModal
        isOpen={open}
        onClose={() => setOpen(false)}
        implementation={{ id: implementationId, name: String(data?.nome_fantasia || "").trim(), adminEmail: String(data?.resp_email || "").trim().toLowerCase() }}
        onCreated={(r) => { if (r?.tenantId) onCreated(r.tenantId); }}
      />
    </>
  );
}
