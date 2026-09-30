"""Kotak Neo API credential status, login, and read-only session routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.brokers.kotak_neo import (
    KotakNeoConfigError,
    clear_kotak_neo_access_token,
    get_kotak_neo_status,
    login_kotak_neo,
    save_kotak_neo_credentials,
)

router = APIRouter(prefix="/api/kotak-neo", tags=["kotak-neo"])


class KotakNeoCredentials(BaseModel):
    consumer_key: str
    consumer_secret: str
    mobile_number: str
    pan_or_dob: str | None = ""


class KotakNeoLoginRequest(BaseModel):
    mpin_or_password: str
    session_token: str | None = None


@router.get("/status")
def status():
    return get_kotak_neo_status()


@router.put("/credentials")
def credentials(data: KotakNeoCredentials):
    try:
        return save_kotak_neo_credentials(
            data.consumer_key,
            data.consumer_secret,
            data.mobile_number,
            data.pan_or_dob or "",
        )
    except KotakNeoConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/login")
def login(data: KotakNeoLoginRequest):
    try:
        return login_kotak_neo(data.mpin_or_password, data.session_token)
    except KotakNeoConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/logout")
def logout():
    clear_kotak_neo_access_token()
    return {"status": "logged_out", "kotak_neo": get_kotak_neo_status()}
