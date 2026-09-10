import { Skeleton } from './skeleton';

// Espelha a altura real das linhas de conteúdo para não causar salto de
// layout quando os dados chegam.
export function SkeletonRows({ count }: { count: number }) {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-3 py-2">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <Skeleton className="h-3" style={{ width: `${55 + ((i * 13) % 35)}%` }} />
        </li>
      ))}
    </ul>
  );
}
