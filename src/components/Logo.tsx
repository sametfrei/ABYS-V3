import Image from "next/image";

const ORIGINAL_LOGO = "/logo-abys-original-transparent.png";

export function LogoMark({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <Image
      src={ORIGINAL_LOGO}
      alt="ABYS"
      width={1600}
      height={1600}
      className={`object-contain p-0.5 ${className}`}
      priority
    />
  );
}

export function LogoBox({
  subLabel,
  large = false,
}: {
  subLabel?: string;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center border border-abys-ink/15 bg-white/70 rounded-lg px-3 py-2">
      <LogoMark className={large ? "w-40 h-28" : "w-20 h-12"} />
      {subLabel && (
        <span className="mt-1 text-[9px] tracking-widest font-sans font-semibold uppercase text-abys-muted leading-tight">
          {subLabel}
        </span>
      )}
    </div>
  );
}
