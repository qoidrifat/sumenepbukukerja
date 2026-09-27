import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Every select in the app renders through this file so a dropdown always looks
 * like the control that opened it:
 *   - `default` mirrors the public input token (slate border, rounded-lg, 48px)
 *   - `admin`   mirrors the Warm Brutalism `.admin-input` (2px ink border, 2px
 *               radius, flat offset shadow)
 *   - `ghost`   borderless variant for selects nested inside another control
 */
export type SelectVariant = "default" | "admin" | "ghost"
export type SelectSize = "sm" | "md"

const triggerVariantClass: Record<SelectVariant, string> = {
  default:
    "min-h-12 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base leading-6 text-slate-900 hover:border-slate-400 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 data-[state=open]:border-blue-500 data-[state=open]:ring-2 data-[state=open]:ring-blue-100 data-[placeholder]:text-slate-500 aria-invalid:border-red-400 aria-invalid:ring-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500",
  admin:
    "min-h-12 rounded-[2px] border-2 border-[#121212] bg-white px-3 py-2.5 text-base leading-6 text-[#1a1a1a] shadow-[2px_2px_0_0_#121212] hover:bg-[#F1EDE3] focus:border-[#FF5A26] focus:shadow-[4px_4px_0_0_#121212] data-[state=open]:border-[#FF5A26] data-[state=open]:bg-[#F1EDE3] data-[state=open]:shadow-[4px_4px_0_0_#121212] data-[placeholder]:text-[#525252] disabled:cursor-not-allowed disabled:border-[#A8A29E] disabled:bg-[#F1EDE3] disabled:text-[#525252] disabled:shadow-[2px_2px_0_0_#A8A29E]",
  ghost:
    "min-h-9 w-auto rounded-md border-0 bg-transparent px-1.5 py-1 text-sm font-extrabold leading-5 text-blue-700 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 data-[state=open]:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400",
}

const triggerSizeClass: Record<SelectVariant, Record<SelectSize, string>> = {
  default: { sm: "min-h-10 px-2.5 py-1.5 text-sm", md: "" },
  admin: { sm: "min-h-10 px-2 py-1 text-sm", md: "" },
  ghost: { sm: "", md: "min-h-10 px-2 text-sm" },
}

const chevronClass: Record<SelectVariant, string> = {
  default: "size-5 text-slate-400 group-hover:text-slate-600 group-data-[state=open]:text-blue-600",
  admin: "size-5 text-[#121212]",
  ghost: "size-4 text-blue-700",
}

const contentVariantClass: Record<SelectVariant, string> = {
  default:
    "max-h-[min(21rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1.5rem)] rounded-lg border border-slate-200 bg-white p-1 text-slate-900 shadow-lg shadow-slate-900/10",
  admin:
    "admin-workspace admin-select-portal max-h-[min(21rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1.5rem)] rounded-[2px] border-2 border-[#121212] p-1 shadow-[4px_4px_0_0_#121212]",
  ghost:
    "max-h-[min(21rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1.5rem)] rounded-lg border border-slate-200 bg-white p-1 text-slate-900 shadow-lg shadow-slate-900/10",
}

const itemVariantClass: Record<SelectVariant, string> = {
  default:
    "min-h-11 rounded-md px-3 py-2 text-sm leading-6 text-slate-700 data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-950 data-[state=checked]:font-extrabold data-[state=checked]:text-blue-700 data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:text-slate-500",
  admin:
    "min-h-11 rounded-[2px] px-3 py-2 text-sm font-semibold leading-6 text-[#1a1a1a] data-[highlighted]:bg-[#FFE662] data-[highlighted]:text-[#1a1a1a] data-[state=checked]:bg-[#FF5A26] data-[state=checked]:text-white data-[state=checked]:font-black data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:text-[#525252] data-[disabled]:opacity-60",
  ghost:
    "min-h-11 rounded-md px-3 py-2 text-sm leading-6 text-slate-700 data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-950 data-[state=checked]:font-extrabold data-[state=checked]:text-blue-700 data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:text-slate-500",
}

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "md",
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: SelectSize
  variant?: SelectVariant
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      data-variant={variant}
      className={cn(
        "group flex w-full min-w-0 items-center justify-between gap-2 text-left outline-none transition-[border-color,box-shadow,background-color] duration-150 *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:truncate *:data-[slot=select-value]:text-left",
        triggerVariantClass[variant],
        triggerSizeClass[variant][size],
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            "shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180",
            chevronClass[variant]
          )}
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  sideOffset = 6,
  variant = "default",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & {
  variant?: SelectVariant
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        data-variant={variant}
        className={cn(
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 relative z-50 origin-(--radix-select-content-transform-origin) overflow-hidden",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          contentVariantClass[variant],
          className
        )}
        position={position}
        align={align}
        sideOffset={sideOffset}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "max-h-[min(20rem,var(--radix-select-content-available-height))] w-full min-w-[var(--radix-select-trigger-width)] overflow-y-auto overscroll-contain scroll-my-1"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  variant = "default",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item> & {
  variant?: SelectVariant
}) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      data-variant={variant}
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2 pr-9 select-none",
        itemVariantClass[variant],
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
        {children}
      </SelectPrimitive.ItemText>
      <span
        data-slot="select-item-indicator"
        className="absolute top-1/2 right-2.5 flex size-4 -translate-y-1/2 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon aria-hidden="true" className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
