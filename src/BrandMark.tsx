export function BrandMark({ className = "" }: { className?: string }) {
  return <img className={`brand-mark ${className}`} src="/apple-touch-icon.png?v=2" alt="" aria-hidden="true" />;
}
