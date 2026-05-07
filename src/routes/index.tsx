import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Candy,
  Calendar,
  Flower2,
  Gift,
  GlassWater,
  HeartHandshake,
  Heart,
  Minus,
  Package,
  Plus,
  ScanEye,
  Scissors,
  ShoppingBasket,
  Sparkles,
  SprayCan,
  Ticket,
  Trophy,
  Utensils,
  Watch,
  type LucideIcon,
} from "lucide-react";
import heroImg from "@/assets/raffle-hero.jpg";
import { formatBRL } from "@/lib/raffle-utils";
import { api, type DrawResult, type RaffleConfig } from "@/lib/api";

export const Route = createFileRoute("/")({
  component: HomePage,
});

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

function splitPrizeItems(value: string) {
  return value
    .split(/\n+/)
    .flatMap((line) => line.split(/(?=\p{Extended_Pictographic})/u))
    .map((line) =>
      fixCommonEncodingArtifacts(line)
        .replace(/\p{Extended_Pictographic}/gu, "")
        .replace(/[\uFE0E\uFE0F]/g, "")
        .trim()
        .replace(/^[-*]\s*/, "")
        .replace(/^[\s?¿�•·:;,.]+/, "")
        .replace(/\s{2,}/g, " "),
    )
    .filter((line) => !normalizeText(line).startsWith("a cesta cont"))
    .filter(Boolean);
}

const fallbackPrizeIcons: LucideIcon[] = [Gift, Package, HeartHandshake, ShoppingBasket];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function fixCommonEncodingArtifacts(value: string) {
  return value
    .replace(/cont\?m/gi, "contém")
    .replace(/cora\?\?o/gi, "coração")
    .replace(/pel\?cia/gi, "pelúcia")
    .replace(/lan\?amento/gi, "lançamento")
    .replace(/configura\?\?o/gi, "configuração");
}

function prizeIconFor(item: string, index: number): { Icon: LucideIcon; tone: string } {
  const text = normalizeText(item);
  if (/\b(smartwatch|relogio|watch)\b/.test(text)) return { Icon: Watch, tone: "text-emerald-950" };
  if (/\b(espelho|led)\b/.test(text)) return { Icon: ScanEye, tone: "text-emerald-700" };
  if (/\b(natura|perfume|creme|sabonete|hidratante|cosmetico)\b/.test(text)) return { Icon: SprayCan, tone: "text-teal-700" };
  if (/\b(manicure|unha|alicate|esmalte)\b/.test(text)) return { Icon: Scissors, tone: "text-lime-700" };
  if (/\b(coracao|pelucia|amor)\b/.test(text)) return { Icon: Heart, tone: "text-emerald-600" };
  if (/\b(flor|flores|arranjo|buque)\b/.test(text)) return { Icon: Flower2, tone: "text-green-700" };
  if (/\b(bombom|bombons|chocolate|trufa|doce)\b/.test(text)) return { Icon: Candy, tone: "text-emerald-900" };
  if (/\b(cesta|kit|combo|caixa|sacola)\b/.test(text)) return { Icon: ShoppingBasket, tone: "text-primary" };
  if (/\b(arroz|feijao|acucar|cafe|leite|oleo|farinha|macarrao|carne|frango|alimento|comida|panetone)\b/.test(text)) {
    return { Icon: Utensils, tone: "text-emerald-700" };
  }
  if (/\b(agua|suco|refrigerante|vinho|bebida|cerveja)\b/.test(text)) return { Icon: GlassWater, tone: "text-cyan-700" };
  if (/\b(presente|premio|brinde|vale|pix)\b/.test(text)) return { Icon: Gift, tone: "text-red-600" };
  return { Icon: fallbackPrizeIcons[index % fallbackPrizeIcons.length], tone: "text-amber-700" };
}

function prizeTextFor(item: string) {
  const text = item.trim();
  const patterns: RegExp[] = [
    /^(1\s+smartwatch)\s+(.+)$/i,
    /^(1\s+espelho)\s+(.+)$/i,
    /^(1\s+kit\s+natura)\s+(.+)$/i,
    /^(1\s+kit)\s+(.+)$/i,
    /^(1\s+cora[cç][aã]o)\s+(.+)$/i,
    /^(1\s+arranjo)\s+(.+)$/i,
    /^(1\s+caixa\s+de)\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return { title: match[1], subtitle: match[2] };
  }
  const separator = text.match(/^(.+?)(?:\s+[-–—:|]\s+)(.+)$/);
  if (separator) return { title: separator[1], subtitle: separator[2] };
  return { title: text, subtitle: null };
}

function formatHeroDescription(value?: string | null) {
  const fallback = "Cada cota custa apenas R$ 10,00. Pague pelo PIX e ajude nossa causa.";
  const text = fixCommonEncodingArtifacts(value?.trim() || fallback).replace(/\r/g, "");
  const marker = text.match(/^(.*?)\s*(A cesta cont(?:e|é|\?)m:?)\s*([\s\S]*)$/i);

  if (marker && marker[3]?.trim()) {
    return {
      lead: marker[1].trim(),
      heading: marker[2].replace(/:?$/, ":"),
      items: splitPrizeItems(marker[3]),
    };
  }

  const firstEmoji = text.search(/\p{Extended_Pictographic}/u);
  if (firstEmoji > 0) {
    return {
      lead: text.slice(0, firstEmoji).trim(),
      heading: "Itens inclusos:",
      items: splitPrizeItems(text.slice(firstEmoji)),
    };
  }

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    return {
      lead: lines[0],
      heading: lines.some((line) => normalizeText(line).startsWith("a cesta cont")) ? "A cesta contém:" : "Itens inclusos:",
      items: splitPrizeItems(lines.slice(1).join("\n")),
    };
  }

  return { lead: text, heading: null, items: [] };
}

function HomePage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<RaffleConfig | null>(null);
  const [draw, setDraw] = useState<DrawResult | null>(null);
  const [qty, setQty] = useState(5);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.summary();
        setConfig(data.config);
        setDraw(data.draw);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cd = useCountdown(config?.data_sorteio ?? new Date().toISOString());
  const total = useMemo(() => qty * (config?.valor_cota_centavos ?? 1000), [qty, config]);
  const heroSrc = config?.imagem_url || heroImg;
  const description = useMemo(() => formatHeroDescription(config?.descricao), [config?.descricao]);

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
            <span>Ação entre Amigos</span>
          </Link>
          <div className="flex items-center gap-2">
            {draw && (
              <Link to="/resultado" className="text-sm font-medium text-primary hover:underline">
                Resultado
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-8 lg:pt-8 lg:pb-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(430px,0.9fr)_minmax(560px,1.1fr)] lg:gap-10 xl:gap-12 lg:items-start">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-gold/20 px-4 py-1.5 text-sm font-medium text-gold-foreground">
              <Trophy className="h-4 w-4" />
              {config?.nome}
            </div>
            <h1 className="text-4xl md:text-5xl xl:text-[3.45rem] font-bold tracking-tight leading-[1.05]">
              Concorra a{" "}
              <span className="bg-gradient-hero bg-clip-text text-transparent">
                {config?.premio}
              </span>
            </h1>
            <div className="max-w-xl space-y-3">
              <p className="text-lg leading-relaxed text-muted-foreground">
                {description.lead}
              </p>
              {description.items.length > 0 && (
                <div className="w-full max-w-[500px] rounded-2xl border border-primary/25 bg-[linear-gradient(135deg,oklch(0.995_0.01_145),oklch(0.965_0.035_150))] p-3 shadow-card">
                  <div className="mb-3 inline-flex rounded-t-md rounded-b-lg bg-primary px-4 py-1.5 text-sm font-extrabold uppercase tracking-wide text-primary-foreground shadow-sm">
                    {description.heading ?? "A cesta contém:"}
                  </div>
                  <ul className="grid gap-2.5">
                    {description.items.map((item, index) => {
                      const { Icon, tone } = prizeIconFor(item, index);
                      const label = prizeTextFor(item);
                      return (
                      <li
                        key={item}
                        className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2.5"
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-primary/45 bg-white shadow-sm ring-4 ring-primary/10">
                          <Icon className={`h-6 w-6 ${tone}`} strokeWidth={1.9} />
                        </span>
                        <span className="min-w-0 leading-tight text-emerald-950">
                          <span className="block text-base font-extrabold">{label.title}</span>
                          {label.subtitle && (
                            <span className="mt-0.5 block text-sm font-medium text-emerald-800/80">{label.subtitle}</span>
                          )}
                        </span>
                      </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5">
                <Ticket className="h-4 w-4 text-primary" /> Cotas a {formatBRL(config!.valor_cota_centavos)}
              </span>
            </div>
          </div>

          <div className="relative lg:pt-16 xl:pt-14">
            <div className="absolute -inset-4 bg-gradient-hero opacity-30 blur-3xl rounded-full" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl shadow-elegant lg:aspect-auto lg:h-[430px] xl:h-[460px] 2xl:h-[480px]">
              <img
                src={heroSrc}
                alt={config?.premio}
                width={1536}
                height={1024}
                className="h-full w-full object-cover"
              />
            </div>
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
            <p className="opacity-90 mb-6">Código da cota: <strong>{draw.vencedor_codigo ?? String(draw.numero_sorteado).padStart(4, "0")}</strong></p>
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

      <footer className="border-t border-emerald-100/80 py-10">
        <div className="container mx-auto px-4">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/90 bg-emerald-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-50 shadow-lg shadow-emerald-950/15">
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              Sistema Bitdigital v1.0
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="rounded-full border border-emerald-200/80 bg-white/85 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm backdrop-blur">
                Pagamento via PIX
              </span>
              <span className="rounded-full border border-emerald-200/80 bg-white/85 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm backdrop-blur">
                Controle automático de cotas
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
