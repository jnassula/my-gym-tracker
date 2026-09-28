import { cn } from '@/lib/utils'

/** The "mG" mark from the design: accent outline with a soft accent glow. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex size-18 items-center justify-center rounded-[1.25rem] border-[1.5px] border-primary text-[1.75rem] font-semibold text-primary shadow-[0_0_40px_color-mix(in_oklch,var(--primary)_25%,transparent)]',
        className,
      )}
    >
      mG
    </div>
  )
}
