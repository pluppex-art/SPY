import { useState } from "react";
import { GitFork, ExternalLink, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Modal } from "../../../components/ui/modal";
import { supabase } from "../../../lib/supabase";
import { toast } from "sonner";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConnected: (username: string) => void;
  tenantId?: string;
}

export function ConectarGitHubModal({ isOpen, onClose, onConnected, tenantId }: Props) {
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = async () => {
    const token = pat.trim();
    if (!token) { setError("Cole o token primeiro."); return; }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
      });
      if (!res.ok) { setError("Token inválido ou sem permissão. Verifique e tente novamente."); return; }
      const user = await res.json();

      if (supabase) {
        const configValue = { pat: token, username: user.login, avatar: user.avatar_url, connected_at: new Date().toISOString() };
        const { data: existing } = await supabase
          .from("app_settings")
          .select("id")
          .eq("key", "github_config")
          .eq("tenant_id", tenantId)
          .maybeSingle();
        const { error: erroSalvar } = existing?.id
          ? await supabase.from("app_settings").update({ value: configValue, updated_at: new Date().toISOString() }).eq("id", existing.id)
          : await supabase.from("app_settings").insert({ id: crypto.randomUUID(), key: "github_config", tenant_id: tenantId, value: configValue });
        if (erroSalvar) { setError("O token é válido, mas não foi salvo. Só administradores da empresa podem conectar o GitHub."); return; }
      }

      toast.success(`GitHub conectado como @${user.login}`);
      onConnected(user.login);
      onClose();
    } catch {
      setError("Erro de rede ao validar o token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Conectar GitHub"
      description="Personal Access Token com escopo de repositório"
      maxWidth="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button variant="outline" onClick={onClose} className="h-10 px-5 text-xs font-bold uppercase tracking-wider">
            Cancelar
          </Button>
          <Button
            onClick={handleConnect}
            disabled={loading || !pat.trim()}
            className="h-10 px-6 text-xs font-bold uppercase tracking-wider gap-2 shadow-xs"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitFork className="w-3.5 h-3.5" />}
            {loading ? "Validando..." : "Conectar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Steps */}
        <div className="bg-[var(--color-primary-blue)]/5 border border-[var(--color-primary-blue)]/15 rounded-2xl p-4 space-y-2.5">
          <p className="text-[10px] font-bold text-[var(--color-primary-blue)] uppercase tracking-wider">Como criar o token</p>
          <ol className="space-y-2">
            {[
              "Acesse github.com → Settings → Developer Settings",
              'Clique em "Personal access tokens" → "Tokens (classic)"',
              'Clique em "Generate new token (classic)"',
              "Marque o escopo: repo (ou contents para somente leitura)",
              "Copie e cole o token abaixo",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-[var(--color-text-muted)]">
                <span className="w-4 h-4 rounded-full bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)] flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <a
            href="https://github.com/settings/tokens/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--color-primary-blue)] hover:underline transition-colors mt-1"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Abrir GitHub tokens
          </a>
        </div>

        {/* Token input */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Token</label>
          <div className="relative">
            <input
              type={showPat ? "text" : "password"}
              value={pat}
              onChange={e => { setPat(e.target.value); setError(null); }}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-4 py-3 pr-11 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-primary-blue)] font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPat(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer border-none bg-transparent"
            >
              {showPat ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Security note */}
        <div className="flex items-start gap-2 text-[10px] text-[var(--color-text-muted)]">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
          Token salvo com segurança no banco de dados. Acesso restrito ao seu tenant.
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
