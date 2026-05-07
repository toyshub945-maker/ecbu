# Workflow Dashboard

A Next.js + FastAPI workflow management dashboard for e-commerce operations.

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS, AG Grid, Recharts
- **Backend**: FastAPI, Python 3.11+, SQLite
- **Integration**: Feishu (Lark) API

## Quick Start

### 1. Clone & Install

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
pip install -r requirements.txt
```

### 2. Environment Setup

Copy `.env.example` to `.env` and fill in your Feishu API credentials:

```bash
cp .env.example .env
```

### 3. Run

```bash
# Terminal 1 - Backend
cd backend
uvicorn app.main:app --reload --port 3001

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

Access at: http://localhost:3002

## Project Structure

```
workflow-dashboard/
├── frontend/          # Next.js React app
│   ├── app/          # App router pages
│   ├── components/   # React components
│   └── lib/          # Utilities
├── backend/          # FastAPI Python backend
│   └── app/         # API routes
├── .env.example     # Environment template
└── .gitignore       # Git ignore rules
```

## GitHub Deployment

This project is ready for deployment to:
- **Vercel** (frontend)
- **Railway/Render** (backend)
- **GitHub Codespaces**

## License

MIT