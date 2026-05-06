import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, Clock, Trophy, Ticket } from "lucide-react";
import { formatBRL } from "@/lib/raffle-utils";

export const Route = createFileRoute("/comprovante/$token")({
  component: ComprovantePage,
});

function ComprovantePage() {
  const { token } = Route.useParams();
  const [order, setOrder] = useState<any>(null);
  const [tickets, setTickets] = useState<number[]>([]);
  const [draw, setDraw] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, codigo, comprador_nome, cpf_mascarado, qtd_cotas, valor_total_centavos, status, created_at")
        .eq("share_token", token)
        .maybeSingle();
      if (data) {
        setOrder(data);
        const { data: t } = await supabase
          .from("tickets")
          .select("numero")
          .eq("order_id", data.id)
          .order("numero");
        setTickets((t ?? []).map((x: any) => x.numero));
      }
      const { data: dr } = await supabase
        .from("draw_result")
        .select("numero_sorteado, vencedor_nome, publicado")
        .eq("publicado", true)
        .maybeSingle();
      if (dr) setDraw(dr);
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
                <Ticket className="h-4 w-4 text-primary" /> Seus números da sorte
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
                    {String(n).padStart(4, "0")}
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
