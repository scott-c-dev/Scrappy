import { css } from "@/lib/css";

interface ErrorToastProps {
  error: string;
  onDismiss: () => void;
}

export function ErrorToast({ error, onDismiss }: ErrorToastProps) {
  return (
    <div
      onClick={onDismiss}
      style={css(
        "position:absolute;left:14px;right:14px;bottom:18px;z-index:50;cursor:pointer;display:flex;align-items:center;gap:10px;background:var(--ink);color:var(--paper);font-family:var(--font-body);font-weight:600;font-size:13.5px;padding:13px 15px;border-radius:var(--radius-sm);box-shadow:0 10px 30px rgba(0,0,0,.25)",
      )}
    >
      <span style={css("flex:1")}>{error}</span>
      <span style={css("opacity:.7;font-size:12px")}>tap to dismiss</span>
    </div>
  );
}
