from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow

app = FastAPI()

CLIENT_SECRETS_FILE = "client_secret.json"

SCOPES = [
    "https://www.googleapis.com/auth/forms.body",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]


@app.get("/auth")
def auth():
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE,
        scopes=SCOPES,
        redirect_uri="http://localhost:8000/auth/callback"
    )

    auth_url, _ = flow.authorization_url(prompt="consent")

    return RedirectResponse(auth_url)