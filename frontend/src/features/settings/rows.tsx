import { CaretRightIcon } from '@phosphor-icons/react'
import { createLink } from '@tanstack/react-router'
import { useId, type ComponentProps, type ReactNode } from 'react'

import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** A titled card of rows, e.g. "Preferências". */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="px-1 text-[0.6875rem] font-medium tracking-widest text-primary uppercase">{title}</h2>
      <Card className="gap-0 divide-y py-0">{children}</Card>
    </section>
  )
}

const ROW = 'flex min-h-13 items-center gap-3 px-4 py-1.5 text-[15px]'

/** A label with a control on the right. */
export function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={ROW}>
      <span className="flex-1">{label}</span>
      {children}
    </div>
  )
}

/** The whole row toggles the switch (a 52px target for a small control). */
export function SwitchRow(props: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <label htmlFor={id} className={`${ROW} cursor-pointer`}>
      <span className="grid flex-1 gap-0.5">
        {props.label}
        {props.hint && <span className="text-xs text-muted-foreground">{props.hint}</span>}
      </span>
      <Switch id={id} checked={props.checked} onCheckedChange={props.onCheckedChange} />
    </label>
  )
}

function RowAnchor({ label, value, ...props }: ComponentProps<'a'> & { label: string; value?: ReactNode }) {
  return (
    <a className={`${ROW} hover:bg-accent/50`} {...props}>
      <span className="flex-1">{label}</span>
      {value !== undefined && <span className="text-[13px] text-muted-foreground">{value}</span>}
      <CaretRightIcon aria-hidden className="size-4 text-muted-foreground" />
    </a>
  )
}

/** A row that opens a sub-screen, with its current value on the right. */
// oxlint-disable-next-line react/only-export-components -- createLink returns a (typed) component
export const LinkRow = createLink(RowAnchor)

/** A compact segmented choice (PT / EN / ES, kg / lb). One option is always selected. */
export function Segmented<T extends string>(props: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <ToggleGroup
      aria-label={props.label}
      value={[props.value]}
      onValueChange={(value) => value[0] && props.onChange(value[0] as T)}
      spacing={0}
      className="rounded-lg bg-background p-0.5"
    >
      {props.options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="h-9 min-w-11 rounded-md px-2.5 text-[13px] text-muted-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
