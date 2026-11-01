// The built-in catalogue (OpenSpec change theme-catalogue, design D6): the palettes'
// ids, names, kinds, families, credits and preview swatches, without their documents,
// which load one by one through lib/theme/load.ts. Lazy: Settings › Appearance loads
// it; the first load never does. Generated from catalogue/palettes.ts and the
// documents by catalogue.test.ts (UPDATE_CATALOGUE=1); do not edit by hand.
import type { BuiltinTheme } from '../choice'
export { default as creditsUrl } from './CREDITS.md?url'

export interface CatalogueTheme extends BuiltinTheme {
  name: string
  /** The family a light and dark pair shares, and the other side's theme. */
  family: string
  counterpart?: string
  author: string
  licence: string
  /** The copyright line of the project's licence, verbatim. */
  copyright: string
  /** The project's address, shown as text. */
  source: string
  /** Some published colours were adapted for contrast (the document's notes.adapted). */
  adapted?: true
  swatches: { canvas: string; surface: string; text: string; accent: string; hues: readonly string[] }
}

export const CATALOGUE: readonly CatalogueTheme[] = [
  {
    "id": "solarized-light",
    "kind": "light",
    "name": "Solarized Light",
    "family": "solarized",
    "counterpart": "solarized-dark",
    "author": "Ethan Schoonover",
    "licence": "MIT",
    "copyright": "Copyright (c) 2011 Ethan Schoonover",
    "source": "https://github.com/altercation/solarized",
    "adapted": true,
    "swatches": {
      "canvas": "#eee8d5",
      "surface": "#fdf6e3",
      "text": "#556b73",
      "accent": "#006cac",
      "hues": [
        "#009942",
        "#268bd2",
        "#8d62f2",
        "#cb4b16"
      ]
    }
  },
  {
    "id": "solarized-dark",
    "kind": "dark",
    "name": "Solarized Dark",
    "family": "solarized",
    "counterpart": "solarized-light",
    "author": "Ethan Schoonover",
    "licence": "MIT",
    "copyright": "Copyright (c) 2011 Ethan Schoonover",
    "source": "https://github.com/altercation/solarized",
    "adapted": true,
    "swatches": {
      "canvas": "#002b36",
      "surface": "#002b36",
      "text": "#95a6a8",
      "accent": "#097cc1",
      "hues": [
        "#0ea253",
        "#2f92da",
        "#9b72ff",
        "#e76535"
      ]
    }
  },
  {
    "id": "gruvbox-light",
    "kind": "light",
    "name": "Gruvbox Light",
    "family": "gruvbox",
    "counterpart": "gruvbox-dark",
    "author": "Pavel Pertsev",
    "licence": "MIT",
    "copyright": "Copyright (c) 2018 Pavel Pertsev",
    "source": "https://github.com/morhetz/gruvbox",
    "adapted": true,
    "swatches": {
      "canvas": "#f2e5bc",
      "surface": "#fbf1c7",
      "text": "#3c3836",
      "accent": "#366f4d",
      "hues": [
        "#007d35",
        "#2c5fcc",
        "#6f4bc3",
        "#af3a03"
      ]
    }
  },
  {
    "id": "gruvbox-dark",
    "kind": "dark",
    "name": "Gruvbox Dark",
    "family": "gruvbox",
    "counterpart": "gruvbox-light",
    "author": "Pavel Pertsev",
    "licence": "MIT",
    "copyright": "Copyright (c) 2018 Pavel Pertsev",
    "source": "https://github.com/morhetz/gruvbox",
    "adapted": true,
    "swatches": {
      "canvas": "#1d2021",
      "surface": "#282828",
      "text": "#ebdbb2",
      "accent": "#8ec07c",
      "hues": [
        "#00ca67",
        "#68acff",
        "#ae94ff",
        "#fe8019"
      ]
    }
  },
  {
    "id": "catppuccin-latte",
    "kind": "light",
    "name": "Catppuccin Latte",
    "family": "catppuccin",
    "counterpart": "catppuccin-mocha",
    "author": "Catppuccin",
    "licence": "MIT",
    "copyright": "Copyright (c) 2021 Catppuccin",
    "source": "https://github.com/catppuccin/catppuccin",
    "adapted": true,
    "swatches": {
      "canvas": "#e6e9ef",
      "surface": "#eff1f5",
      "text": "#4c4f69",
      "accent": "#8231e8",
      "hues": [
        "#389922",
        "#1e66f5",
        "#8839ef",
        "#e55800"
      ]
    }
  },
  {
    "id": "catppuccin-mocha",
    "kind": "dark",
    "name": "Catppuccin Mocha",
    "family": "catppuccin",
    "counterpart": "catppuccin-latte",
    "author": "Catppuccin",
    "licence": "MIT",
    "copyright": "Copyright (c) 2021 Catppuccin",
    "source": "https://github.com/catppuccin/catppuccin",
    "adapted": true,
    "swatches": {
      "canvas": "#181825",
      "surface": "#1e1e2e",
      "text": "#cdd6f4",
      "accent": "#cba6f7",
      "hues": [
        "#a6e3a1",
        "#89b4fa",
        "#cba6f7",
        "#fab387"
      ]
    }
  },
  {
    "id": "rose-pine-dawn",
    "kind": "light",
    "name": "Rosé Pine Dawn",
    "family": "rose-pine",
    "counterpart": "rose-pine",
    "author": "Rosé Pine",
    "licence": "MIT",
    "copyright": "Copyright (c) 2023 Rosé Pine",
    "source": "https://github.com/rose-pine/rose-pine-theme",
    "adapted": true,
    "swatches": {
      "canvas": "#faf4ed",
      "surface": "#fffaf3",
      "text": "#575279",
      "accent": "#75608d",
      "hues": [
        "#39a055",
        "#286983",
        "#907aa9",
        "#d1663d"
      ]
    }
  },
  {
    "id": "rose-pine",
    "kind": "dark",
    "name": "Rosé Pine",
    "family": "rose-pine",
    "counterpart": "rose-pine-dawn",
    "author": "Rosé Pine",
    "licence": "MIT",
    "copyright": "Copyright (c) 2023 Rosé Pine",
    "source": "https://github.com/rose-pine/rose-pine-theme",
    "adapted": true,
    "swatches": {
      "canvas": "#191724",
      "surface": "#1f1d2e",
      "text": "#e0def4",
      "accent": "#c4a7e7",
      "hues": [
        "#53ca7a",
        "#3a7c97",
        "#c4a7e7",
        "#f7903c"
      ]
    }
  },
  {
    "id": "tokyo-night-light",
    "kind": "light",
    "name": "Tokyo Night Light",
    "family": "tokyo-night",
    "counterpart": "tokyo-night",
    "author": "Enkia",
    "licence": "MIT",
    "copyright": "Copyright (c) 2018-present Enkia",
    "source": "https://github.com/enkia/tokyo-night-vscode-theme",
    "adapted": true,
    "swatches": {
      "canvas": "#d6d8df",
      "surface": "#e6e7ed",
      "text": "#343b59",
      "accent": "#2959aa",
      "hues": [
        "#00722f",
        "#2959aa",
        "#7b43ba",
        "#965027"
      ]
    }
  },
  {
    "id": "tokyo-night",
    "kind": "dark",
    "name": "Tokyo Night",
    "family": "tokyo-night",
    "counterpart": "tokyo-night-light",
    "author": "Enkia",
    "licence": "MIT",
    "copyright": "Copyright (c) 2018-present Enkia",
    "source": "https://github.com/enkia/tokyo-night-vscode-theme",
    "adapted": true,
    "swatches": {
      "canvas": "#16161e",
      "surface": "#1a1b26",
      "text": "#a9b1d6",
      "accent": "#7aa2f7",
      "hues": [
        "#54ce7d",
        "#7aa2f7",
        "#bb9af7",
        "#ff9e64"
      ]
    }
  },
  {
    "id": "one-light",
    "kind": "light",
    "name": "One Light",
    "family": "one",
    "counterpart": "one-dark",
    "author": "GitHub Inc.",
    "licence": "MIT",
    "copyright": "Copyright (c) 2016 GitHub Inc.",
    "source": "https://github.com/atom/one-light-syntax",
    "adapted": true,
    "swatches": {
      "canvas": "#fafafa",
      "surface": "#fafafa",
      "text": "#383a42",
      "accent": "#2c62da",
      "hues": [
        "#50a14f",
        "#4078f2",
        "#a626a4",
        "#986801"
      ]
    }
  },
  {
    "id": "one-dark",
    "kind": "dark",
    "name": "One Dark",
    "family": "one",
    "counterpart": "one-light",
    "author": "GitHub Inc.",
    "licence": "MIT",
    "copyright": "Copyright (c) 2016 GitHub Inc.",
    "source": "https://github.com/atom/one-dark-syntax",
    "adapted": true,
    "swatches": {
      "canvas": "#282c34",
      "surface": "#282c34",
      "text": "#abb2bf",
      "accent": "#6cbafb",
      "hues": [
        "#98c379",
        "#61afef",
        "#c678dd",
        "#d19a66"
      ]
    }
  },
  {
    "id": "nord",
    "kind": "dark",
    "name": "Nord",
    "family": "nord",
    "author": "Sven Greb",
    "licence": "MIT",
    "copyright": "Copyright (c) 2016-present Sven Greb <development@svengreb.de> (https://www.svengreb.de)",
    "source": "https://github.com/nordtheme/nord",
    "adapted": true,
    "swatches": {
      "canvas": "#2e3440",
      "surface": "#2e3440",
      "text": "#d8dee9",
      "accent": "#90c8d8",
      "hues": [
        "#69be81",
        "#8caccc",
        "#af9cf0",
        "#e1967f"
      ]
    }
  },
  {
    "id": "dracula",
    "kind": "dark",
    "name": "Dracula",
    "family": "dracula",
    "author": "Dracula Theme",
    "licence": "MIT",
    "copyright": "Copyright (c) 2023 Dracula Theme",
    "source": "https://github.com/dracula/dracula-theme",
    "adapted": true,
    "swatches": {
      "canvas": "#282a36",
      "surface": "#282a36",
      "text": "#f8f8f2",
      "accent": "#c7a0ff",
      "hues": [
        "#50fa7b",
        "#9ac7ff",
        "#bd93f9",
        "#ffb86c"
      ]
    }
  }
]
