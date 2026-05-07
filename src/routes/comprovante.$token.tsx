import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock, Ticket, Trophy } from "lucide-react";

import { Card } from "@/components/ui/card";
import { api, type DrawResult, type Order } from "@/lib/api";
import { formatBRL } from "@/lib/raffle-utils";

export const Route = createFileRoute("/comprovante/$token")({
  component: ComprovantePage,
});

function padCota(numero: number) {
  return String(numero).padStart(4, "0");
}

function ComprovantePage() {
  const { token } = Route.useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [tickets, setTickets] = useState<number[]>([]);
  const [draw, setDraw] = useState<DrawResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await api.receipt(token);
      setOrder(data.order);
      setTickets(data.tickets);
      setDraw(data.draw);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p>Comprovante nao encontrado.</p>
        <Link to="/" className="text-primary underline">
          Voltar
        </Link>
      </div>
    );
  }

  const won = draw && tickets.includes(draw.numero_sorteado);
  const receiptDetails = [order.comprador_nome, order.telefone].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-gradient-soft">
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Inicio
        </Link>

        <Card className="p-6 shadow-card md:p-10">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Comprovante</div>
          <h1 className="mb-1 text-2xl font-bold md:text-3xl">{order.codigo}</h1>
          <p className="mb-6 text-muted-foreground">{receiptDetails || order.comprador_nome}</p>

          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-secondary p-4">
              <div className="text-xs text-muted-foreground">Cotas</div>
              <div className="text-2xl font-bold">{order.qtd_cotas}</div>
            </div>
            <div className="rounded-xl bg-secondary p-4">
              <div className="text-xs text-muted-foreground">Valor</div>
              <div className="text-2xl font-bold">{formatBRL(order.valor_total_centavos)}</div>
            </div>
          </div>

          <div className="mb-6">
            {order.status === "confirmado" ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1.5 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4" /> Pagamento confirmado
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full bg-gold/20 px-3 py-1.5 text-sm font-medium text-gold-foreground">
                <Clock className="h-4 w-4" />{" "}
                {order.status === "aguardando" ? "Aguardando confirmacao" : "Pendente"}
              </div>
            )}
          </div>

          {tickets.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Ticket className="h-4 w-4 text-primary" /> Suas cotas
              </div>
              <div className="flex flex-wrap gap-2">
                {tickets.map((n) => (
                  <span
                    key={n}
                    className={`rounded-lg px-3 py-1.5 text-sm font-bold tabular-nums ${
                      draw?.numero_sorteado === n
                        ? "bg-gradient-gold text-gold-foreground shadow-gold"
                        : "bg-secondary"
                    }`}
                  >
                    {order.codigo}-{padCota(n)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {won && (
            <div className="rounded-2xl bg-gradient-hero p-6 text-primary-foreground">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <Trophy className="h-5 w-5" /> PARABENS, VOCE GANHOU!
              </div>
              <p className="text-sm opacity-90">
                Entraremos em contato pelo telefone informado no pedido.
              </p>
            </div>
          )}

          {tickets.length === 0 && order.status !== "confirmado" && (
            <p className="text-sm text-muted-foreground">
              Os numeros das cotas serao exibidos aqui assim que o pagamento for confirmado.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
