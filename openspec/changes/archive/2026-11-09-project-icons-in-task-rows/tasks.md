## 1. Implement and verify

- [x] Add a failing TaskRow regression for a configured icon in both row layouts. Check the existing dot fallback and the accessible project name. Share the project marker and rerun TaskRow and project icon tests.
- [x] Cover the icon and the dot in a dedicated Storybook example for both row layouts. Verify desktop and mobile, including the One line phone fallback, and generate its baselines in the pinned Playwright image.
- [x] Update the projects and interface guides and add the changelog fragment. Run `make docs`, `make docs-check` and `make openspec-validate`.
- [x] Run `make check` (including frontend tests), build the local preview, and capture before/after screenshots using the same demo data and layouts.

## 2. Prepare the pull request after local review

- [x] Archive the verified change, validate the final diff, and prepare the PR description and screenshots for attachment. Reference point 3 of #1089.
