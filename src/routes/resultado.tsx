import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Trophy, ArrowLeft } from "lucide-react";
import { api, type DrawResult, type RaffleConfig } from "@/lib/api";

export const Route = createFileRoute("/resultado")({
  component: ResultadoPage,
  head: () => ({
    meta: [
      { title: "Resultado do Sorteio · Ação entre Amigos" },
      { name: "description", content: "Confira o vencedor e o vídeo do sorteio." },
    ],
  }),
});

function ResultadoPage() {
  const [draw, setDraw] = useState<DrawResult | null>(null);
  const [config, setConfig] = useState<RaffleConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await api.result();
      setDraw(data.draw);
      setConfig(data.config);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando…</div>;

  return (
    <div className="min-h-screen bg-gradient-soft">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Início
        </Link>

        {!draw ? (
          <Card className="p-10 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">O sorteio ainda não foi realizado</h1>
            <p className="text-muted-foreground">
              Volte na data: {config && new Date(config.data_sorteio).toLocaleString("pt-BR")}
            </p>
          </Card>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-gold/20 text-gold-foreground px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                <Trophy className="h-3 w-3" /> Resultado oficial
              </div>
              <h1 className="text-3xl md:text-5xl font-bold mt-3 bg-gradient-hero bg-clip-text text-transparent">
                {draw.vencedor_nome ?? "Vencedor"}
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                Código da cota: <strong className="text-foreground tabular-nums">{draw.vencedor_codigo ?? String(draw.numero_sorteado).padStart(4, "0")}</strong>
              </p>
            </div>

            {draw.video_url ? (
              <video
                src={draw.video_url}
                controls
                playsInline
                className="w-full rounded-2xl shadow-elegant aspect-video bg-black"
              />
            ) : (
              <Card className="p-10 text-center text-muted-foreground">
                Vídeo do sorteio em breve.
              </Card>
            )}

            <Card className="p-6 mt-6 bg-card">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Registro do sorteio</div>
              <p className="text-sm">
                <strong>Fonte:</strong> {draw.fonte_seed}
              </p>
              <p className="text-sm break-all">
                <strong>Seed:</strong> {draw.seed}
              </p>
              <p className="text-sm">
                <strong>Executado em:</strong> {draw.executado_em && new Date(draw.executado_em).toLocaleString("pt-BR")}
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
