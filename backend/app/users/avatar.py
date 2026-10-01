"""The profile photo as the app keeps it: a small square JPEG with nothing else inside (pure).

Whatever arrives is decoded and written again here, so what is stored never depends on the
client: a script posting to the API gets the same treatment as the app, which already crops
and scales the picture in the browser to save the upload.
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

AVATAR_SIZE = 512
JPEG_QUALITY = 85
# What the header says the picture measures, checked before any pixel is decoded: a few KB can
# claim to be a huge image (a "decompression bomb"), and decoding takes 4 bytes per pixel.
# 16 megapixels is far more than fits in the upload cap as a real photo.
MAX_PIXELS = 16_000_000
_FORMATS = ("JPEG", "PNG", "WEBP")


class NotAnImageError(Exception):
    """Not a JPEG, PNG or WebP that can be decoded, or too large to decode safely."""


def normalise(data: bytes) -> bytes:
    """Centred square, at most AVATAR_SIZE on each side (never scaled up), as a JPEG.

    The picture is turned the way it was shot (EXIF orientation), transparency goes on white,
    and no metadata survives: the place a phone photo was taken stays out of the storage.
    """
    try:
        with Image.open(io.BytesIO(data), formats=_FORMATS) as picture:
            width, height = picture.size
            if width * height > MAX_PIXELS:
                raise NotAnImageError
            upright = ImageOps.exif_transpose(picture)
            if upright.mode in ("RGBA", "LA", "PA") or "transparency" in upright.info:
                rgba = upright.convert("RGBA")
                flat = Image.new("RGB", rgba.size, "white")
                flat.paste(rgba, mask=rgba.getchannel("A"))
            else:
                flat = upright.convert("RGB")
            size = min(AVATAR_SIZE, *flat.size)
            square = ImageOps.fit(flat, (size, size), Image.Resampling.LANCZOS)
    except NotAnImageError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as error:
        # OSError: a truncated or corrupt file; ValueError: a header Pillow refuses.
        raise NotAnImageError from error
    out = io.BytesIO()
    square.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()
