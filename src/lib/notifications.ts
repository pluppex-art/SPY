export const isPushSupported = (): boolean => {
  return typeof window !== "undefined" && "Notification" in window;
};

export const getPushPermission = (): NotificationPermission => {
  if (!isPushSupported()) return "denied";
  return Notification.permission;
};

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!isPushSupported()) return "denied";
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch (err) {
    console.error("Erro ao solicitar permissão de notificações:", err);
    return "denied";
  }
};

export const sendPushNotification = (title: string, body: string, icon = "/pwa-192.png") => {
  if (isPushSupported() && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        icon,
        badge: icon,
        silent: true, // som é tratado separadamente pelo app
      });
    } catch (e) {
      console.warn("Falha ao disparar Web Notification nativa:", e);
    }
  }
};

export const playNotificationSound = () => {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    // Tom suave duplo característico de alertas premium (Linear/Apple)
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1174.66, now + 0.08); // D6
    gain2.gain.setValueAtTime(0.08, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.4);
  } catch (err) {
    console.warn("Não foi possível tocar som de notificação:", err);
  }
};
