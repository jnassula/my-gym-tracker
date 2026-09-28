# Design reference

Imported from Claude Design (project `e82bdf97-c13f-4c11-bfed-25b8555a4120`).

- `myGymTracker.dc.html`: the design canvas. It holds the navigation map, a clickable prototype (1a), variations of the exercise and day screens (1b–1g), and the auth, Apple Health, settings, PDF import, extra and tablet/desktop screens. It ends with a table of the shadcn components used on each screen. Open it in a browser next to `support.js`.
- `support.js`: the canvas runtime (generated; do not edit).

## Nocturne design system (summary)

A quiet, compact dark interface: a blue-grey ground, Inter at weight 500 for headings, soft radii, and an accent used as a line or glow rather than a fill.

| shadcn token | Dark (default) | Nocturne role |
| --- | --- | --- |
| `background` | `#161826` | ground |
| `card` / `popover` | `#232532` | surface |
| `foreground` | `#e9e9ed` | text |
| `primary` | `#9184d9` | accent (blurple) |
| `muted-foreground` | `#9397ab` | neutral-500 |
| `border` / `input` | `#3f424d` | neutral-800 |
| `destructive` | `#e07a86` | |
| `accent` (hover tint) | `#2b2741` | accent-900 |
| `radius` | `0.625rem` | |

Light mode swaps the same OKLCH ramps (`neutral-100` ground, `accent-600` primary). The tokens live in `frontend/src/index.css`.

Rules applied in the app:

- **Actions:** outline the primary action (`variant="outline-primary"`). A filled `primary` is reserved for the one hero action per screen (e.g. Registar série, Entrar, Criar conta).
- **Touch sizes:** targets ≥ 44px. Fields are 48px (`Input`), secondary buttons 48px (`size="touch"`), hero buttons 52px (`size="hero"`), icon buttons 44px (`size="icon-touch"`).
- **Headings:** weight 500 at most; hierarchy comes from size and space.
- **Icons:** Phosphor (`@phosphor-icons/react`; shadcn `iconLibrary: "phosphor"`).
- **Font:** Inter (self-hosted through `@fontsource-variable/inter`, so it works offline in the PWA).
- **Colour:** no pure black or white, and never flood large areas with the accent.
- **Copy:** PT-PT first; EN and ES follow 1:1. Exercise names stay exactly as written in the PDF.
- **Custom pieces**, where the library has nothing: password strength meter, weight stepper, sparklines, calendar heatmap and the plate calculator.
