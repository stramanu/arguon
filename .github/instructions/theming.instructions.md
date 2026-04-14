---
description: Theming rules for Arguon Angular components. Covers Tailwind CSS v4 semantic tokens, dark/light mode, and ng-primitives styling with data attributes.
applyTo: "apps/web/**"
---

# Theming — Tailwind CSS v4 + ng-primitives

Arguon uses class-based dark mode with Tailwind CSS v4 semantic tokens. All components **must** be theme-aware from the start.

## Architecture

| Layer | File | Purpose |
|---|---|---|
| Design tokens | `src/styles.scss` `@theme { }` | Defines semantic color CSS custom properties |
| Dark overrides | `src/styles.scss` `.dark { }` | Overrides token values when `.dark` class is on `<html>` |
| Custom variant | `@custom-variant dark (…)` | Enables `dark:` prefix in Tailwind utilities |
| State service | `core/theme.service.ts` | Signal-based, persists to `localStorage`, respects `prefers-color-scheme` |
| Toggle UI | `shared/theme-toggle/` | `NgpSwitch` component in the app footer |

## Golden Rules

### 1. Use semantic color tokens — NEVER hardcode hex or Tailwind palette colors

```html
<!-- ✅ CORRECT — adapts to light/dark automatically -->
<div class="bg-surface text-text border-border">…</div>

<!-- ❌ WRONG — breaks in dark mode -->
<div class="bg-white text-gray-900 border-gray-200">…</div>
```

### 2. Available semantic tokens

These map to Tailwind utility classes (e.g. `bg-surface`, `text-text-muted`, `border-error-border`):

| Token | Light | Dark | Usage |
|---|---|---|---|
| `primary` | `#285A48` | `#408A71` | CTA buttons, active tabs, links |
| `primary-hover` | `#091413` | `#B0E4CC` | Hover state of primary |
| `primary-light` | `#B0E4CC` | `#091413` | Subtle primary backgrounds |
| `primary-text` | `#285A48` | `#B0E4CC` | Primary-colored text |
| `surface` | `#ffffff` | `#091413` | Page/card backgrounds |
| `surface-hover` | `#f5faf8` | `#0f2420` | Hover state of surfaces |
| `surface-alt` | `#eef6f2` | `#132e27` | Alternate/secondary surfaces |
| `border` | `#d1e5db` | `#285A48` | Default borders |
| `border-light` | `#e8f3ed` | `#132e27` | Subtle dividers |
| `text` | `#091413` | `#e8f3ed` | Primary text |
| `text-secondary` | `#1a3d30` | `#B0E4CC` | Secondary text |
| `text-muted` | `#5a7d6e` | `#6fa68e` | Muted/tertiary text |
| `text-faint` | `#8baa9c` | `#408A71` | Faintest text (placeholders) |
| `error` / `error-bg` / `error-border` | reds | dark reds | Error states |
| `success` / `success-bg` | greens | dark greens | Success states |
| `warning` / `warning-bg` | ambers | dark ambers | Warning states |
| `danger` / `danger-bg` | reds | dark reds | Danger/destructive |
| `ai` / `ai-bg` | purples | dark purples | AI-generated content |
| `tag` / `tag-bg` | greens | dark greens | Tags and badges |

### 3. When you genuinely need a fixed color, use `dark:` variant

Some elements need a fixed color that does not come from tokens (e.g. a white switch thumb):

```html
<!-- switch thumb stays white in both themes — that's intentional -->
<span class="bg-white"></span>

<!-- if light needs white and dark needs something else, use dark: -->
<span class="bg-white dark:bg-slate-200"></span>
```

Use `dark:` **only** when semantic tokens don't cover the case. The `dark:` variant is configured via `@custom-variant dark (&:where(.dark, .dark *))` in `styles.scss`.

### 4. Active/selected states: invert with `text` + `surface`

For toggle-style active states (sort buttons, toggleable pills), use the text color as background and surface as text:

```html
<button
  class="bg-surface text-text-muted border-border"
  [class.!bg-text]="isActive()"
  [class.!text-surface]="isActive()"
  [class.!border-text]="isActive()"
>Label</button>
```

This creates a natural inversion in both themes.

### 5. Primary accent buttons always use `text-white`

For buttons with `bg-primary`, use `text-white` (not `text-surface`) because the primary green always needs white text for contrast:

```html
<button class="bg-primary text-white border-primary hover:bg-primary-hover">
  Submit
</button>
```

## ng-primitives Data-Attribute Styling

ng-primitives components expose state via `data-*` attributes. Use Tailwind's `data-[attr]:` selector to style them:

```html
<!-- NgpToggle — selected state -->
<button
  ngpToggle
  class="bg-surface border-border data-[selected]:bg-primary data-[selected]:text-white data-[selected]:border-primary"
>Tag</button>

<!-- NgpSwitch — checked state -->
<button
  ngpSwitch
  class="bg-surface-alt border-border data-[checked]:bg-primary data-[checked]:border-primary"
>
  <span ngpSwitchThumb class="bg-white data-[checked]:translate-x-[1.25rem]"></span>
</button>

<!-- NgpButton — disabled state (also handled globally in styles.scss) -->
<button ngpButton class="bg-primary text-white data-[disabled]:opacity-60">Save</button>

<!-- NgpTabButton — active tab -->
<button
  ngpTabButton
  class="text-text-muted data-[active]:text-primary data-[active]:border-b-2 data-[active]:border-primary"
>Tab</button>
```

### Common data attributes from ng-primitives

| Attribute | Meaning | Used by |
|---|---|---|
| `data-selected` | Currently selected | `NgpToggle` |
| `data-checked` | Checked/on | `NgpSwitch`, `NgpCheckbox` |
| `data-active` | Active tab | `NgpTabButton` |
| `data-disabled` | Disabled | All primitives |
| `data-focus-visible` | Keyboard focus | All primitives |
| `data-hover` | Hover state | All primitives |
| `data-pressed` | Being pressed | `NgpButton`, `NgpToggle` |

## Component Template

When creating a new component, follow this pattern:

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';

@Component({
  selector: 'app-example',
  imports: [NgpButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-[680px] mx-auto">
      <h1 class="text-2xl font-bold text-text mb-4">Title</h1>

      <div class="p-4 bg-surface border border-border rounded-lg">
        <p class="text-text-secondary text-sm">Body text</p>
        <span class="text-text-muted text-xs">Muted detail</span>
      </div>

      @if (error()) {
        <div class="p-4 bg-error-bg border border-error-border rounded-lg text-error" role="alert">
          {{ error() }}
        </div>
      }

      <button
        ngpButton
        class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
      >Primary action</button>

      <button
        ngpButton
        class="px-4 py-2 bg-surface text-text-secondary border border-border rounded-lg hover:bg-surface-hover"
      >Secondary action</button>
    </div>
  `,
})
export class ExampleComponent {
  protected readonly error = signal<string | null>(null);
}
```

## Checklist — Before Committing a Component

- [ ] Zero hardcoded `bg-white`, `bg-gray-*`, `text-gray-*`, `border-gray-*` — use semantic tokens
- [ ] Interactive elements use ng-primitives directives (`ngpButton`, `ngpToggle`, etc.)
- [ ] State styling uses `data-[attr]:` selectors, not manual class toggling
- [ ] Error/success/warning states use the corresponding semantic token pairs
- [ ] Component looks correct in **both** light and dark mode (toggle with the footer switch)
