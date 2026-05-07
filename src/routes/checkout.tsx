import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  formatBRL,
  isValidCPF,
  maskCPF,
  maskCPFHidden,
  maskPhone,
} from "@/lib/raffle-utils";
import { api, type RaffleConfig } from "@/lib/api";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
});

async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function CheckoutPage() {
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [config, setConfig] = useState<RaffleConfig | null>(null);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = Number(sessionStorage.getItem("rifa_qty") ?? "1");
    setQty(Math.max(1, q));
    api.config().then(setConfig).catch((err) => toast.error(err.message));
  }, []);

  const total = qty * (config?.valor_cota_centavos ?? 1000);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || nome.trim().length < 3) return toast.error("Informe seu nome completo");
    if (!isValidCPF(cpf)) return toast.error("CPF inválido");
    if (tel.replace(/\D/g, "").length < 10) return toast.error("Telefone inválido");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("E-mail inválido");
    if (!config) return;

    setLoading(true);
    try {
      const cpfDigits = cpf.replace(/\D/g, "");
      const cpfHash = await sha256Hex(cpfDigits + ":rifa-solidaria");
      const data = await api.createOrder({
        comprador_nome: nome.trim(),
        cpf_hash: cpfHash,
        cpf_mascarado: maskCPFHidden(cpf),
        telefone: tel,
        email: email.trim().toLowerCase(),
        qtd_cotas: qty,
      });
      sessionStorage.removeItem("rifa_qty");
      navigate({ to: "/pagamento/$orderId", params: { orderId: data.id } });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao criar pedido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-soft">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <h1 className="text-3xl font-bold mb-2">Seus dados para concorrer a cesta</h1>
        <p className="text-muted-foreground mb-8">
          Preencha para gerar seu PIX.
        </p>

        <div className="grid md:grid-cols-[1fr_320px] gap-6">
          <Card className="p-6">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="nome">Nome completo</Label>
                <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cpf">CPF</Label>
                  <Input
                    id="cpf"
                    value={cpf}
                    onChange={(e) => setCpf(maskCPF(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="tel">Telefone</Label>
                  <Input
                    id="tel"
                    value={tel}
                    onChange={(e) => setTel(maskPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    inputMode="tel"
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="email">E-mail opcional</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={255}
                  placeholder="Se quiser, preencha"
                />
                <p className="mt-2 text-xs text-muted-foreground">Se quiser, preencha para receber contato por e-mail.</p>
              </div>

              <Button type="submit" size="lg" className="w-full h-12" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Gerar PIX
              </Button>
            </form>
          </Card>

          <Card className="p-6 h-fit bg-gradient-soft">
            <div className="text-sm font-medium text-muted-foreground mb-3">Resumo do pedido</div>
            <div className="flex justify-between mb-1">
              <span>Cotas</span>
              <span className="font-semibold">{qty}</span>
            </div>
            <div className="flex justify-between mb-1 text-sm text-muted-foreground">
              <span>Valor unitário</span>
              <span>{formatBRL(config?.valor_cota_centavos ?? 1000)}</span>
            </div>
            <div className="border-t my-3" />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{formatBRL(total)}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
