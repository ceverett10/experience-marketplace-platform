# UI Components (`@experience-marketplace/ui-components`)

Shared React component library. Tailwind CSS + CVA (Class Variance Authority).

## Components

### Button

- Variants: default, destructive, outline, secondary, ghost, link
- Sizes: default (h-9), sm (h-8), lg (h-10), icon (h-9 w-9)

### Card Suite

`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`

## Utilities

`cn()` — Merges Tailwind classes using `clsx` + `tailwind-merge`. Resolves conflicts intelligently.

## Patterns

- All components use `React.forwardRef` for DOM access
- `displayName` set for debugging
- `VariantProps` from CVA for type-safe variants
- Composition-first design (Card components nest together)
- CSS variables for theming: `--primary`, `--secondary`, `--accent`, etc.

## Downstream Consumers

Used by: website-platform, admin
