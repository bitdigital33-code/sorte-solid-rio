export interface RaffleConfig {
  id: string;
  nome: string;
  premio: string;
  descricao: string | null;
  imagem_url: string | null;
  total_cotas: number;
  valor_cota_centavos: number;
  data_sorteio: string;
  pix_key?: string | null;
  pix_nome?: string | null;
  pix_cidade?: string | null;
  status?: string;
}

export interface DrawResult {
  id?: string;
  numero_sorteado: number;
  seed?: string;
  fonte_seed?: string;
  order_id_vencedor?: string | null;
  vencedor_nome: string | null;
  vencedor_codigo?: string | null;
  vencedor_pedido?: string | null;
  vencedor_telefone?: string | null;
  vencedor_email?: string | null;
  video_url?: string | null;
  publicado: boolean;
  executado_em?: string;
}

export interface Order {
  id: string;
  codigo: string;
  comprador_nome: string;
  cpf_mascarado?: string;
  telefone?: string;
  email?: string;
  qtd_cotas: number;
  valor_total_centavos: number;
  status: string;
  pix_payload?: string | null;
  share_token?: string;
  created_at?: string;
  tickets?: number[];
}

export interface TicketCandidate {
  numero: number;
  codigo_cota: string;
  order_id: string;
  order_codigo: string;
  comprador_nome: string;
  telefone: string;
  email: string;
  qtd_cotas: number;
}

export interface AdminCredentials {
  email: string;
  recovery_configured: boolean;
  token?: string;
}

const TOKEN_KEY = "rifa_admin_token";

const ENCODING_REPAIRS: Array<[RegExp, string]> = [
  [/A\?\?o/gi, "Ação"],
  [/cont\?m/gi, "contém"],
  [/cora\?\?o/gi, "coração"],
  [/pel\?cia/gi, "pelúcia"],
  [/lan\?amento/gi, "lançamento"],
  [/configura\?\?o/gi, "configuração"],
];

function repairEncodingArtifacts(value: string) {
  let repaired = value;
  for (const [pattern, replacement] of ENCODING_REPAIRS) {
    repaired = repaired.replace(pattern, replacement);
  }
  return repaired;
}

function normalizeApiData<T>(value: T): T {
  if (typeof value === "string") {
    return repairEncodingArtifacts(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeApiData(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeApiData(item)]),
    ) as T;
  }

  return value;
}

function endpoint(action: string, params: Record<string, string> = {}) {
  const configured = import.meta.env.VITE_API_ENDPOINT as string | undefined;
  const fallback =
    typeof window !== "undefined" && window.location.pathname.startsWith("/rifasolidaria/")
      ? "/rifasolidaria/api/index.php"
      : "/api/index.php";
  const url = new URL(configured || fallback, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.pathname + url.search;
}

function adminToken() {
  return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
}

async function request<T>(
  action: string,
  options: RequestInit & { params?: Record<string, string>; auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth) {
    const token = adminToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(endpoint(action, options.params), {
    ...options,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Erro ao conectar com o servidor");
  }
  return normalizeApiData(body.data as T);
}

export const api = {
  summary: () => request<{ config: RaffleConfig; sold: number; draw: DrawResult | null }>("summary"),
  config: () => request<RaffleConfig>("config"),
  createOrder: (payload: {
    comprador_nome: string;
    cpf_hash: string;
    cpf_mascarado: string;
    telefone: string;
    email?: string;
    qtd_cotas: number;
  }) => request<Order>("create_order", { method: "POST", body: JSON.stringify(payload) }),
  paymentOrder: (id: string) => request<Order | null>("payment_order", { params: { id } }),
  markPending: (id: string) => request<{ id: string; status: string }>("mark_pending", { method: "POST", body: JSON.stringify({ id }) }),
  receipt: (token: string) =>
    request<{ order: Order | null; tickets: number[]; draw: DrawResult | null }>("receipt", { params: { token } }),
  result: () => request<{ draw: DrawResult | null; config: RaffleConfig }>("result"),
};

export const adminApi = {
  getToken: adminToken,
  logout: () => localStorage.removeItem(TOKEN_KEY),
  login: async (email: string, password: string) => {
    const session = await request<{ token: string; email: string }>("login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem(TOKEN_KEY, session.token);
    return session;
  },
  resetPassword: (payload: { email: string; recovery_key: string; new_password: string; confirm_password: string }) =>
    request<{ email: string }>("reset_admin_password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  me: () => request<{ email: string }>("me", { auth: true }),
  credentials: () => request<AdminCredentials>("admin_credentials", { auth: true }),
  updateCredentials: async (payload: {
    current_password: string;
    email?: string;
    new_password?: string;
    confirm_password?: string;
    recovery_key?: string;
  }) => {
    const credentials = await request<AdminCredentials>("update_admin_credentials", {
      method: "POST",
      auth: true,
      body: JSON.stringify(payload),
    });
    if (credentials.token) localStorage.setItem(TOKEN_KEY, credentials.token);
    return credentials;
  },
  dashboard: () => request<{ config: RaffleConfig; orders: Order[]; draw: DrawResult | null }>("admin_data", { auth: true }),
  updateConfig: (payload: Partial<RaffleConfig>) =>
    request<RaffleConfig>("update_config", { method: "POST", auth: true, body: JSON.stringify(payload) }),
  confirmOrder: (id: string) =>
    request<{ ok: boolean; email_informado?: boolean; email_enviado?: boolean }>("confirm_order", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ id }),
    }),
  cancelOrder: (id: string) =>
    request<{ id: string; status: string }>("cancel_order", { method: "POST", auth: true, body: JSON.stringify({ id }) }),
  resetRaffle: (confirmacao: string) =>
    request<{ ok: boolean; removidos: { pedidos: number; cotas: number; resultados: number } }>("reset_raffle", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ confirmacao }),
    }),
  searchTickets: (query: string) =>
    request<TicketCandidate[]>("search_tickets", { params: { q: query }, auth: true }),
  createDraw: (payload: { seed?: string; fonte_seed?: string; modo?: "cesta_digital" | "papel_fisico" | "seed_publica"; ticket_numero?: number }) =>
    request<DrawResult>("create_draw", { method: "POST", auth: true, body: JSON.stringify(payload) }),
  togglePublish: (id: string, publicado: boolean) =>
    request<DrawResult>("toggle_publish", { method: "POST", auth: true, body: JSON.stringify({ id, publicado }) }),
  uploadPrizeImage: (file: File) => {
    const data = new FormData();
    data.set("file", file);
    return request<RaffleConfig>("upload_prize_image", { method: "POST", auth: true, body: data });
  },
  uploadVideo: (drawId: string, file: File) => {
    const data = new FormData();
    data.set("draw_id", drawId);
    data.set("file", file);
    return request<DrawResult>("upload_video", { method: "POST", auth: true, body: data });
  },
};
