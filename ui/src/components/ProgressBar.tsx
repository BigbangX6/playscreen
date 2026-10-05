// Barre de progression d'une installation (octets faits / total).

import { formatBytes } from "../format.ts";

export interface Progress {
  bytesDone: number;
  bytesTotal: number;
}

export function ProgressBar({ progress, compact = false }: { progress: Progress | null; compact?: boolean }) {
  const ratio = progress && progress.bytesTotal > 0 ? Math.min(1, progress.bytesDone / progress.bytesTotal) : null;
  return (
    <div className={`progress ${compact ? "progress-compact" : ""}`}>
      <div className={`progress-track ${ratio === null ? "progress-indeterminate" : ""}`}>
        <div className="progress-fill" style={{ width: ratio === null ? undefined : `${ratio * 100}%` }} />
      </div>
      {!compact && (
        <div className="progress-label">
          <span>{ratio === null ? "Préparation…" : `${Math.round(ratio * 100)} %`}</span>
          {progress && (
            <span className="muted">
              {formatBytes(progress.bytesDone)} / {formatBytes(progress.bytesTotal)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
