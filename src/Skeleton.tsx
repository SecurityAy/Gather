interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

export function Skeleton({ width = "100%", height = 14, className = "" }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${className}`.trim()}
      style={{ width, height }}
    />
  );
}

export function SkeletonList({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton-list" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={18} />
      ))}
    </div>
  );
}

export default Skeleton;