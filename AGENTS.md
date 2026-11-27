# AGENTS — mobile-react

Contexto canônico (qualquer IA):  
**https://github.com/Project-FieldCore/docs/blob/main/AGENTS.md**

## Expo

**Expo HAS CHANGED.** Leia a documentação versionada exata em
https://docs.expo.dev/versions/v57.0.0/ antes de escrever qualquer código.

## Este repositório

- Stack: Expo + React Native + TypeScript (app na raiz do repositório)
- Branch de integração: `develop`
- CI local: [docs/CI.md](docs/CI.md) → na raiz: `npm ci && npm run lint && npm run typecheck`
- Estrutura: `src/app/(public)|(protected)`, `src/features/`, `src/design-system/`
- Título de PR: `[PBI-XXXX] …` ou `[PBI-XXXX.N] …`

Não duplique regras de produto aqui. Instruções de um vendor específico devem
apenas referenciar o `AGENTS.md` do repo `docs`.
