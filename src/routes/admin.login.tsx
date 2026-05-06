import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/admin" });
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
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Entrar
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">
            Acesso restrito. Crie sua conta admin pelo painel da Lovable Cloud.
          </p>
        </Card>
      </div>
    </div>
  );
}
