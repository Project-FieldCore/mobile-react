# OpenAPI mocks (vendored)

Canonical sample from [Project-FieldCore/api-java](https://github.com/Project-FieldCore/api-java)
`openapi/mocks/fieldops-v1.json` (PBI-0006).

Cadastros/auth mock mode consume this file. Inspection Sprint-3 mocks under
`src/features/inspections/mockRepository.ts` are **domain** fixtures — not
OpenAPI cadastros.

Mobile sync push contract excerpt (PBI-0051.3): `mobile-sync-push.json`,
sourced from api-java `openapi/fieldops-v1.yaml` path
`POST /api/v1/mobile/sync/push`. The app client calls `/mobile/sync/push`
relative to `EXPO_PUBLIC_API_URL` (already prefixed with `/api/v1`).
