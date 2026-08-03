# Astro Starter Kit: Minimal

```sh
npm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 📷 Galería de /torneo (pestaña Fotos)

Las fotos viven en `public/galeria/` (grande) y `public/galeria/mini/` (miniatura), y la lista
que pinta la pestaña está en `src/lib/galeria.ts` (array `FOTOS`). Añadir fotos es añadir líneas
a ese array; mientras no haya fotos reales hay placeholders SVG.

Para meter fotos reales:

1. Deja las originales en `fotos-originales/` (carpeta **ignorada en git**, no se commitea).
   El nombre debe empezar por el año: `2023-01.jpg`, `2024-ambiente.png`… (del año sale la
   edición: 2023 → I, 2024 → II, 2025 → III).
2. Ejecuta:

   ```sh
   node scripts/optimizar-galeria.mjs
   ```

   Genera con `sharp` la grande (1600px máx, WebP q80) y la miniatura (400px, q75), y
   **reescribe el array `FOTOS` de `src/lib/galeria.ts`** con `ancho`/`alto` reales, ordenado
   por edición. No hay que escribir entradas a mano.
3. Retoca en `galeria.ts` los `pie` que quieras (son opcionales). Si vuelves a ejecutar el
   script, los pies ya escritos **se conservan** (se casan por `src`). Borra los SVG de
   placeholder de `public/galeria/` cuando ya no hagan falta.

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
