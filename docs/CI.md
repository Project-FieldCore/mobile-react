# CI — mobile-react

Pipeline mínimo de qualidade no GitHub Actions (`.github/workflows/ci.yml`).

O app Expo vive em `fieldops-mobile/`; o workflow usa `working-directory: fieldops-mobile`.

## O que roda

Em todo `pull_request` e em push para `develop` / `main`:

1. `npm ci`
2. `npm run lint` — ESLint (`eslint-config-expo`)
3. `npm run typecheck` — `tsc --noEmit`

**Não** inclui EAS Build / emulador — só lint e tipos. Actions pinadas por SHA; cache npm. Node **22** (LTS).

## Local

```bash
cd fieldops-mobile
npm ci
npm run lint
npm run typecheck
```

Convenção global dos 3 repos de código: [CI_CONVENTION.md](https://github.com/Project-FieldCore/docs/blob/main/PROJECT_MANAGEMENT/CI_CONVENTION.md).
