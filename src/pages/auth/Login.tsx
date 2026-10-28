import { LoginForm } from "./components/LoginForm";
import { AuthLayout } from "./components/AuthLayout";
import { useLoginTheme } from "./hooks/useLoginTheme";

export default function Login() {
  const { primaryColor, resolveFromEmail } = useLoginTheme();

  return (
    <AuthLayout primaryColor={primaryColor} title="Bem-vindo de volta" subtitle="Acesse a plataforma com sua conta corporativa.">
      <LoginForm primaryColor={primaryColor} onEmailChange={resolveFromEmail} />
    </AuthLayout>
  );
}
