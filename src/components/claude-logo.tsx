export function ClaudeLogo({ className }: { className?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <img
        src="/collab-logo.png"
        alt="Collab logo"
        aria-hidden="true"
        className={className}
        style={{ objectFit: "contain" }}
      />
      <span className="text-[0.6em] font-light tracking-widest text-muted-foreground/60 select-none leading-none">×</span>
      <img
        src="/logo.png"
        alt="Claude logo"
        aria-hidden="true"
        className={className}
        style={{ objectFit: "contain" }}
      />
    </div>
  );
}
