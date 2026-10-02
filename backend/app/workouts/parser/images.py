"""Photographs of printed gym sheets, on their way to the LLM and into storage.

A phone photo is upright by its EXIF tag only and far bigger than the model keeps (it scales
every image to about 1300 px): ``prepare`` turns it upright, drops the metadata and scales
it to ``MAX_SIDE``, which also bounds the request. A PDF made of photos is rendered page by
page (pypdfium2, which pdfplumber brings), and photos sent loose are bound into one PDF so a
plan keeps a single source file ("Ver PDF") whichever way they came. CPU-bound: callers use
``asyncio.to_thread``.
"""

import io

import pypdfium2 as pdfium
from fpdf import FPDF
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_SIDE = 1600
JPEG_QUALITY = 85
# Decoded before any pixel is read: a small file can claim a huge size.
MAX_PIXELS = 50_000_000
# A4 in points, portrait; photos are fitted inside the margins.
_PAGE_W, _PAGE_H, _MARGIN = 210, 297, 10

_SIGNATURES = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"RIFF", "image/webp"),  # RIFF....WEBP
)


class UnreadableImageError(Exception):
    """Not a JPEG, PNG or WebP, or one Pillow could not decode."""


def image_type(data: bytes) -> str | None:
    """The media type by the first bytes, or None when it is not a picture we take."""
    for signature, media_type in _SIGNATURES:
        if data.startswith(signature):
            if media_type == "image/webp" and data[8:12] != b"WEBP":
                continue
            return media_type
    return None


def prepare(data: bytes) -> bytes:
    """A photo as the model and the stored PDF get it: upright, RGB, at most ``MAX_SIDE`` on
    its longer side, JPEG without metadata."""
    try:
        with Image.open(io.BytesIO(data)) as source:
            width, height = source.size
            if width * height > MAX_PIXELS:
                raise UnreadableImageError(f"{width}x{height} is too large")
            upright = ImageOps.exif_transpose(source) or source
            image = upright.convert("RGB")
    except UnreadableImageError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise UnreadableImageError(str(exc)) from exc
    image.thumbnail((MAX_SIDE, MAX_SIDE))  # never scales up
    out = io.BytesIO()
    image.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()


def pdf_pages(data: bytes, *, max_pages: int) -> list[bytes]:
    """Each page of a PDF rendered as a photo (``prepare``'s output), for a PDF without text."""
    try:
        document = pdfium.PdfDocument(data)
    except pdfium.PdfiumError as exc:
        raise UnreadableImageError(str(exc)) from exc
    try:
        if len(document) > max_pages:
            raise UnreadableImageError(f"More than {max_pages} pages")
        pages = []
        for page in document:
            width, height = page.get_size()
            scale = MAX_SIDE / max(width, height)
            bitmap = page.render(scale=scale)
            with bitmap.to_pil() as rendered:
                out = io.BytesIO()
                rendered.convert("RGB").save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
            pages.append(out.getvalue())
            page.close()
        return pages
    finally:
        document.close()


def bind_pdf(images: list[bytes]) -> bytes:
    """Prepared photos as one PDF, a page each, fitted to A4."""
    pdf = FPDF(orientation="portrait", format="A4")
    pdf.set_auto_page_break(auto=False)
    box_w, box_h = _PAGE_W - 2 * _MARGIN, _PAGE_H - 2 * _MARGIN
    for data in images:
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
        scale = min(box_w / width, box_h / height)
        shown_w, shown_h = width * scale, height * scale
        pdf.add_page()
        pdf.image(
            io.BytesIO(data),
            x=(_PAGE_W - shown_w) / 2,
            y=(_PAGE_H - shown_h) / 2,
            w=shown_w,
            h=shown_h,
        )
    return bytes(pdf.output())
