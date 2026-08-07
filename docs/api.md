# API Contract

Base URL: `http://localhost:3001/api/v1` · Interactive docs: `/api/docs` (Swagger UI, Bearer auth).

## Conventions

- RESTful, versioned under `/api/v1`.
- **Envelope** — every response:

  ```json
  { "success": true, "data": { ... }, "meta": { "page": 1, "pageSize": 20, "total": 57, "totalPages": 3 } }
  { "success": false, "data": null, "error": { "code": "FORBIDDEN", "message": "Missing permission(s): company:delete" } }
  ```

- **Auth**: `Authorization: Bearer <accessToken>`.
- **Lists**: `?page=1&pageSize=20&search=...&sortBy=createdOn&sortOrder=desc&filters={"status":"ACTIVE"}`
  — search is case-insensitive `contains` across the module's search fields; filters is a
  JSON-encoded field map; pageSize max 200.
- **Errors**: 400 validation, 401 unauthorized, 403 missing permission, 404 not found,
  409 unique conflict, 429 throttled, 500 internal.
- **Mutations are audited** automatically (see Architecture §7).

## Auth

| Method | Path | Body / Notes |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → `{ accessToken, refreshToken, expiresIn, user }` |
| POST | `/auth/refresh` | `{ refreshToken }` → rotated pair |
| POST | `/auth/logout` | `{ refreshToken }` → revoke |
| GET | `/auth/me` | current user + roles + permissions |

## Endpoints

### Platform
| Method | Path | Permission |
|---|---|---|
| GET/POST | `/tenants`, `/tenants/:id`, `/tenants/:id/stats` | `platform:manage` |
| PATCH / POST archive | `/tenants/:id`, `/tenants/:id/archive` | `platform:manage` |

### Organization
| Module | Paths | Permission prefix |
|---|---|---|
| Companies | `/companies` + `/:id` (+ `/archive`) | `company:` |
| Factories | `/factories` + `/:id` | `factory:` |
| Warehouses | `/warehouses` + `/:id` | `warehouse:` |
| Departments | `/org-units/departments` + `/:id` | `orgunit:` |
| Sections | `/org-units/sections` + `/:id` (filter `?departmentId=`) | `orgunit:` |
| Lines | `/org-units/lines` + `/:id` (filter `?factoryId=`) | `orgunit:` |
| Tree | `GET /org-units/tree?factoryId=` | `orgunit:read` |

### Identity & Access
| Module | Paths | Permission prefix |
|---|---|---|
| Users | `/users` + `/:id`, `POST /users/:id/reset-password`, `POST /users/:id/archive` | `user:` |
| Roles | `/roles` + `/:id`, `PUT /roles/:id/permissions`, `POST /roles/:id/archive` | `role:` |
| Permissions | `GET /permissions` (grouped catalog) | `permission:read` |

### Configuration
| Module | Paths | Permission prefix |
|---|---|---|
| Settings | `GET/PUT /settings` (grouped key–value) | `setting:` |
| Master data categories | `/master-data/categories` + `/:id` (+ `/items`, `/archive`) | `masterdata:` |
| Master data items | `PATCH/DELETE /master-data/items/:id`, `GET /master-data/options?category=CODE` | `masterdata:` |

### Frameworks
| Module | Paths | Permission prefix |
|---|---|---|
| Audit | `GET /audit` (filters: module, entityType, entityId, action, userId) | `audit:read` |
| Documents | `POST /documents/upload` (multipart `file` + `entityType`, `entityId`), `GET /documents?entityType=&entityId=`, `GET /documents/:id/download`, `DELETE /documents/:id` | `document:` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` | `notification:read` |
| Comments | `GET /comments?entityType=&entityId=`, `POST /comments`, `DELETE /comments/:id` | `notification:read` |
| Workflows | `GET/POST /workflows`, `GET/PATCH /workflows/definitions/:id`, `POST /workflows/definitions/:id/archive` | `workflow:` |
| | `GET/POST /workflows/instances`, `GET /workflows/instances/:id`, `GET /workflows/tasks`, `POST /workflows/tasks/:id/action` | `workflow:read` / `workflow:approve` |

### System
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | public |

## DTO validation (highlights)

- `code`: `^[A-Z0-9_-]+$`, 2–20 chars (2–50 for roles/workflows).
- Emails validated; passwords min 8 chars; UUID references validated (`@IsUUID`).
- List query: page ≥ 1, pageSize 1–200, sortOrder ∈ {asc, desc}.
- Workflow steps: `[{ stepOrder, name, isApproval?, assigneeRoleCode? }]` (min 1 step).
