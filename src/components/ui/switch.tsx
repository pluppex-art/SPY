import * as React from "react"
import { cn } from "../../lib/utils"
import { HelpTip } from "./help-tip"

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  size?: "sm" | "default" | "lg"
  label?: string
  description?: string
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, onChange, disabled, size = "default", label, description, id, ...props }, ref) => {
    const generatedId = React.useId()
    const switchId = id || generatedId

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return
      onChange?.(e)
      onCheckedChange?.(e.target.checked)
    }

    const sizeClasses = {
      sm: {
        track: "w-8 h-4",
        thumb: "w-3 h-3 translate-x-0.5",
        thumbChecked: "translate-x-4",
      },
      default: {
        track: "w-11 h-6",
        thumb: "w-4 h-4 translate-x-1",
        thumbChecked: "translate-x-6",
      },
      lg: {
        track: "w-14 h-7",
        thumb: "w-5 h-5 translate-x-1",
        thumbChecked: "translate-x-8",
      },
    }

    const currentSize = sizeClasses[size]

    return (
      <div className={cn("inline-flex items-center gap-3", className)}>
        <label
          htmlFor={switchId}
          className={cn(
            "relative inline-flex items-center cursor-pointer select-none",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <input
            type="checkbox"
            id={switchId}
            ref={ref}
            checked={checked}
            onChange={handleChange}
            disabled={disabled}
            className="sr-only peer"
            {...props}
          />
          <div
            className={cn(
              "relative rounded-full transition-colors duration-200 ease-in-out border",
              currentSize.track,
              checked
                ? "bg-[var(--color-primary-blue)] border-[var(--color-primary-blue)] shadow-sm shadow-[var(--color-primary-blue)]/20"
                : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] hover:border-[var(--color-border-default)]/80",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-primary-blue)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--color-surface)]"
            )}
          >
            <span
              className={cn(
                "absolute top-1/2 -translate-y-1/2 bg-white rounded-full transition-transform duration-200 ease-in-out shadow-sm block",
                currentSize.thumb,
                checked && currentSize.thumbChecked
              )}
            />
          </div>
        </label>
        {label && (
          <label htmlFor={switchId} className="cursor-pointer select-none">
            <span className="text-xs font-semibold text-[var(--color-text-primary)] block">
              {label}
            </span>
          </label>
        )}
        {description && <HelpTip label={typeof label === "string" ? `Ajuda sobre ${label}` : "Ajuda"}>{description}</HelpTip>}
      </div>
    )
  }
)

Switch.displayName = "Switch"

export { Switch }

