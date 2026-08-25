// Espelha a altura real das linhas de conteúdo para não causar salto de
// layout quando os dados chegam.
export function SkeletonRows({ count }: { count: number }) {
  return (
    <ul aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="skeleton-row">
          <span className="skeleton" style={{ width: `${55 + ((i * 13) % 35)}%` }} />
        </li>
      ))}
    </ul>
  );
}
