// Notifications : petites cartes en haut à droite, qui disparaissent seules.

export type ToastTone = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

const ICONS: Record<ToastTone, string> = { info: "i", success: "✓", warning: "!", error: "×" };

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span className="toast-icon">{ICONS[toast.tone]}</span>
          <div>
            <div className="toast-title">{toast.title}</div>
            {toast.message && <div className="toast-message">{toast.message}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
