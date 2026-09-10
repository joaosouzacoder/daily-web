import * as React from "react"
import { cn } from "@/lib/utils"

const inputClass =
  "flex h-9 w-full min-w-0 rounded-full border bg-glass px-4 py-1 text-base shadow-e1 backdrop-blur-sm transition-[color,box-shadow] outline-none placeholder:text-ink-dim disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputClass, className)}
      {...props}
    />
  )
}

export { Input, inputClass }
