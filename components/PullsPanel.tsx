import type { PanelResult, PullsDigest } from '@/lib/types';

const URL_RE = /(https?:\/\/\S+)/g;

function renderLine(line: string, key: number) {
  const parts = line.split(URL_RE);
  return (
    <div key={key} style={{ whiteSpace: 'pre' }}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  );
}

export function PullsPanel({ pulls, className }: { pulls: PanelResult<PullsDigest>; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`} data-testid="pulls-panel">
      <h2>PRs/Issues</h2>
      {pulls.error && <p role="alert">{pulls.error}</p>}
      <div>{(pulls.data?.lines ?? []).map((line, i) => renderLine(line, i))}</div>
    </section>
  );
}
