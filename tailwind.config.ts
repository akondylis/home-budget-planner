import type { Config } from 'tailwindcss'

// Colour families whose shades read from CSS variables in
// src/renderer/src/assets/theme.css, so they flip with the `.dark` class.
// `white`, `black` and `neutral` stay literal (text on solid buttons).
const THEMED_FAMILIES = ['gray', 'blue', 'red', 'amber', 'green', 'yellow', 'purple', 'orange']
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const themedColors = Object.fromEntries(
  THEMED_FAMILIES.map(family => [
    family,
    Object.fromEntries(SHADES.map(shade => [shade, token(`${family}-${shade}`)])),
  ])
)

const config: Config = {
  darkMode: 'class',
  content: [
    './src/renderer/src/**/*.{ts,tsx}',
    './src/renderer/index.html',
  ],
  theme: {
    extend: {
      colors: {
        ...themedColors,
        bg: token('c-bg'),
        surface: token('c-surface'),
        'surface-2': token('c-surface-2'),
        'surface-hover': token('c-surface-hover'),
        'surface-input': token('c-surface-input'),
        // Status tones: bg-{tone} + text-{tone}-fg. `neutral` deep-merges with the
        // literal neutral-50…950 scale, which stays untouched.
        success: { DEFAULT: token('c-success-bg'), fg: token('c-success-fg') },
        danger: { DEFAULT: token('c-danger-bg'), fg: token('c-danger-fg') },
        warning: { DEFAULT: token('c-warning-bg'), fg: token('c-warning-fg') },
        neutral: { DEFAULT: token('c-neutral-bg'), fg: token('c-neutral-fg') },
        info: { DEFAULT: token('c-info-bg'), fg: token('c-info-fg') },
        line: token('c-border'),
        accent: token('c-accent'),
        'accent-fg': token('c-accent-fg'),
        fg: token('c-text-primary'),
        'fg-muted': token('c-text-secondary'),
        'fg-subtle': token('c-text-muted'),
        glass: token('c-glass'),
        chart: { income: token('c-chart-income'), expense: token('c-chart-expense') },
        toast: {
          DEFAULT: token('c-toast-bg'),
          fg: token('c-toast-fg'),
          action: token('c-toast-action'),
          'action-hover': token('c-toast-action-hover'),
        },
      },
    },
  },
  plugins: [],
}

export default config
