// The version this build is, inlined by vite.config.ts's `define` so the app carries the
// number and not package.json — whose scripts and devDependencies the workbench test
// refuses to see in the bundle, and whose weight the bundle budget counts.
declare const __APP_VERSION__: string
