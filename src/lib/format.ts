export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const now = () => new Date().toISOString();

export const fmtDT = (s?: string) =>
  s
    ? new Date(s).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export const fmtD = (s?: string) => (s ? new Date(s).toLocaleDateString("vi-VN") : "");

/** Hours between two dates. */
export const hrs = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 36e5;

export const fmtH = (h: number | null | undefined) =>
  h == null || isNaN(h)
    ? "–"
    : h < 1
      ? Math.round(h * 60) + " phút"
      : h < 48
        ? h.toFixed(1) + " giờ"
        : (h / 24).toFixed(1) + " ngày";

export const money = (v: unknown) =>
  (Number(v) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

export const pct = (v: number | null | undefined) => (v == null ? "–" : Math.round(v) + "%");

export const today = () => new Date().toISOString().slice(0, 10);

export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
