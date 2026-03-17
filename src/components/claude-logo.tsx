export function ClaudeLogo({ className }: { className?: string }) {
  // Extract only sizing/layout classes — color classes (text-*) don't apply to img
  return (
    <img
      src="/logo.png"
      alt="Logo"
      aria-hidden="true"
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
