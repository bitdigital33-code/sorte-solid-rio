import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, ArrowLeft, Loader2, KeyRound } from "lucide-react";
import { adminApi } from "@/lib/api";

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setLoading(true);
    try {
      await adminApi.login(email, password);
      navigate({ to: "/admin" });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const email = String(form.get("reset_email") ?? "");
    const recoveryKey = String(form.get("recovery_key") ?? "");
    const newPassword = String(form.get("new_password") ?? "");
    const confirmPassword = String(form.get("confirm_password") ?? "");
    setResetLoading(true);
    try {
      await adminApi.resetPassword({
        email,
        recovery_key: recoveryKey,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      toast.success("Senha redefinida. Entre com a nova senha.");
      setShowReset(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-soft flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Início
        </Link>
        <Card className="p-8 shadow-elegant">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/10 p-3"><Lock className="h-6 w-6 text-primary" /></div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-1">Painel Admin</h1>
          <p className="text-sm text-muted-foreground text-center mb-6">Acesse com sua conta de administrador</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Entrar
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">
            Acesso restrito ao administrador da rifa.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="mt-3 w-full"
            onClick={() => setShowReset((value) => !value)}
          >
            <KeyRound className="h-4 w-4 mr-2" />
            Redefinir senha
          </Button>
        </Card>
        {showReset && (
          <Card className="mt-4 p-6 shadow-card">
            <div className="mb-4">
              <h2 className="text-lg font-bold">Recuperar acesso</h2>
              <p className="text-sm text-muted-foreground">
                Use o e-mail do administrador e a chave de recuperacao.
              </p>
            </div>
            <form onSubmit={resetPassword} className="space-y-4">
              <div>
                <Label htmlFor="reset_email">E-mail admin</Label>
                <Input id="reset_email" name="reset_email" type="email" autoComplete="username" required />
              </div>
              <div>
                <Label htmlFor="recovery_key">Chave de recuperacao</Label>
                <Input id="recovery_key" name="recovery_key" type="password" autoComplete="off" required />
              </div>
              <div>
                <Label htmlFor="new_password">Nova senha</Label>
                <Input id="new_password" name="new_password" type="password" autoComplete="new-password" required />
              </div>
              <div>
                <Label htmlFor="confirm_password">Confirmar nova senha</Label>
                <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required />
              </div>
              <Button type="submit" className="w-full" disabled={resetLoading}>
                {resetLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar nova senha
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
