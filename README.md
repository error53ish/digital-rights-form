# Digital Rights Form

A browser-only app that lets artists fill out a **Certificate of Authenticity & Digital Rights Statement** and download it as a PDF to hand out with their artwork.

Nothing is uploaded. The artwork file is read locally to make a thumbnail and a SHA-256 fingerprint, and the PDF is generated in the browser with [pdf-lib](https://pdf-lib.js.org/).

## Running it

```sh
npm install
npm run dev      # local dev server
npm run build    # static site in dist/ (deploy to any static host)
```

## Deploying

The live site is at <https://clawmark-coa.error53ish-cloudflare.workers.dev>. It's hosted as a static-assets Cloudflare Worker, configured in `wrangler.jsonc`. To publish changes:

```sh
npx wrangler login   # first time only
npm run deploy       # builds, then uploads dist/
```

## What the certificate includes

- **Certificate number and issue date.** The number is generated automatically (`COA-YYYYMMDD-XXXXXX`).
- **Artwork:** title, edition, date, medium, dimensions, creation method (including AI-assisted or AI-generated disclosure), tools, description, thumbnail, and the SHA-256 fingerprint of the original file.
- **Artist** and **recipient** details. Leave the recipient blank to make it out to "the holder".
- **Rights granted:** one of four license types (personal, non-exclusive commercial, exclusive, full copyright assignment), plus a list of permitted and prohibited uses, territory, term, attribution, and free-form terms.
- **Statement of authenticity**, the artist's signature (drawn or typed), and a blank line for the holder to sign.

## Code layout

| File | Purpose |
| --- | --- |
| `index.html` | The form |
| `src/main.ts` | Form wiring, file hashing and thumbnail, validation, download and preview |
| `src/pdf.ts` | PDF layout and generation |
| `src/types.ts` | Form data shape, license types, permission and prohibition lists, presets |
| `src/signature.ts` | Signature drawing pad |

### Branding

The Clawmark Prints logo is in `src/assets/`:

- `clawmark-logo-original.png` is the full-size transparent source.
- `clawmark-logo.png` is a trimmed 512px copy. It's used in light mode and in the PDF's "brought to you by" note.
- `clawmark-logo-dark.png` is the same copy with the black "CLAW MARK" lettering turned light, for dark mode.
- `public/favicon.png` is the browser tab icon.

If the logo changes, regenerate these files from the new source.

To change the wording of a permission or add a new one, edit `PERMISSIONS`, `PROHIBITIONS`, or `LICENSE_PRESETS` in `src/types.ts`. The form and PDF both update automatically. The license text itself is in `rightsStatement()` in `src/pdf.ts`.

## Known limitations

- The PDF uses the built-in Helvetica font, which only covers Western European characters. Emoji and non-Latin scripts (e.g. Japanese, Arabic) are dropped. Supporting them means embedding a Unicode TTF with `@pdf-lib/fontkit`.
- The license wording is a general template, not legal advice.
