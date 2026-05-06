// Utilitários: CPF, formatação, BR Code PIX

export function formatBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function maskCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, "").padStart(11, "0").slice(-11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function maskCPFHidden(cpf: string): string {
  const d = cpf.replace(/\D/g, "").padStart(11, "0").slice(-11);
  return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function isValidCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10) r = 0;
  if (r !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10) r = 0;
  return r === parseInt(d[10]);
}

export function maskPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => [a && `(${a})`, b && ` ${b}`, c && `-${c}`].filter(Boolean).join(""));
  return d.replace(/(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
}

export function generateOrderCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `RIFA-${s}`;
}

// CRC16-CCITT (poly 0x1021) for PIX BR Code
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, "0")}${value}`;
}

function sanitize(s: string, max: number): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .slice(0, max);
}

export interface PixPayloadInput {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amountCentavos: number;
  txid: string;
  description?: string;
}

export function buildPixPayload(input: PixPayloadInput): string {
  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", input.pixKey);
  const additional = tlv("05", sanitize(input.txid, 25));
  const amount = (input.amountCentavos / 100).toFixed(2);

  const parts = [
    tlv("00", "01"),
    tlv("26", merchantAccount),
    tlv("52", "0000"),
    tlv("53", "986"),
    tlv("54", amount),
    tlv("58", "BR"),
    tlv("59", sanitize(input.merchantName, 25) || "RECEBEDOR"),
    tlv("60", sanitize(input.merchantCity, 15) || "BRASIL"),
    tlv("62", additional),
  ].join("");
  const toCrc = parts + "6304";
  return toCrc + crc16(toCrc);
}
