// The guide's screenshots show the interface that ships (OpenSpec change
// docs-1-0, design D7): from 1.0.0, release preparation refuses a release whose
// newest screenshot under docs/images/ was committed before the last commit
// that touched web/src/app. `make docs-screenshots` regenerates them.
import { execFileSync } from 'node:child_process'

export const FIRST_GATED_MAJOR = 1
export const SHOTS = 'docs/images/*.webp'
export const APP = 'web/src/app'

/** The commit time (Unix seconds) of the last commit touching `pathspec` in `root`, or 0. */
export function lastCommitTime(root, pathspec) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', pathspec], { cwd: root, encoding: 'utf8' }).trim()
    return out ? Number(out) : 0
  } catch {
    return 0
  }
}

/** Throws when a release of `version` would ship screenshots older than the app. */
export function checkScreenshotFreshness(root, version, commitTime = lastCommitTime) {
  if (Number(version.split('.')[0]) < FIRST_GATED_MAJOR) return
  const shots = commitTime(root, SHOTS)
  const app = commitTime(root, APP)
  if (!app) return
  if (shots < app) {
    const day = (s) => (s ? new Date(s * 1000).toISOString().slice(0, 10) : 'never')
    throw new Error(`docs/images: the newest screenshot was committed ${day(shots)}, before the last change to ${APP} (${day(app)}); run \`make docs-screenshots\` and commit the images`)
  }
}
