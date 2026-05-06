import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, LogOut, Loader2, Trophy, Upload, Eye, EyeOff, X } from "lucide-react";
import { formatBRL } from "@/lib/raffle-utils";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [config, setConfig] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [draw, setDraw] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let sub: any;
    (async () => {
      const { data: s } = supabase.auth.onAuthStateChange((_e, session) => {
        if (!session) {
          navigate({ to: "/admin/login" });
        }
      });
      sub = s.subscription;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/admin/login" });
        return;
      }
      setUserId(session.user.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      const admin = (roles ?? []).some((r: any) => r.role === "admin");
      setIsAdmin(admin);
      setAuthChecked(true);
      if (admin) await loadAll();
    })();
    return () => sub?.unsubscribe();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: cfg }, { data: ords }, { data: dr }] = await Promise.all([
      supabase.from("raffle_config").select("*").limit(1).single(),
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("draw_result").select("*").maybeSingle(),
    ]);
    setConfig(cfg);
    setOrders(ords ?? []);
    setDraw(dr);
    setLoading(false);
  }

  if (!authChecked) return <div className="min-h-screen flex items-center justify-center">Verificando…</div>;

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-bold">Acesso não autorizado</h1>
        <p className="text-muted-foreground max-w-md">
          Sua conta ({userId?.slice(0, 8)}…) não tem perfil de administrador.
          Adicione esta conta como admin no banco para acessar.
        </p>
        <Button onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/admin/login" }); }}>
          Sair
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="border-b bg-background/70 backdrop-blur sticky top-0 z-30">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link to="/" className="font-bold">Rifa Solidária <span className="text-muted-foreground font-normal">/ Admin</span></Link>
          <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/admin/login" }); }}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {loading ? (
          <div className="text-center py-20"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : (
          <>
            <Stats config={config} orders={orders} />
            <Tabs defaultValue="pedidos">
              <TabsList>
                <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
                <TabsTrigger value="config">Configuração</TabsTrigger>
                <TabsTrigger value="sorteio">Sorteio</TabsTrigger>
              </TabsList>
              <TabsContent value="pedidos" className="mt-6">
                <OrdersTable orders={orders} onChange={loadAll} />
              </TabsContent>
              <TabsContent value="config" className="mt-6">
                <ConfigForm config={config} onSaved={loadAll} />
              </TabsContent>
              <TabsContent value="sorteio" className="mt-6">
                <DrawPanel config={config} orders={orders} draw={draw} onChange={loadAll} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}

function Stats({ config, orders }: any) {
  const confirmed = orders.filter((o: any) => o.status === "confirmado");
  const pending = orders.filter((o: any) => o.status === "pendente" || o.status === "aguardando");
  const totalReceived = confirmed.reduce((s: number, o: any) => s + o.valor_total_centavos, 0);
  const cotasVendidas = confirmed.reduce((s: number, o: any) => s + o.qtd_cotas, 0);

  const cards = [
    { label: "Arrecadado", value: formatBRL(totalReceived), accent: true },
    { label: "Cotas vendidas", value: `${cotasVendidas} / ${config?.total_cotas ?? 0}` },
    { label: "Pedidos confirmados", value: confirmed.length },
    { label: "Pendentes", value: pending.length },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className={`p-5 ${c.accent ? "bg-gradient-primary text-primary-foreground border-0 shadow-elegant" : ""}`}>
          <div className={`text-xs uppercase tracking-wider ${c.accent ? "opacity-80" : "text-muted-foreground"}`}>{c.label}</div>
          <div className="text-2xl md:text-3xl font-bold mt-1 tabular-nums">{c.value}</div>
        </Card>
      ))}
    </div>
  );
}

function OrdersTable({ orders, onChange }: any) {
  const [filter, setFilter] = useState<string>("todos");
  const filtered = useMemo(() => {
    if (filter === "todos") return orders;
    return orders.filter((o: any) => o.status === filter);
  }, [orders, filter]);

  const confirm = async (id: string) => {
    const { error } = await supabase.rpc("confirm_order", { _order_id: id });
    if (error) return toast.error(error.message);
    toast.success("Pedido confirmado e cotas atribuídas");
    onChange();
  };

  const cancel = async (id: string) => {
    const { error } = await supabase.from("orders").update({ status: "cancelado" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Pedido cancelado");
    onChange();
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {["todos", "pendente", "aguardando", "confirmado", "cancelado"].map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "secondary"} onClick={() => setFilter(s)}>
            {s}
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground border-b">
              <th className="py-2 pr-3">Código</th>
              <th className="py-2 pr-3">Comprador</th>
              <th className="py-2 pr-3">Cotas</th>
              <th className="py-2 pr-3">Valor</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Sem pedidos</td></tr>
            )}
            {filtered.map((o: any) => (
              <tr key={o.id} className="border-b last:border-0">
                <td className="py-3 pr-3 font-mono text-xs">{o.codigo}</td>
                <td className="py-3 pr-3">
                  <div className="font-medium">{o.comprador_nome}</div>
                  <div className="text-xs text-muted-foreground">{o.email} · {o.telefone}</div>
                </td>
                <td className="py-3 pr-3 tabular-nums">{o.qtd_cotas}</td>
                <td className="py-3 pr-3 tabular-nums">{formatBRL(o.valor_total_centavos)}</td>
                <td className="py-3 pr-3"><StatusBadge status={o.status} /></td>
                <td className="py-3 pr-3 text-right">
                  {(o.status === "pendente" || o.status === "aguardando") && (
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" onClick={() => confirm(o.id)}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => cancel(o.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmado: "bg-success/15 text-success",
    pendente: "bg-muted text-muted-foreground",
    aguardando: "bg-gold/20 text-gold-foreground",
    cancelado: "bg-destructive/15 text-destructive",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-secondary"}`}>{status}</span>;
}

function ConfigForm({ config, onSaved }: any) {
  const [form, setForm] = useState({ ...config });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("raffle_config")
      .update({
        nome: form.nome,
        premio: form.premio,
        descricao: form.descricao,
        total_cotas: Number(form.total_cotas),
        valor_cota_centavos: Number(form.valor_cota_centavos),
        data_sorteio: form.data_sorteio,
        pix_key: form.pix_key,
        pix_nome: form.pix_nome,
        pix_cidade: form.pix_cidade,
      })
      .eq("id", config.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configuração salva");
    onSaved();
  };

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  return (
    <Card className="p-6 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div><Label>Nome da rifa</Label><Input value={form.nome ?? ""} onChange={set("nome")} /></div>
        <div><Label>Prêmio</Label><Input value={form.premio ?? ""} onChange={set("premio")} /></div>
      </div>
      <div><Label>Descrição</Label><Textarea value={form.descricao ?? ""} onChange={set("descricao")} /></div>
      <div className="grid md:grid-cols-3 gap-4">
        <div><Label>Total de cotas</Label><Input type="number" value={form.total_cotas ?? 0} onChange={set("total_cotas")} /></div>
        <div><Label>Valor da cota (centavos)</Label><Input type="number" value={form.valor_cota_centavos ?? 0} onChange={set("valor_cota_centavos")} /></div>
        <div><Label>Data do sorteio</Label><Input type="datetime-local" value={form.data_sorteio?.slice(0, 16) ?? ""} onChange={set("data_sorteio")} /></div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div><Label>Chave PIX</Label><Input value={form.pix_key ?? ""} onChange={set("pix_key")} /></div>
        <div><Label>Nome (recebedor)</Label><Input value={form.pix_nome ?? ""} onChange={set("pix_nome")} /></div>
        <div><Label>Cidade</Label><Input value={form.pix_cidade ?? ""} onChange={set("pix_cidade")} /></div>
      </div>
      <Button onClick={save} disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Salvar
      </Button>
    </Card>
  );
}

function DrawPanel({ config, orders, draw, onChange }: any) {
  const [seed, setSeed] = useState("");
  const [fonte, setFonte] = useState("Loteria Federal");
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);

  const confirmed = orders.filter((o: any) => o.status === "confirmado");
  const totalSold = confirmed.reduce((s: number, o: any) => s + o.qtd_cotas, 0);
  const canDraw = !draw && totalSold > 0;

  const runDraw = async () => {
    if (!seed.trim()) return toast.error("Informe a seed (ex: número da Loteria Federal)");
    setRunning(true);
    try {
      // Hash seed → integer → mod totalSold
      const buf = new TextEncoder().encode(seed.trim());
      const hash = await crypto.subtle.digest("SHA-256", buf);
      const bytes = new Uint8Array(hash);
      let n = 0n;
      for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(bytes[i]);
      const numero = Number(n % BigInt(totalSold)) + 1;

      const { data: ticket } = await supabase
        .from("tickets")
        .select("numero, order_id, orders ( comprador_nome )")
        .eq("numero", numero)
        .maybeSingle();

      const { error } = await supabase.from("draw_result").insert({
        numero_sorteado: numero,
        seed: seed.trim(),
        fonte_seed: fonte.trim(),
        order_id_vencedor: ticket?.order_id ?? null,
        vencedor_nome: (ticket as any)?.orders?.comprador_nome ?? null,
      });
      if (error) throw error;
      toast.success(`Sorteio realizado! Número ${numero}`);
      onChange();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  const uploadVideo = async (file: File) => {
    if (!draw) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const path = `sorteio-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("raffle-videos").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("raffle-videos").getPublicUrl(path);
      const { error } = await supabase.from("draw_result").update({ video_url: pub.publicUrl }).eq("id", draw.id);
      if (error) throw error;
      toast.success("Vídeo enviado!");
      onChange();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const togglePublish = async () => {
    const { error } = await supabase.from("draw_result").update({ publicado: !draw.publicado }).eq("id", draw.id);
    if (error) return toast.error(error.message);
    toast.success(draw.publicado ? "Resultado oculto" : "Resultado publicado!");
    onChange();
  };

  return (
    <div className="space-y-6">
      {!draw ? (
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-1">Realizar sorteio</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Use uma seed pública e auditável (ex: número/data da Loteria Federal). O sorteio escolhe um número entre as {totalSold} cotas vendidas.
          </p>
          {!canDraw && (
            <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              {totalSold === 0 ? "Nenhuma cota confirmada ainda." : "Sorteio já realizado."}
            </div>
          )}
          {canDraw && (
            <div className="space-y-3">
              <div><Label>Seed (texto público)</Label><Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Ex: LOT-FED-5982-2026-05-10" /></div>
              <div><Label>Fonte da seed</Label><Input value={fonte} onChange={(e) => setFonte(e.target.value)} /></div>
              <Button onClick={runDraw} disabled={running} size="lg">
                {running && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                <Trophy className="h-4 w-4 mr-2" /> Sortear agora
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card className="p-6 bg-gradient-hero text-primary-foreground border-0 shadow-elegant">
            <div className="text-xs uppercase tracking-wider opacity-80">Vencedor</div>
            <h3 className="text-3xl font-bold mt-1">{draw.vencedor_nome ?? "Sem dono identificado"}</h3>
            <p className="opacity-90 mt-1">Número sorteado: <strong>{String(draw.numero_sorteado).padStart(4, "0")}</strong></p>
            <p className="text-xs opacity-80 mt-2">Seed: {draw.seed} ({draw.fonte_seed})</p>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-bold mb-3">Vídeo do sorteio</h3>
            {draw.video_url ? (
              <video src={draw.video_url} controls className="w-full rounded-xl aspect-video bg-black mb-4" />
            ) : (
              <div className="rounded-xl bg-muted aspect-video flex items-center justify-center text-muted-foreground mb-4">
                Nenhum vídeo enviado ainda
              </div>
            )}
            <div className="flex flex-wrap gap-3 items-center">
              <label className="inline-flex">
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])}
                />
                <Button asChild disabled={uploading}>
                  <span className="cursor-pointer">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    {draw.video_url ? "Trocar vídeo" : "Enviar vídeo"}
                  </span>
                </Button>
              </label>
              <Button variant={draw.publicado ? "secondary" : "default"} onClick={togglePublish}>
                {draw.publicado ? <><EyeOff className="h-4 w-4 mr-2" /> Despublicar</> : <><Eye className="h-4 w-4 mr-2" /> Publicar resultado</>}
              </Button>
              {draw.publicado && <Badge className="bg-success/15 text-success border-0">Publicado</Badge>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
