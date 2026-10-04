# Design reference

Imported from Claude Design (project `e82bdf97-c13f-4c11-bfed-25b8555a4120`).

- `myGymTracker.dc.html`: the design canvas. It holds the navigation map, a clickable prototype (1a), variations of the exercise and day screens (1b–1g), and the auth, Apple Health, settings, PDF import, extra and tablet/desktop screens. It ends with a table of the shadcn components used on each screen. Open it in a browser next to `support.js`.
- `support.js`: the canvas runtime (generated; do not edit).

## Logo

"Anilha G": a weight plate seen head-on. The rim is also a progress ring (the dim 40° segment is what's left), the centre dot is the bar end-on, and together they read as the G of Gym. It is a line in the accent colour, never a fill.

- `logo/mark.svg`: the mark on a 48 grid (radius 16, stroke 4.5, 40° opening, centre dot r 3). In the app it is `LogoMark` (`src/components/logo-mark.tsx`), drawn in `currentColor` (`text-primary`).
- `logo/favicon.svg`: dark tile with a heavier stroke (5.5) so it holds at 16px. Copied to `frontend/public/favicon.svg`.
- `logo/app-icon.svg`: the app icon (ground `#161826` with the `#2b2741` glow from the welcome screen). The PWA PNG icons are exported from it in phase 6.
- Email: `backend/app/core/assets/email-logo.png` is `logo/mark.svg` with the accent glow (`drop-shadow(0 0 14px)` at 45%) on a transparent ground, 192 px for a 96 px slot (mail clients don't draw SVG). Rendered with headless Chrome (`--default-background-color=00000000`).
- Wordmark: "myGymTracker" in Inter 500, letter-spacing -0.02em, next to or under the mark.

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

## Themes

Nocturne is the app's own theme and the default. Beside it the app offers the eight palette
families of the Claude Design canvas "myGymTracker Ferro" (section 3b), as colours only: the
typography, radii and components stay Nocturne's (the canvas's Ferro system, with Barlow and
block buttons, is not built).

| Theme | Dark (from the canvas) | Light |
| --- | --- | --- |
| Nocturne | lilac on night blue (the original) | the original light mode |
| Ferro | ember orange `#FF7A1A` on warm grey | the canvas's "Papel": brick orange on warm paper |
| Lima | acid lime `#C9F24A` on green-grey | derived: olive green on a green-tinted white |
| Gelo | cyan `#4FD1FF` on night blue | the canvas's "Neve": electric blue on blue-white |
| Brasa | coral red `#FF4F3D` on true black (its destructive is pink) | derived |
| Ouro | gold `#F5B82E` on blue graphite (its warning is orange) | derived |
| Violeta | electric violet `#B388FF` on dark plum | derived |
| Menta | mint `#3DDC97` on cold charcoal | derived |
| Grafite | no colour: a near-white accent, grey charts | derived: a near-black accent |

The canvas drew eight dark palettes and two light ones; every theme has both modes in the app
(the user's decision, 2026-10-04), so six light modes were derived: the lightness steps the two
drawn light palettes share (measured in OKLCH), each family's own hues, and the accent darkened
until it reads on the ground (4.5:1 or more). Two of the canvas's own values missed 4.5:1 by a
hair (Papel's warning on a card, Neve's muted text on the ground) and were stepped just enough.

Every palette maps onto the same shadcn tokens (`frontend/src/themes.css`): ground → background,
surface → card and popover, raised → secondary and muted, accent → primary and ring, accent
tint → accent, text on the accent → the ground (dark) or the surface (light). Chart colours and
the heart rate's are the accent's and the destructive's hue stepped into the lightness band the
dataviz validator asks for, as Nocturne's are: a theme's bright accent (Lima's, Gelo's) is too
light for a mark on a dark card. Grafite's charts are greys on purpose, so its two series differ
in lightness alone.

