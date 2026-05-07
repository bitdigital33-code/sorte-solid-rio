import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type RaffleConfig } from "@/lib/api";
import { formatBRL, maskPhone } from "@/lib/raffle-utils";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
});

function CheckoutPage() {
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [config, setConfig] = useState<RaffleConfig | null>(null);
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = Number(sessionStorage.getItem("rifa_qty") ?? "1");
    setQty(Math.max(1, q));
    api
      .config()
      .then(setConfig)
      .catch((err) => toast.error(err.message));
  }, []);

  const total = qty * (config?.valor_cota_centavos ?? 1000);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || nome.trim().length < 3) return toast.error("Informe seu nome completo");
    if (tel.replace(/\D/g, "").length < 10) return toast.error("Telefone invalido");
    if (!config) return;

    setLoading(true);
    try {
      const data = await api.createOrder({
        comprador_nome: nome.trim(),
        telefone: tel,
        qtd_cotas: qty,
      });
      sessionStorage.removeItem("rifa_qty");
      navigate({ to: "/pagamento/$orderId", params: { orderId: data.id } });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar pedido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-soft">
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <h1 className="mb-2 text-3xl font-bold">Seus dados para concorrer a cesta</h1>
        <p className="mb-8 text-muted-foreground">Preencha para gerar seu PIX.</p>

        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <Card className="p-6">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="nome">Nome completo</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={120}
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

              <Button type="submit" size="lg" className="h-12 w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar PIX
              </Button>
            </form>
          </Card>

          <Card className="h-fit bg-gradient-soft p-6">
            <div className="mb-3 text-sm font-medium text-muted-foreground">Resumo do pedido</div>
            <div className="mb-1 flex justify-between">
              <span>Cotas</span>
              <span className="font-semibold">{qty}</span>
            </div>
            <div className="mb-1 flex justify-between text-sm text-muted-foreground">
              <span>Valor unitario</span>
              <span>{formatBRL(config?.valor_cota_centavos ?? 1000)}</span>
            </div>
            <div className="my-3 border-t" />
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
