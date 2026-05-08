from pydantic import BaseModel
from typing import Any


class SchemaPostRequest(BaseModel):
    schema_body: dict[str, Any]
