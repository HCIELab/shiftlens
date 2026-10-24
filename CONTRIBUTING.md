# Contributing

ShiftLens is maintained as a standalone browser application. Contributions should keep the curve → surface/lens → mechanism/images → simulation/export workflow connected.

## Set up

Use Node.js 22.13+ and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Run the test suite and production build before submitting changes. Geometry tests use Manifold WebAssembly and can take about a minute, depending on the machine.

## Change the shared model first

- Use the same motion and image-state model for placement previews, visible parts, collision checks and exports. Avoid display-only corrections that disagree with fabricated output.
- Preserve millimeter units and original CAD object identities. Record fitted dimensions and measured source repairs in `docs/native-mechanisms.md`.
- Add a regression case when fixing a geometry, encoding, saved-project or export bug. Include a custom curve when a bug depends on surface shape.
- Keep uploaded images local. Do not add remote uploads, analytics or external services as an incidental part of a change.
- Keep the application runnable without Rhino, Grasshopper, private folders or local absolute paths.

For interface changes, check the three-step workflow on both a new design and an example. Verify placement cancellation, invalid locations, direct mechanism interaction, image-state previews, playback, save/open and affected exports. Inspect a narrow viewport as well as desktop layout.

## Report a bug

Include:

1. The surface family and mechanism, plus the steps needed to reproduce the problem.
2. Browser and operating system.
3. Expected behavior and actual behavior, ideally with a screenshot.
4. A minimal saved project if useful. Saved projects embed images: remove private images before attaching one to a public issue.
5. Collision/check messages and affected export files, when relevant.

A small XYZ point list often makes a geometry issue easier to reproduce than a screenshot alone.

## Licensing and assets

Code contributions are made under the repository's MIT license. Include provenance and redistribution terms for new artwork, CAD data or other assets. Do not assume the paper's publication license applies to separately supplied project assets.
