import { cn } from '@/lib/utils'

/**
 * The "Anilha G" mark (design/logo): a plate seen head-on whose rim is a progress
 * ring and reads as a G. Drawn in currentColor, with a soft accent glow.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={4.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        'size-22 text-primary drop-shadow-[0_0_18px_color-mix(in_oklch,var(--primary)_40%,transparent)]',
        className,
      )}
    >
      <circle cx="24" cy="24" r="16" strokeOpacity={0.28} />
      <path d="M36.26 13.72A16 16 0 1 0 40 24h-9" />
      <circle cx="24" cy="24" r="3" fill="currentColor" stroke="none" />
    </svg>
  )
}
