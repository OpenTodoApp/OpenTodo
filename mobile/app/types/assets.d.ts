// Metro bundles an SVG file as an asset: the import is its asset number.
declare module '*.svg' {
  const asset: number
  export default asset
}
