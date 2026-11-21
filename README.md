# 🐾 Huella Limpia · Lima Norte

**Producción:** https://huella-limpia.vercel.app

Plataforma vecinal y municipal para combatir las heces y la orina de mascotas en veredas, parques y fachadas
de **Los Olivos, Comas, San Martín de Porres e Independencia**.

## Funcionalidades
| Épica | Endpoints |
|---|---|
| Mapa de puntos críticos (índice de criticidad por zona) | `GET /api/zones?district=&level=`, `GET /api/districts` |
| Reportes vecinales | `GET /api/reports`, `POST /api/reports` (JWT) |
| Registro de mascotas y placa digital | `POST /api/pets` (JWT), `GET /api/pets/mine` (JWT), `GET /api/pets/lookup/:code` |
| Fiscalización municipal | `GET /api/inspection/queue`, `GET /api/inspection/stats`, `PATCH /api/reports/:id/status` (rol inspector) |
| Puntos limpios | `GET /api/clean-points`, `GET /api/clean-points/nearest?lat=&lng=&kind=` |
| Cuentas y roles | `POST /api/auth/register` (siempre vecino), `POST /api/auth/login`, `GET /api/auth/me` |

### Reglas de negocio
- **Criticidad** = Σ (peso del tipo × recencia) de los reportes **validados** ÷ 2, saturada en 1.
  Pesos: foco infeccioso 1.0 · heces 0.6 · orina 0.4 · mascota suelta 0.3. Recencia con vida media de 14 días.
- **Prioridad de fiscalización** = severidad × (1 + reincidencia en la zona) × (0.5 + recencia).
- **Flujo de estados**: reportado → validado → atendido (solo inspectores; sin retrocesos).

## Ejecutar localmente
```bash
npm install
npm run build   # ESLint (backend y frontend) + verificación
npm test        # pruebas unitarias e integración con cobertura
npm start       # http://localhost:3000
```
Cuenta de **inspector de prueba** (solo fuera de producción): `inspector@huellalimpia.test` / `Inspector2026`.
En producción el inspector se crea con las variables de entorno `INSPECTOR_EMAIL` e `INSPECTOR_PASSWORD`.

## Ramas
- `main`: producción (despliegue automático a Vercel, rama protegida).
- `test`: integración y pruebas; se fusiona a `main` mediante Pull Request.

## Pipeline CI/CD (`.github/workflows/ci-cd.yml`)
1. **Build**: `npm ci` + ESLint.
2. **Test**: Jest (unitarias + integración con Supertest) y reporte de cobertura.
3. **Security**: `npm audit` (SCA), Gitleaks (secretos), CodeQL (SAST); Dependabot semanal.
4. **Deploy**: integración Git de Vercel sobre `main` + smoke test de la versión desplegada.

Variables: `APP_URL` (GitHub). En Vercel: `JWT_SECRET`, `INSPECTOR_EMAIL`, `INSPECTOR_PASSWORD`.
