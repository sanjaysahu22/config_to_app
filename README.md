# ConfigToApp

ConfigToApp is a full-stack app generator.

It takes a JSON config, validates/corrects it with AI, generates frontend/backend/database files, builds a live preview, and can run a generated backend runtime for preview API calls.

---

## Project Structure

- `backend/` → Express + TypeScript runtime/generator API
- `frontend/` → Next.js UI (builder, preview, docs)
- `generated-projects/` → generated preview runtimes

---

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL (local or cloud)

---

## Environment Variables

### Backend (`backend/.env`)

Create/update `backend/.env` with at least:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB
PORT=3001
JWT_SECRET=replace_with_strong_secret
GROQ_API_KEY=your_groq_api_key
```

> `GROQ_API_KEY` is used by the AI validator in the generation pipeline.

### Frontend (`frontend/.env.local`)

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

For production (Railway backend):

```env
NEXT_PUBLIC_BACKEND_URL=https://configtoapp-production.up.railway.app
```

---

## Install Dependencies

Run once in both apps:

```bash
cd backend && npm install
cd ../frontend && npm install
```

---

## Run in Development

Run backend and frontend in separate terminals.

### Terminal 1: Backend

```bash
cd backend
npm run dev
```

Backend runs on: `http://localhost:3001`

### Terminal 2: Frontend

```bash
cd frontend
npm run dev
```

Frontend runs on: `http://localhost:3000`

---

## Production Commands

### Backend

```bash
cd backend
npm start
```

### Frontend

```bash
cd frontend
npm run build
npm run start
```

---

## Basic API Overview

Main backend endpoints:

- `POST /api/generate` → validate config, generate files, build preview HTML, start generated runtime
- `POST /api/login` → login
- `POST /api/register` → register
- `GET /api/configs` → list configs (auth required)
- `GET /api/configs/:id` → get config by id (auth required)

---

## Notes

- Generated preview runtimes are written under `generated-projects/preview-*`.
- CORS is configured to allow all origins in the current backend server setup.
- Do **not** commit real secrets (`.env`) to GitHub.

---

## Troubleshooting

- If generation preview fails, check backend logs first (`npm run dev` terminal).
- If frontend cannot reach backend, verify `NEXT_PUBLIC_BACKEND_URL`.
- If DB errors occur, verify `DATABASE_URL` and DB connectivity.
