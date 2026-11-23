## 1. Push navigations only

- [x] 1.1 `pageTransition.ts`: the push-depth table, `navDirection` gives `none` between list views and pushed pages of the same depth, and `showRouteChange` applies a `none` change at once (`pageTransition.test.ts`: list to list, by click and by history, calls no view transition; task, Settings and back still slide)
- [x] 1.2 `index.css`: the comment no longer promises a cross-fade (`npm test`, `npm run build` in web/)
- [ ] 1.3 `perf.yml` on the branch: phone `saved-view` and the desktop Notes budgets pass
