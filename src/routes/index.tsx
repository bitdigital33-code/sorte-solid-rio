import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Minus, Plus, Sparkles, Trophy, Calendar, ShieldCheck, Ticket } from "lucide-react";
import heroImg from "@/assets/raffle-hero.jpg";
import { formatBRL } from "@/lib/raffle-utils";

export const Route = createFileRoute("/")({
  component: HomePage,
});

interface RaffleConfig {
  id: string;
  nome: string;
  premio: string;
  descricao: string | null;
  imagem_url: string | null;
  total_cotas: number;
  valor_cota_centavos: number;
  data_sorteio: string;
}

interface DrawResult {
  numero_sorteado: number;
  vencedor_nome: string | null;
  video_url: string | null;
  publicado: boolean;
}

function useCountdown(target: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const diff = Math.max(0, new Date(target).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d, h, m, s, ended: diff === 0 };
}

function HomePage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<RaffleConfig | null>(null);
  const [sold, setSold] = useState(0);
  const [draw, setDraw] = useState<DrawResult | null>(null);
  const [qty, setQty] = useState(5);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: cfg } = await supabase.from("raffle_config").select("*").limit(1).single();
      setConfig(cfg as RaffleConfig);
      const { count } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true });
      setSold(count ?? 0);
      const { data: dr } = await supabase
        .from("draw_result")
        .select("numero_sorteado, vencedor_nome, video_url, publicado")
        .eq("publicado", true)
        .maybeSingle();
      if (dr) setDraw(dr as DrawResult);
      setLoading(false);
    })();
  }, []);

  const cd = useCountdown(config?.data_sorteio ?? new Date().toISOString());
  const total = useMemo(() => qty * (config?.valor_cota_centavos ?? 1000), [qty, config]);
  const progress = config ? (sold / config.total_cotas) * 100 : 0;
  const heroSrc = config?.imagem_url || heroImg;

  const startCheckout = () => {
    sessionStorage.setItem("rifa_qty", String(qty));
    navigate({ to: "/checkout" });
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-soft">
      {/* Header */}
      <header className="border-b bg-background/70 backdrop-blur sticky top-0 z-30">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Rifa Solidária</span>
          </Link>
          <div className="flex items-center gap-2">
            {draw && (
              <Link to="/resultado" className="text-sm font-medium text-primary hover:underline">
                Resultado
              </Link>
            )}
            <Link to="/admin" className="text-xs text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-10 lg:py-16">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-gold/20 px-4 py-1.5 text-sm font-medium text-gold-foreground">
              <Trophy className="h-4 w-4" />
              {config?.nome}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              Concorra a{" "}
              <span className="bg-gradient-hero bg-clip-text text-transparent">
                {config?.premio}
              </span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg">
              {config?.descricao ?? "Cada cota custa apenas R$ 10,00. Pague pelo PIX e ajude nossa causa."}
            </p>

            <div className="flex flex-wrap gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" /> Sorteio auditável
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5">
                <Ticket className="h-4 w-4 text-primary" /> Cotas a {formatBRL(config!.valor_cota_centavos)}
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-hero opacity-30 blur-3xl rounded-full" />
            <img
              src={heroSrc}
              alt={config?.premio}
              width={1536}
              height={1024}
              className="relative rounded-3xl shadow-elegant w-full h-auto object-cover aspect-[3/2]"
            />
          </div>
        </div>
      </section>

      {/* Compra de cotas */}
      <section className="container mx-auto px-4 pb-12">
        <Card className="p-6 md:p-10 shadow-card border-2">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold mb-2">Comprar cotas</h2>
              <p className="text-muted-foreground mb-6">
                Escolha quantas cotas você quer. Quanto mais cotas, mais chances!
              </p>

              <div className="flex items-center gap-3 mb-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Diminuir"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="flex-1 text-center">
                  <div className="text-5xl font-bold tabular-nums">{qty}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">cotas</div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQty((q) => q + 1)}
                  aria-label="Aumentar"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                {[1, 5, 10, 25, 50, 100].map((n) => (
                  <Button
                    key={n}
                    variant={qty === n ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setQty(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>

              <div className="rounded-2xl bg-gradient-primary p-6 text-primary-foreground shadow-elegant">
                <div className="text-sm opacity-90">Total a pagar</div>
                <div className="text-4xl font-bold tabular-nums">{formatBRL(total)}</div>
              </div>

              <Button
                onClick={startCheckout}
                size="lg"
                className="w-full mt-4 h-14 text-lg font-semibold"
              >
                Comprar agora →
              </Button>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border bg-card p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Cotas vendidas</span>
                  <span className="text-sm font-bold">
                    {sold} / {config?.total_cotas}
                  </span>
                </div>
                <Progress value={progress} className="h-3" />
                <p className="text-xs text-muted-foreground mt-2">
                  {Math.round(progress)}% do total já vendido
                </p>
              </div>

              <div className="rounded-2xl border bg-card p-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                  <Calendar className="h-4 w-4" />
                  Sorteio em
                </div>
                {cd.ended ? (
                  <div className="text-2xl font-bold">Sorteio realizado</div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { v: cd.d, l: "dias" },
                      { v: cd.h, l: "h" },
                      { v: cd.m, l: "min" },
                      { v: cd.s, l: "s" },
                    ].map((x) => (
                      <div key={x.l} className="rounded-xl bg-secondary py-3">
                        <div className="text-2xl font-bold tabular-nums">
                          {String(x.v).padStart(2, "0")}
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground">{x.l}</div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  {new Date(config!.data_sorteio).toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Resultado */}
      {draw && (
        <section className="container mx-auto px-4 pb-16">
          <Card className="p-6 md:p-10 bg-gradient-hero text-primary-foreground border-0 shadow-elegant">
            <div className="flex items-center gap-2 text-sm opacity-90 mb-2">
              <Trophy className="h-5 w-5" /> Resultado do sorteio
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-2">
              Vencedor: {draw.vencedor_nome ?? "—"}
            </h2>
            <p className="opacity-90 mb-6">Número sorteado: <strong>{draw.numero_sorteado}</strong></p>
            {draw.video_url && (
              <video
                src={draw.video_url}
                controls
                className="w-full rounded-2xl shadow-gold aspect-video bg-black"
              />
            )}
            <div className="mt-4">
              <Link to="/resultado" className="underline font-medium">Ver página do resultado →</Link>
            </div>
          </Card>
        </section>
      )}

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <div className="container mx-auto px-4">
          Rifa Solidária · Pagamento via PIX · Dados protegidos conforme a LGPD
        </div>
      </footer>
    </div>
  );
}
