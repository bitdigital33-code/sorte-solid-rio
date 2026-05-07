import { useMemo, useState } from "react";
import {
  CalendarDays,
  Copy,
  FileText,
  Mail,
  Phone,
  Printer,
  Search,
  Sparkles,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Order, RaffleConfig } from "@/lib/api";
import { formatBRL } from "@/lib/raffle-utils";
import { cn } from "@/lib/utils";

type ReportOrder = Order & {
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  created_at?: string | null;
  email?: string | null;
  telefone?: string | null;
  tickets?: number[];
};

type ReportFilter = "todos" | "pendente" | "aguardando" | "confirmado" | "cancelado";

type BuyerSummary = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  pedidos: number;
  cotas: number;
  totalCentavos: number;
};

const FILTER_OPTIONS: Array<{ value: ReportFilter; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "confirmado", label: "Confirmados" },
  { value: "aguardando", label: "Aguardando" },
  { value: "pendente", label: "Pendentes" },
  { value: "cancelado", label: "Cancelados" },
];

const STATUS_LABELS: Record<string, string> = {
  aguardando: "Aguardando",
  cancelado: "Cancelado",
  confirmado: "Confirmado",
  pendente: "Pendente",
};

const STATUS_PRINT_CLASSES: Record<string, string> = {
  aguardando: "status-awaiting",
  cancelado: "status-cancelled",
  confirmado: "status-confirmed",
  pendente: "status-pending",
};

function reportStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function reportDateTime(value?: string | null) {
  if (!value) return "Nao informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function buyerIdentity(order: ReportOrder) {
  const phone = (order.telefone ?? "").replace(/\D/g, "");
  const email = (order.email ?? "").trim().toLowerCase();
  const name = order.comprador_nome.trim().toLowerCase();
  return phone || email || `${name}-${order.codigo}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ticketCode(orderCode: string, numero: number) {
  return `${orderCode}-${String(numero).padStart(4, "0")}`;
}

function orderTicketCodes(order: ReportOrder) {
  return (order.tickets ?? []).map((numero) => ticketCode(order.codigo, numero));
}

function ticketSummary(order: ReportOrder, limit?: number) {
  const codes = orderTicketCodes(order);
  if (codes.length === 0) {
    if (order.status === "confirmado") {
      return `${order.qtd_cotas} cotas confirmadas`;
    }
    return "Aguardando atribuicao de cotas";
  }

  if (!limit || codes.length <= limit) {
    return codes.join(", ");
  }

  return `${codes.slice(0, limit).join(", ")} +${codes.length - limit}`;
}

function ticketCodeRows(order: ReportOrder, perLine = 3) {
  const codes = orderTicketCodes(order);
  if (codes.length === 0) {
    return [];
  }

  const rows: string[] = [];
  for (let index = 0; index < codes.length; index += perLine) {
    rows.push(codes.slice(index, index + perLine).join(" · "));
  }

  return rows;
}

function buildReportHtml(args: {
  config: Partial<RaffleConfig> | null;
  filter: ReportFilter;
  generatedAt: string;
  orders: ReportOrder[];
  query: string;
  summary: {
    compradores: number;
    comEmail: number;
    confirmados: number;
    cotas: number;
    totalConfirmado: number;
    totalPrevisto: number;
  };
  topBuyers: BuyerSummary[];
}) {
  const { config, filter, generatedAt, orders, query, summary, topBuyers } = args;
  const reportName = config?.nome?.trim() || "Relatorio de compradores";
  const reportPrize = config?.premio?.trim() || "Campanha em andamento";
  const drawDate = config?.data_sorteio ? reportDateTime(config.data_sorteio) : "Nao definido";
  const filterLabel = reportStatusLabel(filter);
  const searchLabel = query.trim() ? `Busca: ${query.trim()}` : "Busca: sem filtro";
  const averageTickets =
    summary.compradores > 0 ? (summary.cotas / Math.max(summary.compradores, 1)).toFixed(1) : "0.0";
  const leadBuyer = topBuyers[0] ?? null;

  const rows = orders
    .map((order, index) => {
      const telefone = order.telefone?.trim() ? order.telefone : "Nao informado";
      const createdAt = reportDateTime(order.created_at);
      const confirmedAt = order.confirmed_at ? reportDateTime(order.confirmed_at) : "";
      const statusClass = STATUS_PRINT_CLASSES[order.status] ?? "status-default";
      const confirmationLine = confirmedAt
        ? `<div class="order-sub">Confirmado em ${escapeHtml(confirmedAt)}</div>`
        : "";
      const emailLine = order.email?.trim()
        ? `<div class="contact-row"><span class="contact-label">E-mail</span><span>${escapeHtml(order.email)}</span></div>`
        : "";
      const codeRows = ticketCodeRows(order, 3);
      const codeMarkup =
        codeRows.length > 0
          ? codeRows.map((row) => `<div class="code-line">${escapeHtml(row)}</div>`).join("")
          : `<div class="code-empty">${
              order.status === "confirmado"
                ? "Cotas confirmadas sem codigo visivel"
                : "Aguardando atribuicao de cotas"
            }</div>`;

      return `
        <tr class="order-row">
          <td class="col-index">${index + 1}</td>
          <td class="buyer-col">
            <div class="order-main">${escapeHtml(order.comprador_nome)}</div>
            <div class="order-sub">Pedido ${escapeHtml(order.codigo)}</div>
            <div class="order-sub">Criado em ${escapeHtml(createdAt)}</div>
            ${confirmationLine}
          </td>
          <td class="contact-col">
            <div class="contact-row"><span class="contact-label">Telefone</span><span>${escapeHtml(telefone)}</span></div>
            ${emailLine}
          </td>
          <td class="col-cotas">${order.qtd_cotas}</td>
          <td class="col-valor">${escapeHtml(formatBRL(order.valor_total_centavos))}</td>
          <td class="status-col"><span class="status-pill ${statusClass}">${escapeHtml(reportStatusLabel(order.status))}</span></td>
          <td class="codes-cell">${codeMarkup}</td>
        </tr>
      `;
    })
    .join("");

  const highlightsHtml =
    topBuyers.length === 0
      ? `<div class="highlight-empty">Nenhum comprador de destaque neste recorte.</div>`
      : topBuyers
          .map(
            (buyer, index) => `
              <div class="highlight-pill">
                <div>
                  <div class="highlight-name">#${index + 1} ${escapeHtml(buyer.nome)}</div>
                  <div class="highlight-meta">${escapeHtml(buyer.telefone || buyer.email || "Sem contato adicional")}</div>
                </div>
                <div class="highlight-value">${buyer.cotas} cotas</div>
              </div>
            `,
          )
          .join("");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(reportName)} - Relatorio de compradores</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #113725;
        --muted: #607567;
        --line: #dbe9df;
        --soft: #eef7f1;
        --panel: #ffffff;
        --primary: #188354;
        --primary-deep: #0d5f3b;
        --primary-soft: #dff4e8;
        --gold: #cfa031;
        --gold-soft: #f6edcf;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: linear-gradient(180deg, #edf7f0, #e5f1e9);
        color: var(--ink);
        font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      }

      .page {
        width: min(1220px, calc(100vw - 32px));
        margin: 18px auto;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        overflow: hidden;
        box-shadow: 0 24px 60px rgba(12, 60, 37, 0.12);
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 18px 22px 0;
      }

      .action-btn {
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        background: var(--primary);
        color: white;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .action-btn.secondary {
        background: #eef7f2;
        color: var(--primary-deep);
        border: 1px solid var(--line);
      }

      .masthead {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.65fr);
        gap: 16px;
        padding: 22px 22px 16px;
        background: linear-gradient(135deg, #15804f, #27af6b 62%, #d6a530 100%);
        color: #f7fff9;
      }

      .brand-kicker {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.22em;
        opacity: 0.78;
        text-transform: uppercase;
      }

      .brand-title {
        margin: 8px 0 8px;
        font-size: 30px;
        line-height: 1.04;
        font-weight: 800;
      }

      .brand-copy {
        max-width: 740px;
        color: rgba(247, 255, 249, 0.88);
        font-size: 13px;
        line-height: 1.55;
      }

      .brand-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 14px;
      }

      .tag {
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
        padding: 7px 10px;
        font-size: 11px;
        font-weight: 700;
      }

      .meta-card {
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.14);
        padding: 16px 18px;
        align-self: stretch;
      }

      .meta-kicker {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.78;
      }

      .meta-hero {
        margin-top: 8px;
        font-size: 18px;
        font-weight: 800;
      }

      .meta-list {
        margin-top: 12px;
        display: grid;
        gap: 7px;
        font-size: 12px;
      }

      .content {
        padding: 16px 22px 12px;
      }

      .snapshot-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }

      .snapshot-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 12px 14px;
        background: linear-gradient(180deg, #ffffff, #fbfffc);
      }

      .snapshot-label {
        color: var(--muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .snapshot-value {
        margin-top: 6px;
        font-size: 18px;
        font-weight: 800;
        line-height: 1.1;
      }

      .insight-grid {
        display: grid;
        gap: 12px;
        margin-top: 12px;
        grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
      }

      .insight-card {
        border: 1px solid var(--line);
        border-radius: 22px;
        background: #fcfffd;
        padding: 16px 18px;
      }

      .insight-kicker {
        color: var(--muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .insight-title {
        margin-top: 6px;
        font-size: 17px;
        font-weight: 800;
      }

      .insight-copy {
        margin-top: 6px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.55;
      }

      .highlight-row {
        margin-top: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .highlight-pill {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        min-width: 0;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: #ffffff;
        padding: 10px 12px;
        flex: 1 1 160px;
      }

      .highlight-name {
        font-size: 12px;
        font-weight: 800;
      }

      .highlight-meta {
        margin-top: 3px;
        color: var(--muted);
        font-size: 11px;
      }

      .highlight-value {
        color: var(--primary-deep);
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
      }

      .highlight-empty {
        border: 1px dashed var(--line);
        border-radius: 18px;
        padding: 12px;
        color: var(--muted);
        font-size: 12px;
      }

      .table-shell {
        margin-top: 12px;
        border: 1px solid var(--line);
        border-radius: 24px;
        overflow: hidden;
        background: white;
      }

      .table-header {
        padding: 14px 18px 12px;
        border-bottom: 1px solid var(--line);
        background: linear-gradient(180deg, #fbfffc, #f3faf5);
      }

      .table-kicker {
        color: var(--muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .table-title {
        margin-top: 4px;
        font-size: 18px;
        font-weight: 800;
      }

      .table-subtitle {
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
      }

      .table-wrap {
        padding: 12px 14px 16px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      th {
        color: var(--muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        text-align: left;
        padding: 0 8px 10px;
      }

      td {
        border-top: 1px solid var(--line);
        padding: 11px 8px;
        vertical-align: top;
        font-size: 12px;
      }

      .order-row:nth-child(even) td {
        background: #fbfefc;
      }

      .col-index,
      .col-cotas,
      .col-valor,
      .status-col {
        white-space: nowrap;
        width: 1%;
      }

      .col-index {
        color: var(--muted);
        font-weight: 700;
      }

      .col-cotas, .col-valor {
        font-weight: 700;
      }

      .buyer-col {
        width: 28%;
      }

      .contact-col {
        width: 22%;
      }

      .codes-cell {
        width: 26%;
      }

      .order-main {
        font-size: 13px;
        font-weight: 800;
        line-height: 1.25;
      }

      .order-sub {
        margin-top: 3px;
        color: var(--muted);
        font-size: 11px;
      }

      .contact-row {
        display: grid;
        grid-template-columns: 62px 1fr;
        gap: 6px;
        font-size: 11px;
        line-height: 1.45;
      }

      .contact-row + .contact-row {
        margin-top: 4px;
      }

      .contact-label {
        color: var(--muted);
        font-weight: 800;
      }

      .code-line {
        color: #214b36;
        font-family: "Courier New", Courier, monospace;
        font-size: 11px;
        line-height: 1.45;
        word-break: break-word;
      }

      .code-line + .code-line {
        margin-top: 2px;
      }

      .code-empty {
        color: var(--muted);
        font-size: 11px;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .status-confirmed { background: #ddf5e6; color: #167144; }
      .status-awaiting { background: #f8ecbe; color: #855d04; }
      .status-pending { background: #edf2ef; color: #52685c; }
      .status-cancelled { background: #f9e0e0; color: #a93d3d; }
      .status-default { background: #eaf3ee; color: #395847; }

      .footer {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 22px 20px;
        color: var(--muted);
        font-size: 11px;
      }

      @page {
        size: A4 landscape;
        margin: 8mm;
      }

      @media print {
        body {
          background: white;
          font-size: 11px;
        }

        .page {
          width: auto;
          margin: 0;
          border: 0;
          border-radius: 0;
          box-shadow: none;
        }

        .actions {
          display: none;
        }

        .masthead,
        .snapshot-grid,
        .insight-grid,
        .table-shell,
        .footer,
        .highlight-pill,
        .snapshot-card,
        .insight-card,
        .order-row {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        thead {
          display: table-header-group;
        }

        tbody {
          display: table-row-group;
        }

        .table-shell {
          border-radius: 18px;
        }

        .table-wrap {
          padding: 10px 12px 12px;
        }

        .insight-grid {
          grid-template-columns: minmax(0, 1fr) minmax(280px, 0.9fr);
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="actions">
        <button class="action-btn secondary" onclick="window.close()">Fechar</button>
        <button class="action-btn" onclick="window.print()">Imprimir agora</button>
      </div>

      <div class="masthead">
        <div>
          <div class="brand-kicker">Central de relatorios</div>
          <div class="brand-title">Relatorio executivo de compradores</div>
          <div class="brand-copy">
            Documento profissional para conferencia de pagamentos, participacoes e distribuicao de cotas da campanha.
          </div>
          <div class="brand-tags">
            <span class="tag">${escapeHtml(reportName)}</span>
            <span class="tag">${escapeHtml(reportPrize)}</span>
            <span class="tag">${escapeHtml(filterLabel)}</span>
          </div>
        </div>

        <div class="meta-card">
          <div class="meta-kicker">Recorte atual</div>
          <div class="meta-hero">${orders.length} registro(s) listados</div>
          <div class="meta-list">
            <div><strong>Gerado em:</strong> ${escapeHtml(generatedAt)}</div>
            <div><strong>Sorteio previsto:</strong> ${escapeHtml(drawDate)}</div>
            <div><strong>Filtro ativo:</strong> ${escapeHtml(filterLabel)}</div>
            <div><strong>${escapeHtml(searchLabel)}</strong></div>
          </div>
        </div>
      </div>

      <div class="content">
        <div class="snapshot-grid">
          <div class="snapshot-card">
            <div class="snapshot-label">Compradores</div>
            <div class="snapshot-value">${summary.compradores}</div>
          </div>
          <div class="snapshot-card">
            <div class="snapshot-label">Confirmados</div>
            <div class="snapshot-value">${summary.confirmados}</div>
          </div>
          <div class="snapshot-card">
            <div class="snapshot-label">Cotas listadas</div>
            <div class="snapshot-value">${summary.cotas}</div>
          </div>
          <div class="snapshot-card">
            <div class="snapshot-label">Total previsto</div>
            <div class="snapshot-value">${escapeHtml(formatBRL(summary.totalPrevisto))}</div>
          </div>
          <div class="snapshot-card">
            <div class="snapshot-label">Total confirmado</div>
            <div class="snapshot-value">${escapeHtml(formatBRL(summary.totalConfirmado))}</div>
          </div>
          <div class="snapshot-card">
            <div class="snapshot-label">Media por comprador</div>
            <div class="snapshot-value">${escapeHtml(averageTickets)} cotas</div>
          </div>
        </div>

        <div class="insight-grid">
          <div>
            <div class="insight-card">
              <div class="insight-kicker">Conferencia operacional</div>
              <div class="insight-title">Painel resumido para impressao e validacao rapida</div>
              <div class="insight-copy">
                Use este espelho para acompanhar quem comprou, quantas cotas levou, qual o valor do pedido e em qual etapa cada registro se encontra.
              </div>
              <div class="highlight-row">
                <div class="highlight-pill">
                  <div>
                    <div class="highlight-name">Filtro atual</div>
                    <div class="highlight-meta">${escapeHtml(filterLabel)}</div>
                  </div>
                  <div class="highlight-value">${orders.length} registro(s)</div>
                </div>
                <div class="highlight-pill">
                  <div>
                    <div class="highlight-name">Busca aplicada</div>
                    <div class="highlight-meta">${escapeHtml(query.trim() || "Sem filtro adicional")}</div>
                  </div>
                  <div class="highlight-value">${escapeHtml(formatBRL(summary.totalPrevisto))}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="insight-card">
            <div class="insight-kicker">Compradores em destaque</div>
            <div class="insight-title">${
              leadBuyer
                ? `${escapeHtml(leadBuyer.nome)} lidera este recorte`
                : "Nenhum comprador de destaque neste recorte"
            }</div>
            <div class="insight-copy">${
              leadBuyer
                ? `${leadBuyer.cotas} cotas distribuidas em ${leadBuyer.pedidos} pedido(s).`
                : "Assim que houver registros, o sistema destaca automaticamente os maiores compradores."
            }</div>
            <div class="highlight-row">
              ${highlightsHtml}
            </div>
          </div>
        </div>

        <div class="table-shell">
          <div class="table-header">
            <div class="table-kicker">Lista detalhada</div>
            <div class="table-title">Compradores, status, valores e codigos de participacao</div>
            <div class="table-subtitle">
              Conferencia completa para a equipe administrativa da campanha.
            </div>
          </div>
          <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Comprador</th>
                    <th>Contato</th>
                    <th>Cotas</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Codigos</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || `<tr><td colspan="7"><div class="empty-box">Nenhum registro encontrado.</div></td></tr>`}
                </tbody>
              </table>
          </div>
        </div>
      </div>

      <div class="footer">
        <div>Bitdigital - painel administrativo</div>
        <div>Relatorio gerado automaticamente para conferencia interna.</div>
      </div>
    </div>
  </body>
</html>`;
}

function buildProfessionalReportHtml(args: Parameters<typeof buildReportHtml>[0]) {
  const { config, filter, generatedAt, orders, query, summary, topBuyers } = args;
  const reportName = config?.nome?.trim() || "Relatorio de compradores";
  const reportPrize = config?.premio?.trim() || "Campanha em andamento";
  const drawDate = config?.data_sorteio ? reportDateTime(config.data_sorteio) : "Nao definido";
  const filterLabel = reportStatusLabel(filter);
  const searchLabel = query.trim() || "Sem filtro adicional";
  const averageTickets =
    summary.compradores > 0 ? (summary.cotas / Math.max(summary.compradores, 1)).toFixed(1) : "0.0";
  const confirmationRate =
    summary.compradores > 0
      ? `${Math.round((summary.confirmados / Math.max(summary.compradores, 1)) * 100)}%`
      : "0%";
  const leadBuyer = topBuyers[0] ?? null;

  const rows = orders
    .map((order, index) => {
      const telefone = order.telefone?.trim() ? order.telefone : "Nao informado";
      const createdAt = reportDateTime(order.created_at);
      const confirmedAt = order.confirmed_at ? reportDateTime(order.confirmed_at) : "";
      const statusClass = STATUS_PRINT_CLASSES[order.status] ?? "status-default";
      const ticketCodes = orderTicketCodes(order);
      const ticketLines = Array.from(
        { length: Math.ceil(ticketCodes.length / 3) },
        (_, lineIndex) => ticketCodes.slice(lineIndex * 3, lineIndex * 3 + 3).join(" | "),
      );
      const ticketMarkup =
        ticketLines.length > 0
          ? ticketLines.map((line) => `<div class="code-line">${escapeHtml(line)}</div>`).join("")
          : `<div class="code-empty">${
              order.status === "confirmado"
                ? "Cotas confirmadas sem codigo visivel"
                : "Aguardando atribuicao de cotas"
            }</div>`;

      return `
        <tr class="order-row">
          <td class="col-index">${index + 1}</td>
          <td class="buyer-col">
            <div class="order-main">${escapeHtml(order.comprador_nome)}</div>
            <div class="meta-row">
              <span class="meta-badge">Pedido ${escapeHtml(order.codigo)}</span>
              <span class="meta-badge">Criado em ${escapeHtml(createdAt)}</span>
              ${
                confirmedAt
                  ? `<span class="meta-badge meta-badge-ok">Confirmado em ${escapeHtml(confirmedAt)}</span>`
                  : ""
              }
            </div>
          </td>
          <td class="contact-col">${escapeHtml(telefone)}</td>
          <td class="col-cotas">${order.qtd_cotas}</td>
          <td class="col-valor">${escapeHtml(formatBRL(order.valor_total_centavos))}</td>
          <td class="status-col"><span class="status-pill ${statusClass}">${escapeHtml(reportStatusLabel(order.status))}</span></td>
          <td class="codes-cell">${ticketMarkup}</td>
        </tr>
      `;
    })
    .join("");

  const highlightCards =
    topBuyers.length === 0
      ? `<div class="highlight-empty">Nenhum comprador de destaque neste recorte.</div>`
      : topBuyers
          .slice(0, 3)
          .map(
            (buyer, index) => `
              <div class="highlight-card">
                <div class="highlight-rank">#${index + 1}</div>
                <div class="highlight-body">
                  <div class="highlight-name">${escapeHtml(buyer.nome)}</div>
                  <div class="highlight-meta">${escapeHtml(buyer.telefone || buyer.email || "Sem contato adicional")}</div>
                </div>
                <div class="highlight-value">${buyer.cotas} cotas</div>
              </div>
            `,
          )
          .join("");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(reportName)} - Relatorio de compradores</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #112c1f;
        --muted: #627467;
        --line: #d6e3db;
        --panel: #ffffff;
        --soft: #f4faf6;
        --soft-strong: #edf6f0;
        --primary: #11894f;
        --primary-deep: #0d5c39;
        --primary-soft: #dbf1e4;
        --gold: #ca9a2f;
        --shadow: 0 20px 55px rgba(12, 58, 36, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: linear-gradient(180deg, #eef6f0, #e7f0e9);
        color: var(--ink);
        font-family: "Segoe UI", Arial, Helvetica, sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .page {
        width: min(1180px, calc(100vw - 28px));
        margin: 14px auto;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        overflow: hidden;
        box-shadow: var(--shadow);
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 16px 18px 0;
      }

      .action-btn {
        border: 0;
        border-radius: 999px;
        padding: 10px 15px;
        background: var(--primary);
        color: white;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .action-btn.secondary {
        background: #eef7f2;
        color: var(--primary-deep);
        border: 1px solid var(--line);
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
        gap: 14px;
        padding: 18px 20px 16px;
        background: linear-gradient(135deg, #0f6e44, #21aa62 62%, #d7a636 100%);
        color: #f5fff8;
      }

      .hero-kicker {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.18em;
        opacity: 0.8;
        text-transform: uppercase;
      }

      .hero-title {
        margin: 7px 0 6px;
        font-size: 28px;
        line-height: 1.08;
        font-weight: 800;
      }

      .hero-copy {
        max-width: 700px;
        color: rgba(245, 255, 248, 0.92);
        font-size: 12px;
        line-height: 1.55;
      }

      .hero-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 12px;
      }

      .hero-tag {
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.14);
        padding: 6px 10px;
        font-size: 10px;
        font-weight: 700;
      }

      .hero-meta {
        display: grid;
        gap: 8px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.14);
        padding: 15px 16px;
      }

      .hero-meta-title {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.8;
      }

      .hero-meta-value {
        font-size: 20px;
        font-weight: 800;
      }

      .hero-meta-grid {
        display: grid;
        gap: 8px;
      }

      .hero-meta-item {
        border-top: 1px solid rgba(255, 255, 255, 0.14);
        padding-top: 8px;
      }

      .hero-meta-label {
        display: block;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        opacity: 0.78;
        text-transform: uppercase;
      }

      .hero-meta-text {
        display: block;
        margin-top: 4px;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.4;
      }

      .content {
        padding: 14px 18px 10px;
      }

      .summary-grid {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }

      .summary-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 11px 12px 12px;
        background: linear-gradient(180deg, #ffffff, #fbfffc);
      }

      .summary-label {
        color: var(--muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .summary-value {
        margin-top: 6px;
        font-size: 19px;
        font-weight: 800;
        line-height: 1.1;
      }

      .overview-band {
        margin-top: 10px;
        display: grid;
        gap: 10px;
        grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr);
      }

      .overview-card {
        border: 1px solid var(--line);
        border-radius: 22px;
        background: linear-gradient(180deg, #fbfffc, #f4faf6);
        padding: 14px 16px;
      }

      .overview-kicker {
        color: var(--muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .overview-title {
        margin-top: 5px;
        font-size: 17px;
        font-weight: 800;
      }

      .overview-copy {
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.55;
      }

      .overview-grid {
        margin-top: 12px;
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .overview-item {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: white;
        padding: 10px 12px;
      }

      .overview-item-label {
        color: var(--muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .overview-item-value {
        margin-top: 4px;
        font-size: 13px;
        font-weight: 800;
        line-height: 1.45;
      }

      .highlight-row {
        margin-top: 12px;
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .highlight-card {
        display: flex;
        align-items: center;
        gap: 10px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: white;
        padding: 10px 12px;
        min-width: 0;
      }

      .highlight-rank {
        width: 34px;
        height: 34px;
        border-radius: 12px;
        background: var(--soft-strong);
        color: var(--primary-deep);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 34px;
        font-size: 12px;
        font-weight: 800;
      }

      .highlight-body {
        min-width: 0;
        flex: 1 1 auto;
      }

      .highlight-name {
        font-size: 12px;
        font-weight: 800;
        line-height: 1.35;
      }

      .highlight-meta {
        margin-top: 3px;
        color: var(--muted);
        font-size: 11px;
        line-height: 1.35;
      }

      .highlight-value {
        color: var(--primary-deep);
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
      }

      .highlight-empty {
        border: 1px dashed var(--line);
        border-radius: 18px;
        padding: 12px;
        color: var(--muted);
        font-size: 12px;
      }

      .table-shell {
        margin-top: 10px;
        border: 1px solid var(--line);
        border-radius: 22px;
        overflow: hidden;
        background: white;
      }

      .table-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px 12px;
        border-bottom: 1px solid var(--line);
        background: linear-gradient(180deg, #fbfffc, #f4faf6);
      }

      .table-kicker {
        color: var(--muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .table-title {
        margin-top: 4px;
        font-size: 17px;
        font-weight: 800;
      }

      .table-subtitle {
        margin-top: 4px;
        color: var(--muted);
        font-size: 11px;
        line-height: 1.5;
        max-width: 520px;
      }

      .table-aside {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        text-align: right;
        line-height: 1.45;
      }

      .table-wrap {
        padding: 10px 12px 14px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      th {
        color: var(--muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        text-align: left;
        padding: 0 7px 9px;
      }

      td {
        border-top: 1px solid var(--line);
        padding: 9px 7px;
        vertical-align: top;
        font-size: 12px;
      }

      .order-row:nth-child(even) td {
        background: #fbfefc;
      }

      .col-index,
      .col-cotas,
      .col-valor,
      .status-col {
        width: 1%;
        white-space: nowrap;
      }

      .col-index {
        color: var(--muted);
        font-weight: 700;
      }

      .col-cotas,
      .col-valor {
        font-weight: 700;
      }

      .buyer-col {
        width: 30%;
      }

      .contact-col {
        width: 14%;
        font-weight: 700;
      }

      .codes-cell {
        width: 28%;
      }

      .order-main {
        font-size: 13px;
        font-weight: 800;
        line-height: 1.25;
      }

      .meta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
      }

      .meta-badge {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--soft);
        padding: 4px 10px;
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        line-height: 1.3;
      }

      .meta-badge-ok {
        border-color: #cfe9d9;
        background: var(--primary-soft);
        color: var(--primary-deep);
      }

      .code-line {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        border: 1px solid #dce9e1;
        border-radius: 10px;
        background: #f8fcf9;
        padding: 4px 8px;
        color: #214b36;
        font-family: "Courier New", Courier, monospace;
        font-size: 10px;
        line-height: 1.4;
        word-break: break-word;
      }

      .code-line + .code-line {
        margin-top: 4px;
      }

      .code-empty {
        color: var(--muted);
        font-size: 11px;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .status-confirmed { background: #ddf5e6; color: #167144; }
      .status-awaiting { background: #f8ecbe; color: #855d04; }
      .status-pending { background: #edf2ef; color: #52685c; }
      .status-cancelled { background: #f9e0e0; color: #a93d3d; }
      .status-default { background: #eaf3ee; color: #395847; }

      .empty-box {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 96px;
        border: 1px dashed var(--line);
        border-radius: 18px;
        background: linear-gradient(180deg, #fcfffd, #f5faf7);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }

      .footer {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 18px 18px;
        border-top: 1px solid var(--line);
        background: #fbfefc;
        color: var(--muted);
        font-size: 11px;
      }

      @page {
        size: A4 landscape;
        margin: 7mm;
      }

      @media print {
        body {
          background: white;
          font-size: 11px;
        }

        .page {
          width: auto;
          margin: 0;
          border: 0;
          border-radius: 0;
          box-shadow: none;
        }

        .actions {
          display: none;
        }

        .hero,
        .summary-grid,
        .overview-band,
        .table-shell,
        .footer,
        .highlight-card,
        .summary-card,
        .overview-card,
        .order-row {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        thead {
          display: table-header-group;
        }

        tbody {
          display: table-row-group;
        }

        .table-shell {
          border-radius: 16px;
        }

        .table-wrap {
          padding: 8px 10px 12px;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="actions">
        <button class="action-btn secondary" onclick="window.close()">Fechar</button>
        <button class="action-btn" onclick="window.print()">Imprimir agora</button>
      </div>

      <div class="hero">
        <div>
          <div class="hero-kicker">Bitdigital | relatorio administrativo</div>
          <div class="hero-title">Relatorio profissional de compradores</div>
          <div class="hero-copy">
            Documento otimizado para conferencia rapida da equipe, com foco em nomes, telefones, cotas adquiridas, valores e codigos de participacao.
          </div>
          <div class="hero-tags">
            <span class="hero-tag">${escapeHtml(reportName)}</span>
            <span class="hero-tag">${escapeHtml(reportPrize)}</span>
            <span class="hero-tag">Filtro ${escapeHtml(filterLabel)}</span>
          </div>
        </div>

        <div class="hero-meta">
          <div class="hero-meta-title">Recorte atual</div>
          <div class="hero-meta-value">${orders.length} registro(s)</div>
          <div class="hero-meta-grid">
            <div class="hero-meta-item">
              <span class="hero-meta-label">Gerado em</span>
              <span class="hero-meta-text">${escapeHtml(generatedAt)}</span>
            </div>
            <div class="hero-meta-item">
              <span class="hero-meta-label">Sorteio previsto</span>
              <span class="hero-meta-text">${escapeHtml(drawDate)}</span>
            </div>
            <div class="hero-meta-item">
              <span class="hero-meta-label">Busca aplicada</span>
              <span class="hero-meta-text">${escapeHtml(searchLabel)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="content">
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-label">Compradores</div>
            <div class="summary-value">${summary.compradores}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Confirmados</div>
            <div class="summary-value">${summary.confirmados}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Cotas listadas</div>
            <div class="summary-value">${summary.cotas}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Ticket medio</div>
            <div class="summary-value">${escapeHtml(averageTickets)} cotas</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Total previsto</div>
            <div class="summary-value">${escapeHtml(formatBRL(summary.totalPrevisto))}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Total confirmado</div>
            <div class="summary-value">${escapeHtml(formatBRL(summary.totalConfirmado))}</div>
          </div>
        </div>

        <div class="overview-band">
          <div class="overview-card">
            <div class="overview-kicker">Resumo executivo</div>
            <div class="overview-title">Leitura rapida do recorte atual</div>
            <div class="overview-copy">
              Estrutura desenhada para caber melhor na folha e acelerar a conferencia da equipe administrativa.
            </div>
            <div class="overview-grid">
              <div class="overview-item">
                <div class="overview-item-label">Filtro atual</div>
                <div class="overview-item-value">${escapeHtml(filterLabel)}</div>
              </div>
              <div class="overview-item">
                <div class="overview-item-label">Busca</div>
                <div class="overview-item-value">${escapeHtml(searchLabel)}</div>
              </div>
              <div class="overview-item">
                <div class="overview-item-label">Taxa confirmada</div>
                <div class="overview-item-value">${escapeHtml(confirmationRate)}</div>
              </div>
              <div class="overview-item">
                <div class="overview-item-label">Pedidos listados</div>
                <div class="overview-item-value">${orders.length} registro(s)</div>
              </div>
              <div class="overview-item">
                <div class="overview-item-label">Campanha</div>
                <div class="overview-item-value">${escapeHtml(reportName)}</div>
              </div>
              <div class="overview-item">
                <div class="overview-item-label">Premio</div>
                <div class="overview-item-value">${escapeHtml(reportPrize)}</div>
              </div>
            </div>
          </div>

          <div class="overview-card">
            <div class="overview-kicker">Compradores em destaque</div>
            <div class="overview-title">${
              leadBuyer
                ? `${escapeHtml(leadBuyer.nome)} lidera este recorte`
                : "Nenhum destaque registrado ainda"
            }</div>
            <div class="overview-copy">${
              leadBuyer
                ? `${leadBuyer.cotas} cotas distribuidas em ${leadBuyer.pedidos} pedido(s).`
                : "Assim que houver registros, o sistema destaca automaticamente os maiores compradores."
            }</div>
            <div class="highlight-row">
              ${highlightCards}
            </div>
          </div>
        </div>

        <div class="table-shell">
          <div class="table-header">
            <div>
              <div class="table-kicker">Relacao nominal</div>
              <div class="table-title">Compradores, telefones, valores e codigos de participacao</div>
              <div class="table-subtitle">
                Tabela principal para conferencia operacional da equipe administrativa.
              </div>
            </div>
            <div class="table-aside">
              <div>${summary.cotas} cotas neste recorte</div>
              <div>${escapeHtml(formatBRL(summary.totalPrevisto))} em valor previsto</div>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Comprador</th>
                  <th>Telefone</th>
                  <th>Cotas</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Codigos</th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan="7"><div class="empty-box">Nenhum registro encontrado.</div></td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="footer">
        <div>Bitdigital | painel administrativo</div>
        <div>Relatorio gerado automaticamente para conferencia interna.</div>
      </div>
    </div>
  </body>
</html>`;
}

function openPrintableReport(html: string) {
  const popup = window.open("", "_blank", "popup=yes,width=1440,height=960");
  if (popup && popup.document) {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => {
      popup.focus();
      popup.print();
    }, 450);
    return true;
  }

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const fallbackPopup = window.open(url, "_blank");
  if (!fallbackPopup) {
    URL.revokeObjectURL(url);
    return false;
  }

  window.setTimeout(() => {
    try {
      fallbackPopup.focus();
      fallbackPopup.print();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  }, 700);

  return true;
}

export function ReportsPanel({
  config,
  orders,
}: {
  config: Partial<RaffleConfig> | null;
  orders: ReportOrder[];
}) {
  const [filter, setFilter] = useState<ReportFilter>("todos");
  const [query, setQuery] = useState("");

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return [...orders]
      .filter((order) => {
        if (filter !== "todos" && order.status !== filter) return false;
        if (!normalizedQuery) return true;

        const haystack = [
          order.codigo,
          order.comprador_nome,
          order.email ?? "",
          order.telefone ?? "",
          ticketSummary(order),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => {
        const leftTime = new Date(left.created_at ?? 0).getTime();
        const rightTime = new Date(right.created_at ?? 0).getTime();
        return rightTime - leftTime;
      });
  }, [filter, orders, query]);

  const summary = useMemo(() => {
    const confirmados = filteredOrders.filter((order) => order.status === "confirmado");
    const totalPrevisto = filteredOrders.reduce(
      (sum, order) => sum + order.valor_total_centavos,
      0,
    );
    const totalConfirmado = confirmados.reduce((sum, order) => sum + order.valor_total_centavos, 0);
    const cotas = filteredOrders.reduce((sum, order) => sum + order.qtd_cotas, 0);
    const comEmail = filteredOrders.filter((order) => (order.email ?? "").trim() !== "").length;

    return {
      compradores: filteredOrders.length,
      comEmail,
      confirmados: confirmados.length,
      cotas,
      totalConfirmado,
      totalPrevisto,
    };
  }, [filteredOrders]);

  const topBuyers = useMemo<BuyerSummary[]>(() => {
    const grouped = new Map<string, BuyerSummary>();

    for (const order of filteredOrders) {
      const key = buyerIdentity(order);
      const current = grouped.get(key);

      if (current) {
        current.cotas += order.qtd_cotas;
        current.pedidos += 1;
        current.totalCentavos += order.valor_total_centavos;
        if (!current.email && order.email) current.email = order.email;
        if (!current.telefone && order.telefone) current.telefone = order.telefone;
        continue;
      }

      grouped.set(key, {
        id: key,
        nome: order.comprador_nome,
        email: order.email ?? "",
        pedidos: 1,
        telefone: order.telefone ?? "",
        cotas: order.qtd_cotas,
        totalCentavos: order.valor_total_centavos,
      });
    }

    return [...grouped.values()]
      .sort((left, right) => {
        if (right.cotas !== left.cotas) return right.cotas - left.cotas;
        return right.totalCentavos - left.totalCentavos;
      })
      .slice(0, 4);
  }, [filteredOrders]);

  const generatedAtLabel = new Date().toLocaleString("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const copySummary = async () => {
    const lines = [
      `Relatorio de compradores - ${config?.nome ?? "Campanha"}`,
      `Gerado em: ${generatedAtLabel}`,
      `Filtro: ${reportStatusLabel(filter)}`,
      query.trim() ? `Busca: ${query.trim()}` : "Busca: sem filtro",
      `Registros listados: ${summary.compradores}`,
      `Pedidos confirmados: ${summary.confirmados}`,
      `Cotas listadas: ${summary.cotas}`,
      `Total previsto: ${formatBRL(summary.totalPrevisto)}`,
      `Total confirmado: ${formatBRL(summary.totalConfirmado)}`,
      `Compradores com e-mail: ${summary.comEmail}`,
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Resumo do relatorio copiado");
    } catch {
      toast.error("Nao foi possivel copiar o resumo agora.");
    }
  };

  const printReport = () => {
    const html = buildProfessionalReportHtml({
      config,
      filter,
      generatedAt: generatedAtLabel,
      orders: filteredOrders,
      query,
      summary,
      topBuyers,
    });

    const opened = openPrintableReport(html);
    if (!opened) {
      toast.error("Permita a abertura da nova janela para imprimir o relatorio.");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-0 bg-gradient-hero text-primary-foreground shadow-elegant">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-primary-foreground/75">
              Central de relatorios
            </div>
            <h3 className="mt-3 text-3xl font-bold leading-tight">
              Lista completa de compradores pronta para impressao
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-foreground/85">
              Gere um espelho profissional com contatos, status, cotas e totais da campanha. O
              recorte atual vai direto para uma folha A4 em paisagem, pronto para conferencia da
              equipe.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge className="border-0 bg-white/14 text-white shadow-none">
                <FileText className="mr-1 h-3.5 w-3.5" /> {config?.nome ?? "Campanha ativa"}
              </Badge>
              <Badge className="border-0 bg-white/14 text-white shadow-none">
                <Ticket className="mr-1 h-3.5 w-3.5" /> {summary.cotas} cotas listadas
              </Badge>
              <Badge className="border-0 bg-white/14 text-white shadow-none">
                <CalendarDays className="mr-1 h-3.5 w-3.5" /> {generatedAtLabel}
              </Badge>
            </div>
          </div>

          <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground/75">
              Pronto para operacao
            </div>
            <div className="mt-2 text-lg font-semibold">Relatorio executivo de compradores</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
                <div className="text-xs uppercase tracking-wider text-primary-foreground/70">
                  Registros
                </div>
                <div className="mt-2 text-3xl font-bold">{summary.compradores}</div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
                <div className="text-xs uppercase tracking-wider text-primary-foreground/70">
                  Confirmados
                </div>
                <div className="mt-2 text-3xl font-bold">{summary.confirmados}</div>
              </div>
            </div>
            <div className="mt-4 text-sm text-primary-foreground/82">
              O botao de impressao leva o filtro atual, o resumo financeiro e o ranking dos
              principais compradores.
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_360px]">
        <Card className="p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-lg font-bold">Recorte do relatorio</h4>
              <p className="text-sm text-muted-foreground">
                Filtre por status ou pesquise nome, telefone, e-mail, pedido e codigos de cotas.
              </p>
            </div>
            <Badge variant="secondary" className="border-0 bg-primary/10 text-primary">
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Impressao em A4 paisagem
            </Badge>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={filter === option.value ? "default" : "secondary"}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Buscar por comprador, contato, pedido ou codigo"
              />
            </div>
            <Button type="button" variant="outline" onClick={() => setQuery("")}>
              Limpar busca
            </Button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Users} label="Compradores" value={String(summary.compradores)} />
            <MetricCard icon={Ticket} label="Cotas listadas" value={String(summary.cotas)} />
            <MetricCard
              icon={Wallet}
              label="Total previsto"
              value={formatBRL(summary.totalPrevisto)}
            />
            <MetricCard icon={Mail} label="Com e-mail" value={String(summary.comEmail)} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6 shadow-card">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
                <Printer className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-lg font-bold">Impressao profissional</h4>
                <p className="text-sm text-muted-foreground">
                  Gera uma janela pronta para imprimir com resumo, ranking e lista detalhada dos
                  compradores.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <Button size="lg" className="h-12" onClick={printReport}>
                <Printer className="mr-2 h-4 w-4" /> Imprimir relatorio
              </Button>
              <Button size="lg" variant="secondary" className="h-12" onClick={copySummary}>
                <Copy className="mr-2 h-4 w-4" /> Copiar resumo
              </Button>
            </div>

            <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-emerald-950">
              <div className="font-semibold">Vai junto na impressao:</div>
              <div className="mt-2 leading-6">
                campanha, premio, filtro ativo, data de geracao, totais, lista de compradores,
                contato, status e codigos das cotas.
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden shadow-card">
            <div className="border-b bg-secondary/40 px-6 py-4">
              <h4 className="text-lg font-bold">Top compradores</h4>
              <p className="text-sm text-muted-foreground">
                Destaque automatico por volume de cotas no recorte atual.
              </p>
            </div>
            <div className="p-4">
              {topBuyers.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/50 p-6 text-center text-sm text-muted-foreground">
                  Nenhum comprador encontrado para este filtro.
                </div>
              ) : (
                <div className="space-y-3">
                  {topBuyers.map((buyer, index) => (
                    <div
                      key={buyer.id}
                      className={cn(
                        "rounded-2xl border p-4 transition-colors",
                        index === 0 ? "border-primary/30 bg-primary/5" : "bg-background",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold">
                            #{index + 1} {buyer.nome}
                          </div>
                          <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5" />{" "}
                              {buyer.telefone || "Telefone nao informado"}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5" /> {buyer.email || "Sem e-mail"}
                            </div>
                          </div>
                        </div>
                        <Badge className="border-0 bg-primary/12 text-primary">
                          {buyer.cotas} cotas
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{buyer.pedidos} pedido(s)</span>
                        <span className="font-semibold text-foreground">
                          {formatBRL(buyer.totalCentavos)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden border-2 border-primary/15 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white/85 px-6 py-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Pre-visualizacao
            </div>
            <h4 className="mt-1 text-xl font-bold">Relatorio detalhado de compradores</h4>
            <p className="text-sm text-muted-foreground">
              O recorte abaixo e o mesmo que sera impresso na janela do relatorio.
            </p>
          </div>
          <Badge variant="secondary" className="border-0 bg-primary/10 text-primary">
            {filteredOrders.length} linha(s)
          </Badge>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="px-6 py-14 text-center text-muted-foreground">
            Nenhum comprador encontrado para o filtro atual.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-6 py-3 pr-3">Comprador</th>
                  <th className="py-3 pr-3">Cotas</th>
                  <th className="py-3 pr-3">Valor</th>
                  <th className="py-3 pr-3">Status</th>
                  <th className="py-3 pr-6">Codigos</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="border-b last:border-0">
                    <td className="px-6 py-4 pr-3 align-top">
                      <div className="font-semibold">{order.comprador_nome}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {order.codigo} - {reportDateTime(order.created_at)}
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5" />{" "}
                          {order.telefone || "Telefone nao informado"}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" /> {order.email || "Sem e-mail"}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-3 align-top tabular-nums font-semibold">
                      {order.qtd_cotas}
                    </td>
                    <td className="py-4 pr-3 align-top tabular-nums font-semibold">
                      {formatBRL(order.valor_total_centavos)}
                    </td>
                    <td className="py-4 pr-3 align-top">
                      <Badge className="border-0 bg-transparent p-0 shadow-none">
                        <span
                          className={cn(
                            "rounded-full px-2 py-1 text-xs font-medium",
                            order.status === "confirmado" && "bg-success/15 text-success",
                            order.status === "aguardando" && "bg-gold/20 text-gold-foreground",
                            order.status === "pendente" && "bg-muted text-muted-foreground",
                            order.status === "cancelado" && "bg-destructive/15 text-destructive",
                          )}
                        >
                          {reportStatusLabel(order.status)}
                        </span>
                      </Badge>
                    </td>
                    <td className="py-4 pr-6 align-top">
                      <div className="max-w-[28rem] whitespace-normal break-words font-mono text-xs leading-6 text-emerald-950">
                        {ticketSummary(order, 10)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </div>
      <div className="mt-3 text-2xl font-bold leading-none">{value}</div>
    </div>
  );
}
