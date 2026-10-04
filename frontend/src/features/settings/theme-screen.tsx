import { CheckIcon } from '@phosphor-icons/react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'

import { Page } from '@/components/app-shell/page'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Segmented, SettingsGroup, SettingsRow } from '@/features/settings/rows'
import { intlLocale } from '@/i18n'
import { useMode } from '@/lib/theme/mode'
import { paletteStore, usePalette } from '@/lib/theme/palette'
import { isPalette, PALETTES, type Palette } from '@/lib/theme/palettes'
import { cn } from '@/lib/utils'

/** Definições → Tema: dark or light, and which of the themes wears it. Kept on this device. */
export function ThemeScreen() {
  const { t } = useTranslation()
  const { setTheme } = useTheme()
  const mode = useMode()
  const palette = usePalette()

  return (
    <Page title={t('settings.theme.title')} back="/settings">
      <div className="grid gap-6">
        <SettingsGroup title={t('settings.theme.appearance')}>
          <SettingsRow label={t('settings.theme.mode')}>
            <Segmented
              label={t('settings.theme.mode')}
              value={mode}
              options={[
                { value: 'dark', label: t('settings.theme.dark') },
                { value: 'light', label: t('settings.theme.light') },
              ]}
              onChange={setTheme}
            />
          </SettingsRow>
        </SettingsGroup>

        <fieldset className="grid gap-2">
          <legend className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t('settings.theme.palette')}
          </legend>
          <RadioGroup
            value={palette}
            onValueChange={(value) => isPalette(value) && paletteStore.set(value)}
            // As many columns as fit cards of this width: the page's column stays narrow on a
            // wide window, so a breakpoint on the window would squeeze three into it.
            className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3"
          >
            {PALETTES.map((id) => (
              <PaletteOption key={id} id={id} selected={id === palette} />
            ))}
          </RadioGroup>
        </fieldset>
      </div>
    </Page>
  )
}

function PaletteOption({ id, selected }: { id: Palette; selected: boolean }) {
  const { t } = useTranslation()
  return (
    // Base UI names the radio after the label around it; the preview is decoration.
    <label
      className={cn(
        'relative grid cursor-pointer content-start gap-2 rounded-2xl bg-card p-2',
        selected && 'ring-2 ring-primary',
      )}
    >
      <Preview id={id} />
      <span className="block px-1 pb-1">
        <RadioGroupItem value={id} className="sr-only" />
        <span className="block text-[15px] font-medium">{t(`settings.theme.palettes.${id}.name`)}</span>
        <span className="block text-xs text-muted-foreground">
          {t(`settings.theme.palettes.${id}.description`)}
        </span>
      </span>
      {/* On the card's corner, out of the text's way whatever the name's length. */}
      {selected && (
        <span
          aria-hidden
          className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background"
        >
          <CheckIcon weight="bold" className="size-3.5" />
        </span>
      )}
    </label>
  )
}

/**
 * The theme in small, as the canvas shows each one: the weight on a card, what changed, the
 * steppers and the hero action. `data-palette` gives this subtree the theme's own tokens (in
 * the mode the app is in), so it is drawn with the real ones.
 */
function Preview({ id }: { id: Palette }) {
  const { i18n } = useTranslation()
  const locale = intlLocale(i18n.language)
  const weight = new Intl.NumberFormat(locale, { minimumFractionDigits: 1 }).format(82.5)
  const change = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, signDisplay: 'always' }).format(2.5)
  return (
    <span
      aria-hidden
      data-palette={id}
      className="grid gap-2 overflow-hidden rounded-xl bg-background p-2 text-foreground"
    >
      <span className="grid min-w-0 gap-1.5 rounded-lg bg-card p-2">
        <span className="flex items-baseline gap-1">
          <span className="text-2xl leading-none font-medium tabular-nums">{weight}</span>
          <span className="text-xs text-muted-foreground">kg</span>
        </span>
        <span className="text-xs font-medium text-primary tabular-nums">{change} kg</span>
        {/* The steppers wrap before they leave the card (a narrow phone, a larger text size). */}
        <span className="flex flex-wrap gap-1">
          {['+5', '+10'].map((step) => (
            <span
              key={step}
              className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground tabular-nums"
            >
              {step}
            </span>
          ))}
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">−</span>
        </span>
      </span>
      <span className="h-7 rounded-lg bg-primary" />
    </span>
  )
}
