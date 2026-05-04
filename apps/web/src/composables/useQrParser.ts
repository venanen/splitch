export type QrParsed = {
  fn?: string;
  fd?: string; // i -> fd mapping in QR payloads
  fp?: string;
  s?: string; // total
  t?: string; // timestamp like 20260406T201700Z
};

/**
 * Parse QR payloads from Russian fiscal receipts.
 * Supports formats like: t=20260406T201700&s=52355.66&fn=...&i=...&fp=...&n=1
 */
export function parseQrPayload(text: string): QrParsed {
  const out: Record<string, string> = {};
  const parts = String(text).trim().replace(/^\?/, '').split('&');
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (!k) continue;
    out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return { fn: out.fn, fd: out.i, fp: out.fp, s: out.s, t: out.t };
}

export function deriveDateTimeFromT(t?: string): { date?: string; time?: string } {
  if (!t) return {};
  const m = String(t).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})*/);
  if (!m) return {};
  const [, y, mo, d, h, mi] = m;
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}
