// The upgrade fixture a minor release needs (OpenSpec change stability-contract,
// design D4): internal/store/testdata/upgrade/<major.minor>/, the data directory
// that version writes in the fixed scenario, which every later server must
// upgrade (internal/tenant TestUpgradeFromEveryRelease). Read by prepare.mjs
// (make release-prepare); built by scripts/release/upgrade-fixture.sh.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function fixtureDir(version) {
  return `internal/store/testdata/upgrade/${version.split('.').slice(0, 2).join('.')}`
}

/** Whether a release of `version` after `from` starts a new minor (x.y.0). */
export function isNewMinor(version, from) {
  const [maj, min, patch] = version.split('.').map(Number)
  const [fmaj, fmin] = from.split('.').map(Number)
  return patch === 0 && (maj !== fmaj || min !== fmin)
}

/** Throws when a new minor release has no upgrade fixture, or one for another version. */
export function checkUpgradeFixture(root, version, from) {
  if (!isNewMinor(version, from)) return
  const dir = fixtureDir(version)
  const hint = `build it with \`scripts/release/upgrade-fixture.sh ${version} HEAD\` from the commit being released, and commit it`
  if (!existsSync(join(root, dir, 'manifest.json')) || !existsSync(join(root, dir, 'data.tar.gz'))) {
    throw new Error(`a minor release needs its upgrade fixture ${dir}/: ${hint}`)
  }
  const m = JSON.parse(readFileSync(join(root, dir, 'manifest.json'), 'utf8'))
  if (fixtureDir(m.version ?? '') !== dir) throw new Error(`${dir}/manifest.json is for ${m.version}, not ${version}: ${hint}`)
}
