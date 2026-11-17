/**
 * Traduz o erro do Supabase Auth ao criar login (admin.createUser) numa mensagem que a pessoa entende.
 * Antes tudo virava "Erro ao criar a conta de acesso." — e quem estava criando o usuário não sabia que o
 * problema era a senha (o Auth recusa senhas vazadas/comuns, como "empresa123", com status 422).
 */
export interface FriendlyAuthError { status: number; code: "senha_fraca" | "email_existente" | "outro"; message: string }

export function friendlyAuthCreateError(err: any): FriendlyAuthError {
  const code = String(err?.code || "");
  const msg = String(err?.message || "");
  if (code === "weak_password" || /weak|easy to guess|pwned|known to be/i.test(msg)) {
    return { status: 422, code: "senha_fraca", message: "O servidor de login recusou essa senha por estar em listas de senhas vazadas. Escolha outra ou deixe o campo em branco para gerar uma senha temporária. (O administrador do sistema pode desligar essa checagem em Supabase → Authentication → Attack Protection → “Prevent use of leaked passwords”.)" };
  }
  if (code === "email_exists" || code === "user_already_exists" || /already (been )?registered|already exists/i.test(msg)) {
    return { status: 409, code: "email_existente", message: "Este e-mail já possui um login no sistema. Use outro e-mail." };
  }
  return { status: 500, code: "outro", message: `Erro ao criar a conta de acesso${msg ? `: ${msg}` : "."}` };
}
