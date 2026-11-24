from fastapi import HTTPException

VM_SHUTDOWN_FAILED_CODE = "vm_shutdown_failed"


class CodedHTTPException(HTTPException):
    """HTTPException carrying a stable machine-readable error code."""

    def __init__(self, status_code: int, detail: str, code: str) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.code = code


def rebuild_http_exception(
    exc: HTTPException, detail: str
) -> HTTPException:
    """Return a new HTTPException with updated detail while preserving any code."""
    code = getattr(exc, "code", None)
    if isinstance(code, str):
        return CodedHTTPException(
            status_code=exc.status_code, detail=detail, code=code
        )
    return HTTPException(status_code=exc.status_code, detail=detail)
