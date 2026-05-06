import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Trophy, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/resultado")({
  component: ResultadoPage,
  head: () => ({
    meta: [
      { title: "Resultado do Sorteio · Rifa Solidária" },
      { name: "description", content: "Confira o vencedor e o vídeo do sorteio." },
    ],
  }),
});

function ResultadoPage() {
  const [draw, setDraw] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: dr }, { data: cfg }] = await Promise.all([
        supabase.from("draw_result").select("*").eq("publicado", true).maybeSingle(),
        supabase.from("raffle_config").select("*").limit(1).single(),
      ]);
      setDraw(dr);
      setConfig(cfg);
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
                Número sorteado: <strong className="text-foreground tabular-nums">{String(draw.numero_sorteado).padStart(4, "0")}</strong>
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
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Auditoria</div>
              <p className="text-sm">
                <strong>Fonte da seed:</strong> {draw.fonte_seed}
              </p>
              <p className="text-sm break-all">
                <strong>Seed:</strong> {draw.seed}
              </p>
              <p className="text-sm">
                <strong>Realizado em:</strong> {new Date(draw.executado_em).toLocaleString("pt-BR")}
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
