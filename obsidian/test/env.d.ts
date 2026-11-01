// The shared web modules the plugin imports are type-checked with the types the
// web app compiles them with (import.meta.env, import.meta.glob); the plugin
// bundle replaces the modules that use them (esbuild.config.mjs).
/// <reference path="../../web/node_modules/vite/client.d.ts" />
