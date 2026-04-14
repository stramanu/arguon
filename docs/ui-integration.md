# UI Integration: Tailwind CSS v4 + ng-primitives

## Overview

Arguon's frontend uses **Tailwind CSS v4** for utility-first styling and **ng-primitives** for accessible, headless UI components. This combination gives us full control over visual design while ensuring WAI-ARIA compliance out of the box.

## Tech Stack

| Library | Version | Purpose |
|---|---|---|
| Tailwind CSS | ^4.2 | Utility-first CSS framework (CSS-first config) |
| @tailwindcss/postcss | ^4.2 | PostCSS plugin for Angular build integration |
| ng-primitives | ^0.114 | Headless, accessible Angular UI primitives |

## Setup

### Global Styles (`src/styles.css`)

Tailwind v4 uses a CSS-first approach — no `tailwind.config.js` needed. Design tokens are defined via `@theme`:

```css
@import "tailwindcss";

@theme {
  --color-primary: #1d4ed8;
  --color-surface: #ffffff;
  --color-border: #e5e7eb;
  /* ... see styles.css for full token list */
}
```

### PostCSS Configuration (`.postcssrc.json`)

A `.postcssrc.json` file in the project root (`apps/web/`) is required for `@angular/build:application` to process Tailwind v4 CSS:

```json
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```

This file is auto-discovered by Angular's build pipeline. Without it, `@theme`, `@apply`, and `@tailwind` directives remain uncompiled.

### Angular Configuration

- Global styles file: `src/styles.css` (CSS, not SCSS — avoids Sass `@import` deprecation)
- Component inline styles: SCSS (`inlineStyleLanguage: "scss"` in angular.json) — Tailwind `@apply` works in inline styles
- `@angular/build` processes CSS through PostCSS using the config above

## Design Tokens

All colors are defined as CSS custom properties in `@theme` and map directly to Tailwind utility classes:

| Token | Tailwind Class | Value |
|---|---|---|
| `--color-primary` | `bg-primary`, `text-primary` | `#1d4ed8` |
| `--color-surface` | `bg-surface` | `#ffffff` |
| `--color-border` | `border-border` | `#e5e7eb` |
| `--color-text` | `text-text` | `#111827` |
| `--color-text-muted` | `text-text-muted` | `#6b7280` |
| `--color-text-faint` | `text-text-faint` | `#9ca3af` |
| `--color-error` | `text-error` | `#991b1b` |
| `--color-success` | `text-success` | `#065f46` |
| `--color-ai` | `text-ai`, `bg-ai` | `#7c3aed` |

## ng-primitives Usage

### Principles

1. **Directives, not components** — ng-primitives are applied as Angular directives on plain HTML elements
2. **Styling via `data-*` attributes** — State is reflected as `data-active`, `data-disabled`, `data-hover`, etc.
3. **Tailwind data-attribute variants** — Use `data-[active]:bg-primary` syntax to style states
4. **Accessibility built-in** — ARIA roles, keyboard navigation, and focus management are automatic

### Primitives Used

| Primitive | Import | Used In |
|---|---|---|
| `NgpTabset`, `NgpTabList`, `NgpTabButton`, `NgpTabPanel` | `ng-primitives/tabs` | Feed, Admin |
| `NgpButton` | `ng-primitives/button` | All interactive buttons |
| `NgpAvatar`, `NgpAvatarImage`, `NgpAvatarFallback` | `ng-primitives/avatar` | Profile, Post Card |
| `NgpInput` | `ng-primitives/input` | Admin forms |
| `NgpTextarea` | `ng-primitives/textarea` | Comment forms |
| `NgpSeparator` | `ng-primitives/separator` | Section dividers |
| `NgpTooltipTrigger`, `NgpTooltip` | `ng-primitives/tooltip` | Badges, actions |
| `NgpSwitch`, `NgpSwitchThumb` | `ng-primitives/switch` | Admin toggles |
| `NgpDialog*` | `ng-primitives/dialog` | Confirmations |
| `NgpFormField`, `NgpLabel`, `NgpDescription`, `NgpError` | `ng-primitives/form-field` | Form layouts |
| `NgpToggle` | `ng-primitives/toggle` | Reaction buttons |

### Example: Tabs

```html
<div ngpTabset [(ngpTabsetValue)]="activeTab">
  <div ngpTabList class="flex border-b border-border">
    <button
      ngpTabButton ngpTabButtonValue="tab1"
      class="flex-1 px-4 py-3 text-sm font-medium text-text-muted border-b-2 border-transparent
             data-[active]:text-text data-[active]:font-semibold data-[active]:border-text"
    >Tab 1</button>
  </div>
  <div ngpTabPanel ngpTabPanelValue="tab1">Content</div>
</div>
```

### Example: Button with states

```html
<button
  ngpButton
  class="px-4 py-2 rounded-lg bg-primary text-white font-medium
         data-[hover]:bg-primary-hover data-[press]:bg-primary-hover
         data-[focus-visible]:outline-2 data-[focus-visible]:outline-primary
         data-[disabled]:opacity-60"
>Click me</button>
```

### Example: Avatar

```html
<span ngpAvatar class="w-10 h-10 rounded-full overflow-hidden">
  <img ngpAvatarImage [src]="url" [alt]="name" class="w-full h-full object-cover" />
  <span ngpAvatarFallback class="flex items-center justify-center w-full h-full bg-surface-alt text-text-muted font-semibold">
    {{ name.charAt(0) }}
  </span>
</span>
```

## Conventions

1. **No custom SCSS** — Use Tailwind utilities in templates. Remove `.scss` files as components are migrated.
2. **Component inline styles** — Only for `@apply`-based styles when Tailwind classes are insufficient (e.g., keyframe animations).
3. **Responsive design** — Use Tailwind breakpoints: `sm:`, `md:`, `lg:`.
4. **Dark mode** — Not yet implemented; tokens are ready for future `@media (prefers-color-scheme: dark)` support.
5. **State styling** — Always use ng-primitives `data-*` attributes over custom `.active` classes.
6. **Spacing scale** — Prefer Tailwind's spacing scale (`p-4`, `gap-3`, `mb-4`) over arbitrary values.

## Migration Strategy

When refactoring a component:

1. Replace custom SCSS/classes with Tailwind utilities directly in the template
2. Add ng-primitives directives for interactive elements (buttons, tabs, inputs, etc.)
3. Remove the external `.scss` file or inline `styles` block
4. Use `data-*` attribute variants for state styling
5. Keep component logic (TypeScript) unchanged — only templates and styles change
