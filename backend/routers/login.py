from fastapi import APIRouter, HTTPException
from passlib.context import CryptContext
from db import db
from models.user import LoginRequest, LoginResponse

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    user = await db.users.find_one({"username": request.username})
    if not user or not pwd_context.verify(request.password, user["password"]):
        raise HTTPException(status_code=401, detail="Login Failed")
    return LoginResponse(
        message="Login Successful",
        username=user["username"],
        asset_type=user.get("asset_type"),
    )
