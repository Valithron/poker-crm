export function BrandMark({ className = "" }: { className?: string }) {
  return <img className={`brand-mark ${className}`} src="/icon.svg" alt="" aria-hidden="true" />;
}
