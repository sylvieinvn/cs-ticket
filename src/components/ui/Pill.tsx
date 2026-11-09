import { lab, type Option } from "@/lib/constants";

export function Pill({ options, value, title }: { options: readonly Option[]; value: string | undefined; title?: string }) {
  const [, text, cls] = lab(options, value);
  return (
    <span className={`pill ${cls ?? ""}`} title={title}>
      {text}
    </span>
  );
}

export const Dash = () => <span className="muted">—</span>;
