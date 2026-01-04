from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from supertokens_python import get_all_cors_headers
from supertokens_python.framework.fastapi import get_middleware
from app.routes import vm
from app.config.supertokens import init_supertokens

# Initialize SuperTokens
init_supertokens()

app = FastAPI()

# CORS configuration for SuperTokens
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "PUT", "POST", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type"] + get_all_cors_headers(),
)

# SuperTokens middleware
app.add_middleware(get_middleware())


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


@app.exception_handler(Exception)
async def general_exception_handler(_, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )

# Include SuperTokens auth routes
from supertokens_python.framework.fastapi import get_middleware as get_supertokens_middleware
from supertokens_python.recipe.emailpassword.asyncio import sign_up, sign_in

app.include_router(vm.router, prefix="/vms")
