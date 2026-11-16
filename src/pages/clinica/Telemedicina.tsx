import { useState, useEffect } from 'react';
import { 
  Video, Mic, Camera,
  MessageSquare, ShieldCheck,
  Phone, Zap, Settings,
  Activity, ClipboardList,
  Share2, LogIn, ExternalLink, Loader2
} from 'lucide-react';
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { PageContainer } from "../../components/PageContainer";
import { connectGoogleCalendar, consumeGoogleCalendarRedirectResult, getGoogleCalendarStatus } from "../../lib/google-auth";
import { createMeetSpace, MeetSpace } from "../../lib/meet";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { toast } from "sonner";

export default function TelemedicinaDashboard() {
  const { activeTenantId } = useAuth();
  const { appointments, updateAppointment } = useData();
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);

  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState<MeetSpace | null>(null);

  // Fila real: teleconsultas de hoje (tipo "Teleconsulta" no agendamento).
  const today = new Date().toISOString().split("T")[0];
  const activeConferences = appointments.filter(a => a.date === today && a.type === "Teleconsulta");
  const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  const selectedAppt = activeConferences.find(a => a.id === selectedApptId) || activeConferences[0] || null;

  useEffect(() => {
    setNotesDraft(selectedAppt?.notes || "");
  }, [selectedAppt?.id]);

  useEffect(() => {
    if (!activeTenantId) return;
    setGoogleEmail(null);
    getGoogleCalendarStatus(activeTenantId).then((status) => {
      setGoogleEmail(status.connected ? status.email : null);
    });
  }, [activeTenantId]);

  // Depois de voltar do consentimento do Google (redirect real, não popup —
  // ver server/googleCalendar.ts), avisa o usuário e reconfirma o status.
  useEffect(() => {
    const result = consumeGoogleCalendarRedirectResult();
    if (!result || !activeTenantId) return;
    if (result.status === "connected") {
      toast.success("Conectado ao Google Workspace!");
      getGoogleCalendarStatus(activeTenantId).then((status) => setGoogleEmail(status.connected ? status.email : null));
    } else {
      toast.error("Não foi possível conectar ao Google" + (result.reason ? ` (${result.reason})` : "."));
    }
  }, [activeTenantId]);

  const handleGoogleLogin = async () => {
    if (!activeTenantId) return;
    setIsConnecting(true);
    try {
      await connectGoogleCalendar(activeTenantId, window.location.pathname);
      // connectGoogleCalendar navega a página inteira pro Google — o código
      // abaixo só roda se isso falhar antes de redirecionar.
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erro ao conectar ao Google.");
      setIsConnecting(false);
    }
  };

  const handleStartMeeting = async () => {
    if (!activeTenantId || !googleEmail) {
      toast.error("Por favor, conecte sua conta Google primeiro.");
      return;
    }

    setIsCreatingMeeting(true);
    try {
      const space = await createMeetSpace(activeTenantId);
      setActiveMeeting(space);
      toast.success("Nova sala virtual criada no Google Meet!");
      window.open(space.meetingUri, '_blank');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erro ao criar sala virtual.");
    } finally {
      setIsCreatingMeeting(false);
    }
  };

  return (
    <PageContainer 
      title="Telemedicina S.P.Y." 
      description="Consultas virtuais com integração Google Meet e anotações de atendimento."
      actions={
        <div className="flex items-center gap-3 flex-wrap">
          {!googleEmail ? (
            <Button
              onClick={handleGoogleLogin}
              disabled={isConnecting}
              variant="outline"
              className="h-9 px-4 text-xs font-bold gap-1.5"
            >
              {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
              Conectar Google Meet
            </Button>
          ) : (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-[var(--radius-control)] px-3 py-1 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[150px]">{googleEmail}</span>
            </div>
          )}

          <Button
            onClick={handleStartMeeting}
            disabled={!googleEmail || isCreatingMeeting}
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            {isCreatingMeeting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
            Gerar Sala Google Meet
          </Button>
        </div>
      }
    >
      <div className="grid lg:grid-cols-4 gap-6 max-w-[1700px] mx-auto pb-12">
        
        {/* Virtual Room & Controls */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="aspect-video bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] relative overflow-hidden group shadow-sm flex items-center justify-center">
            {activeMeeting ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-[var(--color-surface-elevated)]">
                <div className="p-4 bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)] rounded-2xl mb-4">
                  <Video className="w-10 h-10" />
                </div>
                <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">Sala Google Meet Conectada</h2>
                <p className="text-xs text-[var(--color-text-muted)] font-mono mb-6">
                  Código da sala: <strong>{activeMeeting.meetingCode}</strong>
                </p>
                
                <div className="flex gap-3">
                  <Button 
                    onClick={() => window.open(activeMeeting.meetingUri, '_blank')}
                    className="h-10 px-6 text-xs font-bold gap-2 shadow-xs"
                  >
                    <ExternalLink className="w-4 h-4" /> Abrir no Google Meet
                  </Button>
                  <Button 
                    variant="danger"
                    onClick={() => setActiveMeeting(null)}
                    className="h-10 px-6 text-xs font-bold"
                  >
                    Encerrar Sala
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center p-8">
                <div className="w-20 h-20 rounded-2xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] flex items-center justify-center mx-auto mb-3 text-[var(--color-text-faint)]">
                  <Video className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Aguardando Início da Chamada</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {googleEmail ? "Clique em 'Gerar Sala Google Meet' para iniciar a transmissão" : "Conecte sua conta do Google Workspace"}
                </p>
              </div>
            )}

            {/* In-call controls */}
            <div className="absolute bottom-4 left-1/2 -translate-y-0 -translate-x-1/2 flex items-center gap-2 bg-[var(--color-surface-elevated)]/90 backdrop-blur-md border border-[var(--color-border-default)] p-1.5 rounded-xl shadow-lg">
              <button 
                type="button"
                onClick={() => setIsMicOn(!isMicOn)} 
                className={`p-2.5 rounded-lg border transition-all cursor-pointer ${isMicOn ? 'bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-primary)]' : 'bg-rose-500 text-white border-rose-600'}`}
                title="Microfone"
              >
                <Mic className="w-4 h-4" />
              </button>
              <button 
                type="button"
                onClick={() => setIsCameraOn(!isCameraOn)} 
                className={`p-2.5 rounded-lg border transition-all cursor-pointer ${isCameraOn ? 'bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-primary)]' : 'bg-rose-500 text-white border-rose-600'}`}
                title="Câmera"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button 
                type="button"
                onClick={() => toast.info("Link compartilhado")}
                className="p-2.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] cursor-pointer"
                title="Compartilhar"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
              <h4 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-3 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-[var(--color-primary-blue)]" /> Anotações da Teleconsulta
                {selectedAppt && <span className="font-normal normal-case text-[var(--color-text-muted)]">— {selectedAppt.patient}</span>}
              </h4>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                disabled={!selectedAppt}
                placeholder={selectedAppt ? "Observações do atendimento clínico..." : "Selecione um agendamento na agenda de hoje."}
                className="w-full h-32 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] p-3 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] resize-none disabled:opacity-50"
              />
              <Button
                onClick={() => {
                  if (!selectedAppt) return;
                  updateAppointment(selectedAppt.id, { notes: notesDraft });
                  toast.success("Anotações salvas!");
                }}
                disabled={!selectedAppt}
                className="w-full mt-3 h-9 text-xs font-bold shadow-xs disabled:opacity-50"
              >
                Salvar Anotações
              </Button>
            </Card>

            <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm flex flex-col items-center justify-center text-center gap-2">
              <MessageSquare className="w-6 h-6 text-[var(--color-text-faint)]" />
              <h4 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Chat com o Paciente</h4>
              <p className="text-xs text-[var(--color-text-muted)]">Mensagens durante a chamada ainda não disponíveis — use o chat do próprio Google Meet por enquanto.</p>
            </Card>
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-4">
          <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <h4 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-3">Agenda de Hoje</h4>
            {activeConferences.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">Nenhum agendamento para hoje.</p>
            ) : (
              <div className="space-y-2.5">
                {activeConferences.map((conf) => (
                  <button
                    key={conf.id}
                    onClick={() => setSelectedApptId(conf.id)}
                    className={`w-full text-left p-3 rounded-[var(--radius-control)] border transition-colors ${
                      selectedAppt?.id === conf.id
                        ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40"
                        : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-[var(--color-text-primary)]">{conf.patient}</p>
                      <Badge variant={conf.status === 'Confirmado' ? 'info' : 'secondary'}>{conf.status}</Badge>
                    </div>
                    <p className="text-[10px] text-[var(--color-text-muted)]">{conf.drName} • {conf.time}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <h4 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> Videochamadas via Google Meet
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              As chamadas usam a infraestrutura de segurança do Google Meet (TLS em trânsito). Verifique com sua assessoria jurídica os requisitos específicos de telemedicina (CFM) para o seu tipo de atendimento.
            </p>
          </Card>
        </div>

      </div>
    </PageContainer>
  );
}
