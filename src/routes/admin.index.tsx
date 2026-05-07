import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Dices,
  Eye,
  EyeOff,
  ImagePlus,
  KeyRound,
  Loader2,
  LogOut,
  MessageCircle,
  Rocket,
  RotateCcw,
  Search,
  ShieldAlert,
  Shuffle,
  TicketCheck,
  Trophy,
  Upload,
  UserCog,
  X,
} from "lucide-react";
import { formatBRL } from "@/lib/raffle-utils";
import { adminApi, type TicketCandidate } from "@/lib/api";

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
    (async () => {
      try {
        if (!adminApi.getToken()) {
          navigate({ to: "/admin/login" });
          return;
        }
        const session = await adminApi.me();
        setUserId(session.email);
        setIsAdmin(true);
        setAuthChecked(true);
        await loadAll();
      } catch {
        adminApi.logout();
        navigate({ to: "/admin/login" });
      }
    })();
  }, []);

  async function loadAll() {
    setLoading(true);
    const data = await adminApi.dashboard();
    setConfig(data.config);
    setOrders(data.orders ?? []);
    setDraw(data.draw);
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
        <Button onClick={() => { adminApi.logout(); navigate({ to: "/admin/login" }); }}>
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
          <Button variant="ghost" size="sm" onClick={() => { adminApi.logout(); navigate({ to: "/admin/login" }); }}>
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
                <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
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
              <TabsContent value="usuarios" className="mt-6">
                <UserControl email={userId} onUpdated={setUserId} />
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

const SECRET_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%";

function generateSecret(length = 18) {
  const values = new Uint32Array(length);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => SECRET_CHARS[value % SECRET_CHARS.length]).join("");
}

function UserControl({ email, onUpdated }: { email: string | null; onUpdated: (email: string) => void }) {
  const [currentEmail, setCurrentEmail] = useState(email ?? "");
  const [recoveryConfigured, setRecoveryConfigured] = useState(false);
  const [form, setForm] = useState({
    email: email ?? "",
    current_password: "",
    new_password: "",
    confirm_password: "",
    recovery_key: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const credentials = await adminApi.credentials();
        setCurrentEmail(credentials.email);
        setRecoveryConfigured(credentials.recovery_configured);
        setForm((value) => ({ ...value, email: credentials.email }));
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((value) => ({ ...value, [field]: event.target.value }));
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiada`);
    } catch {
      toast.success(`${label} gerada`);
    }
  };

  const generatePassword = async () => {
    const password = generateSecret(18);
    setForm((value) => ({ ...value, new_password: password, confirm_password: password }));
    await copyValue(password, "Senha");
  };

  const generateRecoveryKey = async () => {
    const key = generateSecret(24);
    setForm((value) => ({ ...value, recovery_key: key }));
    await copyValue(key, "Chave de recuperacao");
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.current_password) return toast.error("Digite a senha atual");
    if (form.new_password && form.new_password !== form.confirm_password) return toast.error("As senhas nao conferem");
    setSaving(true);
    try {
      const updated = await adminApi.updateCredentials({
        current_password: form.current_password,
        email: form.email,
        new_password: form.new_password || undefined,
        confirm_password: form.confirm_password || undefined,
        recovery_key: form.recovery_key || undefined,
      });
      setCurrentEmail(updated.email);
      setRecoveryConfigured(updated.recovery_configured);
      setForm({
        email: updated.email,
        current_password: "",
        new_password: "",
        confirm_password: "",
        recovery_key: "",
      });
      onUpdated(updated.email);
      toast.success("Usuario atualizado");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Card className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></Card>;
  }

  return (
    <Card className="p-6 shadow-card">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserCog className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Controle de usuario</h3>
            <p className="text-sm text-muted-foreground">Conta atual: {currentEmail}</p>
          </div>
        </div>
        <Badge variant={recoveryConfigured ? "secondary" : "destructive"}>
          {recoveryConfigured ? "Recuperacao ativa" : "Sem chave de recuperacao"}
        </Badge>
      </div>

      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="admin-email">E-mail admin</Label>
            <Input id="admin-email" type="email" value={form.email} onChange={set("email")} required />
          </div>
          <div>
            <Label htmlFor="current-password">Senha atual</Label>
            <Input id="current-password" type="password" value={form.current_password} onChange={set("current_password")} autoComplete="current-password" required />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label htmlFor="new-password">Nova senha</Label>
            <Input id="new-password" type="password" value={form.new_password} onChange={set("new_password")} autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="confirm-new-password">Confirmar senha</Label>
            <Input id="confirm-new-password" type="password" value={form.confirm_password} onChange={set("confirm_password")} autoComplete="new-password" />
          </div>
          <Button type="button" variant="secondary" className="self-end" onClick={generatePassword}>
            <KeyRound className="h-4 w-4 mr-2" /> Gerar
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="recovery-key">Nova chave de recuperacao</Label>
            <Input id="recovery-key" type="password" value={form.recovery_key} onChange={set("recovery_key")} autoComplete="off" />
          </div>
          <Button type="button" variant="secondary" className="self-end" onClick={generateRecoveryKey}>
            <KeyRound className="h-4 w-4 mr-2" /> Gerar chave
          </Button>
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserCog className="h-4 w-4 mr-2" />}
          Salvar usuario
        </Button>
      </form>
    </Card>
  );
}

function OrdersTable({ orders, onChange }: any) {
  const [filter, setFilter] = useState<string>("todos");
  const filtered = useMemo(() => {
    if (filter === "todos") return orders;
    return orders.filter((o: any) => o.status === filter);
  }, [orders, filter]);

  const confirm = async (id: string) => {
    try {
      const result = await adminApi.confirmOrder(id);
      toast.success("Pedido confirmado e cotas atribuídas");
      if (!result.email_enviado) {
        toast.error("O servidor confirmou o pedido, mas nao conseguiu enviar o e-mail.");
      }
      onChange();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const cancel = async (id: string) => {
    try {
      await adminApi.cancelOrder(id);
      toast.success("Pedido cancelado");
      onChange();
    } catch (err: any) {
      toast.error(err.message);
    }
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
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    setForm({ ...config });
  }, [config]);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateConfig({
        nome: form.nome,
        premio: form.premio,
        descricao: form.descricao,
        total_cotas: Number(form.total_cotas),
        valor_cota_centavos: Number(form.valor_cota_centavos),
        data_sorteio: form.data_sorteio,
        imagem_url: form.imagem_url,
        pix_key: form.pix_key,
        pix_nome: form.pix_nome,
        pix_cidade: form.pix_cidade,
      });
      toast.success("Configuração salva");
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadPrizeImage = async (file: File) => {
    setUploadingImage(true);
    try {
      const updated = await adminApi.uploadPrizeImage(file);
      setForm({ ...updated });
      toast.success("Foto do prêmio enviada");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
    <Card className="p-6 space-y-4">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] gap-5 items-start">
        <div className="space-y-3">
          <div>
            <Label>Foto do prêmio na página inicial</Label>
            <Input
              value={form.imagem_url ?? ""}
              onChange={set("imagem_url")}
              placeholder="/uploads/raffle-images/premio.jpg"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingImage}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadPrizeImage(file);
                }}
              />
              <Button asChild disabled={uploadingImage}>
                <span className="cursor-pointer">
                  {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ImagePlus className="h-4 w-4 mr-2" />}
                  {form.imagem_url ? "Trocar foto" : "Enviar foto"}
                </span>
              </Button>
            </label>
            {form.imagem_url && (
              <Button type="button" variant="ghost" onClick={() => setForm({ ...form, imagem_url: "" })}>
                <X className="h-4 w-4 mr-2" /> Remover
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border bg-muted aspect-[3/2]">
          {form.imagem_url ? (
            <img src={form.imagem_url} alt={form.premio ?? "Prêmio"} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Imagem do prêmio
            </div>
          )}
        </div>
      </div>
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
    <LaunchResetPanel onReset={onSaved} />
    </>
  );
}

function normalizeLaunchPhrase(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function LaunchResetPanel({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [resetting, setResetting] = useState(false);
  const canReset = normalizeLaunchPhrase(phrase) === "LANCAR";

  const prepareLaunch = async () => {
    if (!canReset) return;
    setResetting(true);
    try {
      const result = await adminApi.resetRaffle(phrase);
      toast.success(
        `Rifa pronta: ${result.removidos.pedidos} pedidos, ${result.removidos.cotas} cotas e ${result.removidos.resultados} resultado(s) removidos.`,
      );
      setOpen(false);
      setPhrase("");
      onReset();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-background to-primary/10 p-0 shadow-card">
      <div className="grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30">
            <Rocket className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-primary">Preparar lançamento</div>
            <h3 className="mt-1 text-xl font-bold">Zerar testes e abrir para divulgação</h3>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary" className="border-0 bg-success/15 text-success">Mantém prêmio e PIX</Badge>
              <Badge variant="secondary" className="border-0 bg-success/15 text-success">Mantém foto da rifa</Badge>
              <Badge variant="secondary" className="border-0 bg-destructive/10 text-destructive">Limpa pedidos, cotas e sorteio</Badge>
            </div>
          </div>
        </div>
        <Button type="button" variant="outline" className="border-primary/30 bg-background" onClick={() => setOpen(true)}>
          <RotateCcw className="h-4 w-4 mr-2" /> Preparar agora
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <AlertDialogTitle>Confirmar preparação da rifa</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação apaga pedidos, cotas atribuídas e resultado de sorteio. A configuração, imagem do prêmio, dados PIX e uploads permanecem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="launch-confirm">Digite LANÇAR</Label>
            <Input
              id="launch-confirm"
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              autoComplete="off"
              placeholder="LANÇAR"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={!canReset || resetting} onClick={prepareLaunch}>
              {resetting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Zerar e preparar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function padCota(numero: number) {
  return String(numero).padStart(4, "0");
}

function cotaCode(orderCode: string, numero: number) {
  return `${orderCode}-${padCota(numero)}`;
}

function phoneToWhatsapp(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function DrawPanel({ config, orders, draw, onChange }: any) {
  const [mode, setMode] = useState<"cesta_digital" | "papel_fisico">("cesta_digital");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TicketCandidate[]>([]);
  const [selected, setSelected] = useState<TicketCandidate | null>(null);
  const [searching, setSearching] = useState(false);
  const [rollingName, setRollingName] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);

  const confirmed = orders.filter((o: any) => o.status === "confirmado");
  const totalSold = confirmed.reduce((s: number, o: any) => s + o.qtd_cotas, 0);
  const drawPool = useMemo<TicketCandidate[]>(
    () =>
      confirmed.flatMap((order: any) =>
        (order.tickets ?? []).map((numero: number) => ({
          numero,
          codigo_cota: cotaCode(order.codigo, numero),
          order_id: order.id,
          order_codigo: order.codigo,
          comprador_nome: order.comprador_nome,
          telefone: order.telefone ?? "",
          email: order.email ?? "",
          qtd_cotas: order.qtd_cotas,
        })),
      ),
    [confirmed],
  );
  const canDraw = !draw && totalSold > 0;

  const searchTickets = async () => {
    if (!query.trim()) {
      setResults([]);
      setSelected(null);
      return toast.error("Digite um nome, pedido ou código de cota");
    }
    setSearching(true);
    try {
      const found = await adminApi.searchTickets(query.trim());
      setResults(found);
      setSelected(found[0] ?? null);
      if (found.length === 0) toast.error("Nenhuma cota confirmada encontrada");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSearching(false);
    }
  };

  const runDigitalDraw = async () => {
    setRunning(true);
    let timer: ReturnType<typeof setInterval> | undefined;
    if (drawPool.length > 0) {
      timer = setInterval(() => {
        const item = drawPool[Math.floor(Math.random() * drawPool.length)];
        setRollingName(`${item.comprador_nome} · ${item.codigo_cota}`);
      }, 85);
    }
    try {
      const created = await adminApi.createDraw({ modo: "cesta_digital" });
      if (timer) clearInterval(timer);
      setRollingName(`${created.vencedor_nome ?? "Vencedor"} · ${created.vencedor_codigo ?? padCota(created.numero_sorteado)}`);
      toast.success(`Sorteio realizado: ${created.vencedor_nome ?? "vencedor identificado"}`);
      window.setTimeout(() => {
        setRollingName(null);
        onChange();
      }, 700);
    } catch (e: any) {
      if (timer) clearInterval(timer);
      toast.error(e.message);
      setRollingName(null);
    } finally {
      setRunning(false);
    }
  };

  const runPaperDraw = async () => {
    if (!selected) return toast.error("Selecione a cota retirada da cesta");
    setRunning(true);
    try {
      const created = await adminApi.createDraw({ modo: "papel_fisico", ticket_numero: selected.numero });
      toast.success(`Vencedor registrado: ${created.vencedor_nome ?? selected.comprador_nome}`);
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
      await adminApi.uploadVideo(draw.id, file);
      toast.success("Vídeo enviado!");
      onChange();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const togglePublish = async () => {
    try {
      await adminApi.togglePublish(draw.id, !draw.publicado);
      toast.success(draw.publicado ? "Resultado oculto" : "Resultado publicado!");
      onChange();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const winnerCode = draw?.vencedor_codigo ?? (draw ? padCota(draw.numero_sorteado) : "");
  const winnerWhatsapp = phoneToWhatsapp(draw?.vencedor_telefone);
  const winnerMessage = draw
    ? `Parabéns, ${draw.vencedor_nome}! Você ganhou a ${config?.nome ?? "rifa solidária"}. Código da cota: ${winnerCode}. Em breve entraremos em contato com os detalhes do prêmio.`
    : "";

  return (
    <div className="space-y-6">
      {!draw ? (
        <Card className="p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold mb-1">Realizar sorteio</h3>
              <p className="text-sm text-muted-foreground">
                Cada cota confirmada entra como um papel nominal. Total no painel: {totalSold}.
              </p>
            </div>
            <Badge variant="secondary" className="gap-1.5">
              <TicketCheck className="h-3.5 w-3.5" /> {drawPool.length} papéis
            </Badge>
          </div>
          {!canDraw && (
            <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              {totalSold === 0 ? "Nenhuma cota confirmada ainda." : "Sorteio já realizado."}
            </div>
          )}
          {canDraw && (
            <Tabs value={mode} onValueChange={(value) => setMode(value as "cesta_digital" | "papel_fisico")}>
              <TabsList className="grid h-auto w-full grid-cols-2 md:w-fit">
                <TabsTrigger value="cesta_digital" className="gap-2">
                  <Dices className="h-4 w-4" /> Cesta digital
                </TabsTrigger>
                <TabsTrigger value="papel_fisico" className="gap-2">
                  <ClipboardCheck className="h-4 w-4" /> Conferir papel
                </TabsTrigger>
              </TabsList>

              <TabsContent value="cesta_digital" className="mt-5 space-y-4">
                <div className="rounded-xl border bg-background p-4">
                  <div className="flex min-h-[76px] items-center justify-center rounded-lg bg-secondary px-4 text-center">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Cesta nominal</div>
                      <div className="mt-1 text-xl font-bold">
                        {rollingName ?? "Pronto para sortear por nome e código"}
                      </div>
                    </div>
                  </div>
                </div>
                <Button onClick={runDigitalDraw} disabled={running} size="lg">
                  {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shuffle className="h-4 w-4 mr-2" />}
                  Rodar cesta digital
                </Button>
              </TabsContent>

              <TabsContent value="papel_fisico" className="mt-5 space-y-4">
                <form
                  className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void searchTickets();
                  }}
                >
                  <div>
                    <Label>Nome, pedido ou código da cota</Label>
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Ex: Maria, RIFA-ABCD12 ou RIFA-ABCD12-0007"
                    />
                  </div>
                  <Button type="submit" className="self-end" disabled={searching}>
                    {searching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                    Buscar
                  </Button>
                </form>

                {results.length > 0 && (
                  <div className="grid gap-2">
                    {results.map((item) => (
                      <button
                        key={item.codigo_cota}
                        type="button"
                        onClick={() => setSelected(item)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          selected?.codigo_cota === item.codigo_cota ? "border-primary bg-primary/5" : "bg-background hover:bg-secondary"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">{item.comprador_nome}</span>
                          <span className="font-mono text-xs text-muted-foreground">{item.codigo_cota}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Pedido {item.order_codigo} · {item.telefone}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <Button onClick={runPaperDraw} disabled={running || !selected} size="lg">
                  {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trophy className="h-4 w-4 mr-2" />}
                  Registrar vencedor
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </Card>
      ) : (
        <>
          <Card className="p-6 bg-gradient-hero text-primary-foreground border-0 shadow-elegant">
            <div className="text-xs uppercase tracking-wider opacity-80">Vencedor</div>
            <h3 className="text-3xl font-bold mt-1">{draw.vencedor_nome ?? "Sem dono identificado"}</h3>
            <p className="opacity-90 mt-1">Código da cota: <strong>{winnerCode}</strong></p>
            <p className="text-xs opacity-80 mt-2">Registro: {draw.seed} ({draw.fonte_seed})</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(winnerCode);
                  toast.success("Código copiado");
                }}
              >
                <Copy className="h-4 w-4 mr-2" /> Copiar código
              </Button>
              {winnerWhatsapp && (
                <Button asChild type="button" variant="secondary">
                  <a
                    href={`https://wa.me/${winnerWhatsapp}?text=${encodeURIComponent(winnerMessage)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" /> Avisar ganhador
                  </a>
                </Button>
              )}
            </div>
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
