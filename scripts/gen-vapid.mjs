// Gera o par de chaves VAPID do Web Push. Rode UMA vez e guarde a chave privada só nas variáveis de ambiente
// (Vercel), nunca no repositório:  node scripts/gen-vapid.mjs
import webpush from "web-push";
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log("VAPID_PUBLIC_KEY=" + publicKey);
console.log("VAPID_PRIVATE_KEY=" + privateKey);
console.log("VAPID_SUBJECT=mailto:contato@spycrm.com.br   # troque pelo e-mail de contato da empresa");
