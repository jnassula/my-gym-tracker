from pydantic import BaseModel, ConfigDict


class DemoRead(BaseModel):
    """The animation that shows an exercise: its bytes are at ``/api/demos/{id}.gif``."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    # English, as the catalogue names the movement.
    name: str
