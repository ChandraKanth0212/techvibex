class Module2BaseException(Exception):
    """Base exception for Module 2 AI Engine"""
    def __init__(self, message: str, status_code: int = 500, details: dict = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details or {}

class InvalidTaskDataError(Module2BaseException):
    """Raised when input task payload contains invalid domain values"""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message=message, status_code=422, details=details)

class SchemaValidationException(Module2BaseException):
    """Raised when canonical input schema validation fails"""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message=message, status_code=422, details=details)

class ScoringConfigurationError(Module2BaseException):
    """Raised when scoring weights configuration is invalid"""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message=message, status_code=500, details=details)

class CandidateEvaluationError(Module2BaseException):
    """Raised when integration candidate detection fails"""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message=message, status_code=400, details=details)
