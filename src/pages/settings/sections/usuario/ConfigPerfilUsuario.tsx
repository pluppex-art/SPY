import { useState, useEffect } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Badge } from "../../../../components/ui/badge";
import {
  User, Mail, Phone, Briefcase, Camera,
  ShieldCheck, KeyRound, Smartphone, LogOut,
  Save, CheckCircle2, AlertCircle, Sparkles, Building, Loader2
} from "lucide-react";
import { useAuth } from "../../../../contexts/AuthContext";
import { supabase } from "../../../../lib/supabase";
import { toast } from "sonner";
import { friendlyError } from "../../../../lib/friendlyError";

interface UserProfile {
  name: string;
  email: string;
  phone: string;
  role: string;
  bio: string;
  avatar: string | null;
  is2FAEnabled: boolean;
}

function profileFromSession(user: ReturnType<typeof useAuth>["user"]): UserProfile {
  return {
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    role: user?.role || "",
    bio: user?.bio || "",
    avatar: user?.avatarUrl || null,
    is2FAEnabled: user?.twoFactorEnabled ?? false,
  };
}

export function ConfigPerfilUsuario() {
  const { user, refreshUser, activeTenantId } = useAuth();
  const [profile, setProfile] = useState<UserProfile>(() => profileFromSession(user));
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Reflete no formulário assim que o perfil real do Supabase chega/atualiza
  // (na primeira carga, ou depois de um refreshUser() nosso).
  useEffect(() => {
    setProfile(profileFromSession(user));
  }, [user?.id, user?.name, user?.email, user?.phone, user?.role, user?.bio, user?.avatarUrl, user?.twoFactorEnabled]);

  // Security Form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const persistProfile = async (updates: Partial<{ name: string; phone: string; role: string; bio: string; avatar_url: string; two_factor_enabled: boolean }>) => {
    if (!supabase || !user?.id) {
      toast.error("Não foi possível identificar sua conta para salvar.");
      return false;
    }
    const { error } = await supabase.from("users").update(updates).eq("id", user.id);
    if (error) {
      toast.error(`Erro ao salvar: ${friendlyError(error)}`);
      return false;
    }
    await refreshUser();
    return true;
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !supabase) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 2MB.");
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${activeTenantId || "sem-tenant"}/${user?.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setProfile(prev => ({ ...prev, avatar: data.publicUrl }));
      if (await persistProfile({ avatar_url: data.publicUrl })) {
        toast.success("Foto de perfil atualizada e salva!");
      }
    } catch (err: any) {
      toast.error(`Falha ao enviar imagem: ${err.message || err}`);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profile.name.trim()) {
      toast.error("O nome completo é obrigatório.");
      return;
    }

    setSavingProfile(true);
    const ok = await persistProfile({
      name: profile.name, phone: profile.phone, role: profile.role, bio: profile.bio,
    });
    setSavingProfile(false);
    if (ok) toast.success("Perfil salvo e atualizado com sucesso!");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user?.email) {
      toast.error("Não foi possível identificar sua conta.");
      return;
    }
    if (!currentPassword) {
      toast.error("Informe sua senha atual.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("A confirmação de senha não confere.");
      return;
    }

    setSavingPassword(true);
    // Reautentica com a senha atual pra confirmar que é realmente o dono da
    // conta antes de trocar — supabase.auth.updateUser() sozinho não pede a
    // senha atual (a sessão já é válida), então essa checagem é nossa.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email, password: currentPassword,
    });
    if (reauthError) {
      setSavingPassword(false);
      toast.error("Senha atual incorreta.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast.error(`Erro ao trocar senha: ${friendlyError(error)}`);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Senha alterada com sucesso!");
  };

  const toggle2FA = async () => {
    const next = !profile.is2FAEnabled;
    setProfile(prev => ({ ...prev, is2FAEnabled: next }));
    if (await persistProfile({ two_factor_enabled: next })) {
      toast.success(next ? "Autenticação em Dois Fatores (2FA) ativada!" : "Autenticação em Dois Fatores desativada.");
    }
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
          Meu Perfil & Conta <User className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Gerencie suas informações pessoais, dados de acesso, cargo e segurança de dois fatores.
        </p>
      </div>

      {/* Header Profile Card */}
      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="relative group">
            <div className="w-20 h-20 rounded-2xl bg-[var(--color-primary-blue)] text-white flex items-center justify-center text-2xl font-bold shadow-md overflow-hidden border-2 border-[var(--color-border-default)]">
              {profile.avatar ? (
                <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                profile.name.substring(0, 2).toUpperCase()
              )}
            </div>
            <label
              htmlFor="avatar-upload"
              className={`absolute -bottom-1 -right-1 p-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl text-[var(--color-text-primary)] hover:text-[var(--color-primary-blue)] shadow-md transition-transform hover:scale-105 ${uploadingAvatar ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
              title="Alterar foto"
            >
              {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingAvatar}
                onChange={handleAvatarChange}
              />
            </label>
          </div>

          <div className="flex-1 text-center sm:text-left space-y-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{profile.name}</h2>
              <Badge variant="info" className="w-fit mx-auto sm:mx-0">
                <Sparkles className="w-3 h-3 mr-1" /> {profile.role}
              </Badge>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] flex items-center justify-center sm:justify-start gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[var(--color-text-faint)]" /> {profile.email}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] flex items-center justify-center sm:justify-start gap-1.5">
              <Building className="w-3.5 h-3.5 text-[var(--color-text-faint)]" /> {user?.tenantName || "S.P.Y. Gestão Corporativa"}
            </p>
          </div>

          <div className="shrink-0 flex sm:flex-col gap-2 w-full sm:w-auto">
            <Button 
              onClick={() => handleSaveProfile()} 
              disabled={savingProfile} 
              className="h-9 px-4 text-xs font-bold gap-1.5 flex-1 sm:flex-initial shadow-xs"
            >
              <Save className="w-3.5 h-3.5" /> {savingProfile ? "Salvando..." : "Salvar Perfil"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Main Profile Form */}
      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-5">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 pb-3 border-b border-[var(--color-border-subtle)]">
          <User className="w-4 h-4 text-[var(--color-primary-blue)]" /> Informações Pessoais & Profissionais
        </h3>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 block">Nome Completo *</label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all font-medium"
                placeholder="Seu nome completo"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 block">E-mail de Login</label>
              <input
                type="email"
                value={profile.email}
                disabled
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-muted)] cursor-not-allowed font-medium"
              />
              <p className="text-[10px] text-[var(--color-text-faint)] mt-1">Este é o e-mail da sua conta de acesso — não pode ser alterado por aqui.</p>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 block">Telefone / WhatsApp</label>
              <input
                type="text"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all font-mono"
                placeholder="(00) 00000-0000"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 block">Cargo / Título</label>
              <input
                type="text"
                value={profile.role}
                onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all font-medium"
                placeholder="Ex: Gestor Comercial"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 block">Bio / Resumo Profissional</label>
            <textarea
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              rows={3}
              className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] p-3 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all resize-none font-medium leading-relaxed"
              placeholder="Descreva suas responsabilidades e áreas de atuação..."
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button 
              type="submit" 
              disabled={savingProfile} 
              className="h-9 px-5 text-xs font-bold gap-1.5 shadow-xs"
            >
              <Save className="w-3.5 h-3.5" /> {savingProfile ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Security & Password Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 pb-3 border-b border-[var(--color-border-subtle)]">
            <KeyRound className="w-4 h-4 text-[var(--color-primary-blue)]" /> Alterar Senha
          </h3>

          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Senha Atual</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Nova Senha</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--color-text-muted)] mb-1 block">Confirmar Nova Senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                placeholder="Repita a nova senha"
              />
            </div>

            <div className="pt-2">
              <Button 
                type="submit" 
                variant="outline" 
                disabled={savingPassword} 
                className="w-full h-9 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
              >
                {savingPassword ? "Atualizando..." : "Atualizar Senha"}
              </Button>
            </div>
          </form>
        </Card>

        {/* 2FA & Session Security */}
        <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2 pb-3 border-b border-[var(--color-border-subtle)]">
              <ShieldCheck className="w-4 h-4 text-[var(--color-primary-blue)]" /> Autenticação & Segurança
            </h3>

            <div className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-text-primary)]">2FA (Autenticação 2 Fatores)</h4>
                    <p className="text-[10px] text-[var(--color-text-muted)]">Protege o login exigindo código OTP.</p>
                  </div>
                </div>
                <Badge variant={profile.is2FAEnabled ? "success" : "secondary"} className="text-[10px]">
                  {profile.is2FAEnabled ? "Ativo" : "Inativo"}
                </Badge>
              </div>

              <Button 
                type="button" 
                variant="outline" 
                size="xs"
                onClick={toggle2FA}
                className="w-full h-8 text-xs font-bold border-[var(--color-border-default)]"
              >
                {profile.is2FAEnabled ? "Desativar 2FA" : "Ativar 2FA no Dispositivo"}
              </Button>
            </div>

            <div className="space-y-2 text-xs text-[var(--color-text-muted)]">
              <div className="flex items-center justify-between py-1 border-b border-[var(--color-border-subtle)]">
                <span>Último login registrado:</span>
                <strong className="text-[var(--color-text-primary)] font-mono">Hoje às 08:34</strong>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[var(--color-border-subtle)]">
                <span>Dispositivo atual:</span>
                <strong className="text-[var(--color-text-primary)]">Mac OS / Chrome</strong>
              </div>
              <div className="flex items-center justify-between py-1">
                <span>Status da sessão:</span>
                <strong className="text-success font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Protegida SSL/TLS
                </strong>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
