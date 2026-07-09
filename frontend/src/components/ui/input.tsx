import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-border-strong bg-card px-3 py-1 text-sm text-foreground",
        "placeholder:text-faint focus-visible:outline-none focus-visible:border-primary",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
