import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, Clock, Trophy, Ticket } from "lucide-react";
import { formatBRL } from "@/lib/raffle-utils";
import { api, type DrawResult, type Order } from "@/lib/api";

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

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando…</div>;
  if (!order)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p>Comprovante não encontrado.</p>
        <Link to="/" className="text-primary underline">Voltar</Link>
      </div>
    );

  const won = draw && tickets.includes(draw.numero_sorteado);

  return (
    <div className="min-h-screen bg-gradient-soft">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Início
        </Link>

        <Card className="p-6 md:p-10 shadow-card">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Comprovante</div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">{order.codigo}</h1>
          <p className="text-muted-foreground mb-6">{order.comprador_nome} · {order.cpf_mascarado}</p>

          <div className="grid grid-cols-2 gap-4 mb-6">
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
              <div className="inline-flex items-center gap-2 rounded-full bg-success/15 text-success px-3 py-1.5 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" /> Pagamento confirmado
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full bg-gold/20 text-gold-foreground px-3 py-1.5 text-sm font-medium">
                <Clock className="h-4 w-4" /> {order.status === "aguardando" ? "Aguardando confirmação" : "Pendente"}
              </div>
            )}
          </div>

          {tickets.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
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
              <div className="flex items-center gap-2 font-semibold mb-1">
                <Trophy className="h-5 w-5" /> PARABÉNS, VOCÊ GANHOU!
              </div>
              <p className="text-sm opacity-90">Entraremos em contato pelos dados do cadastro.</p>
            </div>
          )}

          {tickets.length === 0 && order.status !== "confirmado" && (
            <p className="text-sm text-muted-foreground">
              Os números das cotas serão exibidos aqui assim que o pagamento for confirmado.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
