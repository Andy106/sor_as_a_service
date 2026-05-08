from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import login, schemas, assets

app = FastAPI(title="SOR as a Service API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(login.router)
app.include_router(schemas.router)
app.include_router(assets.router)
