# teams-backend (FastAPI)

This folder still contains the old Node/Express mock server, but you can now run the FastAPI version (with Swagger) **without changing the Teams frontend**.

## Run

From the repo root, ensure the venv is active (or use the configured python path in VS Code).

```powershell
cd "VendorPulse-code\teams-backend"

# install deps
pip install -r requirements.txt

# run server (keeps same port 3001 and same /api routes)
python -m uvicorn app:app --reload --port 3001
```

Open Swagger UI:

- http://localhost:3001/docs

## Compatibility

- Base URL remains: `http://localhost:3001/api`
- Routes remain the same as the Express version.
- CORS is enabled so the React app can call the APIs.

## Data

The API reads/writes:
- `data/users.json`
- `data/meetings.json`

Swagger shows request examples for each endpoint.
