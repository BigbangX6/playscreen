// Indicateur d'attente : toujours animé, jamais un écran figé (F26).

export function Spinner({ size = 6 }: { size?: number }) {
  return <span className="spinner" style={{ width: `calc(var(--unit) * ${size})`, height: `calc(var(--unit) * ${size})` }} />;
}
