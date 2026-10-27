# mobile-react

Aplicativo mobile da plataforma **FieldOps** (org FieldCore), destinado aos técnicos de campo para execução de inspeções técnicas, com suporte a operação offline e sincronização com o servidor.

Este repositório contém a aplicação mobile construída com **Expo + React Native + TypeScript**. Faz parte de um ecossistema com [web-react](https://github.com/Project-FieldCore/web-react), [api-java](https://github.com/Project-FieldCore/api-java) e [docs](https://github.com/Project-FieldCore/docs).

## Documentação e convenções

- Assistentes de IA: [docs/AGENTS.md](https://github.com/Project-FieldCore/docs/blob/main/AGENTS.md) · [AGENTS.md](AGENTS.md)
- Hub: [Project-FieldCore/docs](https://github.com/Project-FieldCore/docs)
- Branches, commits, issues e PRs: [BRANCH_COMMIT_CONVENTION.md](https://github.com/Project-FieldCore/docs/blob/main/PROJECT_MANAGEMENT/BRANCH_COMMIT_CONVENTION.md)
- Base de integração neste repo: `develop`

---

## 📱 Sobre o produto

O FieldCoregit  substitui formulários impressos, planilhas e mensagens por um fluxo digital integrado de inspeções em campo. Neste app, o técnico consulta as inspeções atribuídas, identifica equipamentos por QR Code, responde checklists dinâmicos, registra evidências (fotos), localização e não conformidades — inclusive em locais sem conexão com a internet.

---

## 🧱 Stack técnica

| Camada | Tecnologia |
|---|---|
| Framework | Expo + React Native |
| Linguagem | TypeScript |
| Navegação | Expo Router |
| Dados remotos | TanStack Query |
| Persistência local | SQLite |
| Estado de UI/sessão | Zustand |
| Formulários | React Hook Form |
| Validação | Zod |
| Armazenamento seguro | Expo Secure Store |
| Câmera e QR Code | Expo Camera / Barcode Scanner |
| Localização | Expo Location |
| Build e distribuição | EAS Build |

---

## 📂 Estrutura de pastas

```
src/
├── app/                      # Rotas do Expo Router
│   ├── (public)/              # login
│   └── (protected)/           # tabs e telas autenticadas
├── features/                 # Organização por capacidade de negócio
│   ├── auth/
│   ├── home/
│   ├── inspections/
│   ├── checklist/
│   ├── evidence/
│   ├── scanner/
│   ├── location/
│   └── synchronization/
├── components/                # Componentes compartilhados
├── design-system/             # Tokens, tema e componentes visuais
├── application/               # Casos de uso e orquestração
├── domain/                    # Tipos e regras independentes de plataforma
├── infrastructure/
│   ├── api/                   # Cliente HTTP e serviços
│   ├── database/              # SQLite, migrações
│   ├── repositories/           # Acesso a dados local/remoto
│   ├── storage/                # Secure Store
│   └── sync/                   # Outbox, push/pull, cursor
├── hooks/
├── schemas/                    # Validações Zod
├── utils/
└── config/
```

> A base local (SQLite) não é um cache descartável — é a fonte de dados operacional do técnico enquanto offline.

---

## 🚀 Como rodar o projeto

### Pré-requisitos

- Node.js LTS
- npm ou yarn
- Expo CLI (`npm install -g expo-cli`) ou uso via `npx`
- Android Studio (emulador) ou dispositivo físico Android com Expo Go / build de desenvolvimento
- API do FieldCore rodando localmente ou apontada para o ambiente de integração (ver repositório da API)

### Instalação

```bash
git clone <url-do-repositorio>
cd fieldcore-mobile
npm install
```

### Configuração de ambiente

Crie um arquivo `.env` na raiz com base no `.env.example`:

```bash
cp .env.example .env
```

Variáveis principais:

```
EXPO_PUBLIC_API_URL=http://localhost:8080/api/v1
EXPO_PUBLIC_ENV=local
```

> Cada ambiente (local, integração, demonstração) deve possuir sua própria URL de API e configuração — nunca compartilhar credenciais entre ambientes.

### Executando localmente

```bash
npx expo start
```

- Pressione `a` para abrir no emulador Android
- Ou escaneie o QR Code com o app Expo Go / build de desenvolvimento no dispositivo físico

---

## Qualidade / CI

App em `fieldops-mobile/`. Pipeline de PR: lint + typecheck (sem EAS Build).

```bash
cd fieldops-mobile
npm ci
npm run lint
npm run typecheck
```

Detalhes: [docs/CI.md](docs/CI.md). Convenção dos 3 repos: [CI_CONVENTION.md](https://github.com/Project-FieldCore/docs/blob/main/PROJECT_MANAGEMENT/CI_CONVENTION.md).

## 🧪 Testes

```bash
npm run test
```

Cobertura prioritária:
- Proteção de rota e validação de login
- Renderização de cada tipo de item do checklist
- Validação de obrigatoriedade e cálculo de progresso
- Persistência local de respostas
- Criação de operações na outbox
- Comportamento offline e redução de operações duplicadas
- Tratamento de permissão negada (câmera, localização)
- Bloqueio de conclusão por pendências

---

## 🔑 Funcionalidades principais (MVP)

- [x] Autenticação (login, sessão, renovação de token, logout)
- [x] Lista de inspeções atribuídas com filtros (estado, data, prioridade)
- [x] Identificação de equipamento por QR Code
- [x] Checklist dinâmico (texto, número, booleano, conforme/não conforme, seleção única, data)
- [x] Captura de fotografias vinculadas a itens do checklist
- [x] Registro de localização (pontual, no início e na conclusão)
- [x] Registro de não conformidades com criticidade e evidência
- [x] Operação offline completa após download da inspeção
- [x] Sincronização via outbox com operações idempotentes
- [x] Recebimento de inspeções reprovadas para correção

Escopo completo do produto e regras de negócio: ver documentação consolidada do projeto.

---

## 📶 Estratégia offline-first

Toda escrita do usuário é gravada **primeiro no SQLite** — a interface não depende de uma resposta da rede para considerar o dado salvo. Cada alteração sincronizável gera uma operação na **outbox local**, identificada de forma idempotente, que é enviada ao servidor assim que houver conectividade.

O aplicativo distingue e exibe claramente cinco estados de sincronização:

| Estado | Significado |
|---|---|
| `SINCRONIZADO` | Não há alterações locais pendentes |
| `PENDENTE` | Existem operações aguardando envio |
| `SINCRONIZANDO` | O envio está em andamento |
| `ERRO` | Uma ou mais operações falharam |
| `CONFLITO` | Existe divergência que exige atenção |

---

## 🔗 Integração com a API

- Contrato documentado em OpenAPI (ver repositório da API)
- Prefixo de rotas: `/api/v1`
- Autenticação via token Bearer (JWT)
- Endpoints dedicados ao técnico em `/mobile/*`, sempre filtrados pelo usuário autenticado
- Sincronização via `/mobile/sync/push` (envio) e `/mobile/sync/pull` (download por cursor)

### Mocks (`EXPO_PUBLIC_DATA_SOURCE=mock`)

- Cadastros/auth: `fieldops-mobile/src/data/openapi/fieldops-v1.json` (cópia do mock canônico da API) + `infrastructure/api/contractMocks.ts`
- Login mock: e-mail do contrato (`ana.silva@example.com`) + senha local em `src/data/demoCredentials.ts` (não está no OpenAPI)
- Erros HTTP: `ErrorResponse` (doc. 12.2) via `infrastructure/api/errorResponse.ts`
- Inspeções Sprint-3: `features/inspections/mockRepository.ts` — fixtures de domínio, **não** mocks de cadastro OpenAPI

---

## 📦 Build

```bash
eas build --platform android --profile preview
```

Perfis de build e configuração de ambientes ficam definidos em `eas.json`.

---