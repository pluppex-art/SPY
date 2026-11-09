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

// ── Som de venda (estilo caixa registradora): desligado por padrão, ligado por usuário em Configurações › Notificações ──
let saleSoundOn = false;
export const setSaleSoundEnabled = (on: boolean) => { saleSoundOn = on; };
export const isSaleSoundEnabled = () => saleSoundOn;

/** "Cha-ching": um estalo curto de gaveta (ruído filtrado) e dois sinos metálicos. Sintetizado, sem arquivo de áudio. */
export const playSaleSound = () => {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    void ctx.resume?.();
    const now = ctx.currentTime;

    // "cha": estalo curto
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    noise.connect(hp); hp.connect(ng); ng.connect(ctx.destination);
    noise.start(now);

    // "ching": dois sinos com parciais inarmônicas (E6 e depois A6)
    const bell = (freq: number, t0: number, vol: number, dur: number) => {
      [1, 2.76, 5.4].forEach((mult, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq * mult, t0);
        g.gain.setValueAtTime(vol / Math.pow(i + 1, 1.5), t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur / (i + 1));
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + dur / (i + 1) + 0.05);
      });
    };
    bell(1318.5, now + 0.07, 0.16, 0.9);
    bell(1760, now + 0.19, 0.16, 1.3);
    window.setTimeout(() => { void ctx.close?.(); }, 2200);
  } catch (err) {
    console.warn("Não foi possível tocar o som de venda:", err);
  }
};
