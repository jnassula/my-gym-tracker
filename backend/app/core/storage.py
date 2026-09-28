"""Object storage for uploaded files (MinIO in development, any S3-compatible in production).

Services depend on the ``Storage`` protocol (FastAPI dependency ``get_storage``) so tests can
use an in-memory implementation. The MinIO SDK is synchronous: calls run in a worker thread.
"""

import asyncio
import io
import logging
from functools import lru_cache
from typing import Protocol

from minio import Minio
from minio.error import MinioException, S3Error

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class Storage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    async def get(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...
    async def ping(self) -> bool: ...


class MinioStorage:
    def __init__(self, settings: Settings) -> None:
        self._bucket = settings.s3_bucket
        self._client = Minio(
            settings.s3_endpoint,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key.get_secret_value(),
            secure=settings.s3_secure,
            region=settings.s3_region,
        )

    async def ensure_bucket(self) -> None:
        def _ensure() -> None:
            if not self._client.bucket_exists(self._bucket):
                self._client.make_bucket(self._bucket)
                logger.info("Created bucket %s", self._bucket)

        await asyncio.to_thread(_ensure)

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self._client.put_object,
            self._bucket,
            key,
            io.BytesIO(data),
            len(data),
            content_type=content_type,
        )

    async def get(self, key: str) -> bytes:
        def _get() -> bytes:
            response = self._client.get_object(self._bucket, key)
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()

        return await asyncio.to_thread(_get)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._client.remove_object, self._bucket, key)

    async def ping(self) -> bool:
        try:
            return await asyncio.to_thread(self._client.bucket_exists, self._bucket)
        except (MinioException, S3Error, OSError):
            logger.warning("Storage healthcheck failed", exc_info=True)
            return False


@lru_cache
def _minio() -> MinioStorage:
    return MinioStorage(get_settings())


def get_storage() -> Storage:
    return _minio()


async def ensure_bucket() -> None:
    """Called on startup. A storage outage must not stop the API from booting."""
    try:
        await _minio().ensure_bucket()
    except (MinioException, S3Error, OSError):
        logger.warning("Could not ensure the storage bucket exists", exc_info=True)
