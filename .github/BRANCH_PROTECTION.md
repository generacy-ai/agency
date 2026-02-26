# Branch Protection Setup Checklist

One-time configuration in **GitHub repo settings > Branches > Branch protection rules**.

> The required status check name `CI Summary` must match exactly — it corresponds to the
> `ci-summary` job's `name:` field in `.github/workflows/ci.yml`.

## `main` branch

- [ ] Require pull request before merging
  - [ ] Required approvals: 1
  - [ ] Dismiss stale pull request approvals on new pushes
- [ ] Require status checks to pass before merging
  - [ ] Required check: `CI Summary`
- [ ] Require branches to be up to date before merging
- [ ] Enforce for administrators (recommended)

## `develop` branch

- [ ] Require status checks to pass before merging
  - [ ] Required check: `CI Summary`
- [ ] Do NOT require pull request reviews
- [ ] Do NOT enforce for administrators
