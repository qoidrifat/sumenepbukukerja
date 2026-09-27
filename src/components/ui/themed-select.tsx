import * as React from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type SelectSize,
  type SelectVariant,
} from "@/components/ui/select"

export type ThemedSelectOption = {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

export type ThemedSelectProps = {
  /** Stable id used to bind the visible `<label htmlFor>` to the trigger. */
  id?: string
  value: string
  onValueChange: (value: string) => void
  options: readonly ThemedSelectOption[]
  variant?: SelectVariant
  size?: SelectSize
  placeholder?: string
  disabled?: boolean
  className?: string
  contentClassName?: string
} & Omit<
  React.ComponentProps<typeof Select>,
  "value" | "onValueChange" | "defaultValue" | "children"
>

/**
 * Single entry point for every select in the app. Keeping the option list and
 * the trigger/content/item variant together is what makes the 18 dropdowns in
 * the product read as one system instead of 18 separate implementations.
 *
 * Accessibility: the trigger is a real `role="combobox"` button that Radix
 * wires to `aria-expanded`, `aria-haspopup="listbox"` and `aria-controls`;
 * each option is a `role="option"` with `aria-selected`, and keyboard
 * navigation (arrows, Home/End, type-ahead, Enter/Escape) is handled by Radix.
 */
export function ThemedSelect({
  id,
  value,
  onValueChange,
  options,
  variant = "default",
  size = "md",
  placeholder,
  disabled,
  className,
  contentClassName,
  ...rootProps
}: ThemedSelectProps) {
  return (
    <Select
      data-slot="themed-select"
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      {...rootProps}
    >
      <SelectTrigger id={id} variant={variant} size={size} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        variant={variant}
        className={contentClassName}
        position="popper"
        align="start"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            variant={variant}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
