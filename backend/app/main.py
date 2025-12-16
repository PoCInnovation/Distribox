from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from app.routes import vm, image
app = FastAPI()


@app.exception_handler(HTTPException)
async def global_exception_handler(_, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

@app.exception_handler(Exception)
async def global_exception_handler(_, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )
app.include_router(vm.router, prefix="/vms")
app.include_router(image.router, prefix="/images")
