import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, ArrowLeft, Clock } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { formatBRL } from "@/lib/raffle-utils";
import { api, type Order } from "@/lib/api";

export const Route = createFileRoute("/pagamento/$orderId")({
  component: PagamentoPage,
});

function PagamentoPage() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [qrUrl, setQrUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await api.paymentOrder(orderId);
      if (data) {
        setOrder(data);
        if (data.pix_payload) {
          const url = await QRCode.toDataURL(data.pix_payload, { width: 360, margin: 1 });
          setQrUrl(url);
        }
      }
      setLoading(false);
    })();
  }, [orderId]);

  const copy = async () => {
    if (!order?.pix_payload) return;
    await navigator.clipboard.writeText(order.pix_payload);
    setCopied(true);
    toast.success("Código PIX copiado!");
    setTimeout(() => setCopied(false), 2500);
  };

  const markPending = async () => {
    await api.markPending(orderId);
    toast.success("Recebemos! Aguardando confirmação do pagamento.");
    setOrder(order ? { ...order, status: "aguardando" } : order);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando…</div>;
  if (!order)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p>Pedido não encontrado.</p>
        <Link to="/" className="text-primary underline">Voltar</Link>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-soft">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Início
        </Link>

        <Card className="p-6 md:p-10 shadow-elegant">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              Pedido {order.codigo}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mt-3">Pague com PIX</h1>
            <p className="text-muted-foreground mt-1">
              {order.qtd_cotas} cotas · <strong className="text-foreground">{formatBRL(order.valor_total_centavos)}</strong>
            </p>
          </div>

          {qrUrl && (
            <div className="flex justify-center mb-6">
              <div className="rounded-2xl border-4 border-primary/10 p-4 bg-white">
                <img src={qrUrl} alt="QR Code PIX" width={300} height={300} />
              </div>
            </div>
          )}

          <div className="rounded-xl bg-secondary p-3 mb-4">
            <div className="text-xs text-muted-foreground mb-1">PIX Copia e Cola</div>
            <div className="text-xs font-mono break-all text-foreground/80">{order.pix_payload}</div>
          </div>

          <Button onClick={copy} variant="outline" className="w-full mb-3 h-12">
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? "Copiado!" : "Copiar código PIX"}
          </Button>

          {order.status === "pendente" ? (
            <Button onClick={markPending} className="w-full h-12">
              Já paguei
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-gold/15 text-gold-foreground px-4 py-3 text-sm font-medium">
              <Clock className="h-4 w-4" /> Aguardando confirmação do pagamento
            </div>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/comprovante/$token"
              params={{ token: order.share_token }}
              className="text-sm text-primary underline"
            >
              Ver meu comprovante →
            </Link>
          </div>

          <div className="mt-6 text-xs text-muted-foreground text-center space-y-1">
            <p>Após o pagamento, sua compra é confirmada e os códigos das cotas são atribuídos.</p>
            <p>Guarde o link do seu comprovante!</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
