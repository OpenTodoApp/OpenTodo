# New or changed visual baselines

The baselines of the UI check live on the `ui-baselines` branch, not here, so main's
history doesn't grow with every new copy of every image. Put only the PNGs your pull
request adds or changes in this folder (from `make ui-baselines`, the UI baselines
workflow or the CI report's `*-actual.png`, named `<story-id>--<theme>-<width>.png`); the
check lays them over the branch's set. After the pull request merges, the UI baselines
workflow moves them to the branch and removes them from main. See "Updating baselines"
in docs/design-system.md.
