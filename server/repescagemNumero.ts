// Número de WhatsApp da repescagem pela Aurora: uma sessão por empresa, usada só para enviar a chamada.
// Fica SEM webhook, então nada responde a quem escreve para ele; a automação do n8n apenas lê as conversas
// das chamadas para avisar o vendedor. O nome da sessão é calculado aqui, nunca recebido do navegador.
import type { Express, RequestHandler } from "express";
import { numeroDaAurora } from "../src/lib/repescagemAurora.js";
import { getWhatsAppProvider, isWahaConfigured } from "./whatsappProvider.js";

interface Dependencias {
  requireUser: RequestHandler;
  limiter: RequestHandler;
  resolveTenant: (req: any, res: any) => Promise<string | null>;
  ehAdmin: (req: any) => Promise<boolean>;
}

export function registrarRotasRepescagem(app: Express, d: Dependencias) {
  /** Confere acesso e devolve a sessão da empresa, ou null (já respondido). */
  const sessaoDaEmpresa = async (req: any, res: any): Promise<string | null> => {
    if (!(await d.ehAdmin(req))) { res.status(403).json({ error: "Apenas administradores." }); return null; }
    const tenantId = await d.resolveTenant(req, res);
    if (!tenantId) return null;
    if (!isWahaConfigured()) { res.status(503).json({ error: "WhatsApp (WAHA) não está configurado neste ambiente." }); return null; }
    return numeroDaAurora(tenantId);
  };
  /** Estado da sessão; null quando ela ainda não existe no WAHA. */
  const estado = async (sessao: string) => {
    try { return await getWhatsAppProvider().getConnectionState(sessao); }
    catch (err: any) { if (err?.response?.status === 404) return null; throw err; }
  };

  app.get("/api/repescagem/numero", d.requireUser, d.limiter, async (req: any, res) => {
    try {
      const sessao = await sessaoDaEmpresa(req, res);
      if (!sessao) return;
      const e = await estado(sessao);
      res.json(e ? { status: e.status, phone: e.phone || null } : { status: "SEM_NUMERO", phone: null });
    } catch (err: any) {
      console.error("[repescagem/numero]", err?.message);
      res.status(502).json({ error: "Não foi possível consultar o número agora." });
    }
  });

  app.post("/api/repescagem/numero/qr", d.requireUser, d.limiter, async (req: any, res) => {
    try {
      const sessao = await sessaoDaEmpresa(req, res);
      if (!sessao) return;
      const provider = getWhatsAppProvider();
      const e = await estado(sessao);
      if (!e) {
        if (!provider.createSessionWithConfig) return res.status(503).json({ error: "Este ambiente não cria sessões de WhatsApp." });
        await provider.createSessionWithConfig(sessao, {
          webhooks: [],
          ignore: { status: true, groups: true, channels: true, broadcast: true },
          gows: { storage: { messages: true, groups: false, chats: true, labels: false, contacts: true } },
        });
        return res.status(202).json({ status: "CONNECTING", qrcode: "", retry: true });
      }
      if (e.status === "CONNECTED") return res.json({ status: "CONNECTED", qrcode: "" });
      if (e.status === "DISCONNECTED" && provider.restartSession) {
        await provider.restartSession(sessao);
        return res.status(202).json({ status: "CONNECTING", qrcode: "", retry: true });
      }
      res.json(await provider.getQrCode(sessao));
    } catch (err: any) {
      console.error("[repescagem/numero/qr]", err?.message);
      res.status(502).json({ error: "Não foi possível gerar o QR code agora. Tente de novo em alguns segundos." });
    }
  });

  app.delete("/api/repescagem/numero", d.requireUser, d.limiter, async (req: any, res) => {
    try {
      const sessao = await sessaoDaEmpresa(req, res);
      if (!sessao) return;
      if (await estado(sessao)) await getWhatsAppProvider().deleteInstance(sessao);
      res.json({ status: "SEM_NUMERO", phone: null });
    } catch (err: any) {
      console.error("[repescagem/numero/remover]", err?.message);
      res.status(502).json({ error: "Não foi possível desconectar o número agora." });
    }
  });
}
