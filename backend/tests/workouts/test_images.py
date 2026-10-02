"""Photos of printed sheets: upright, scaled, bound into a PDF and read back out of one."""

import io

import pytest
from PIL import Image

from app.workouts.parser import images


def picture(width: int, height: int, *, fmt: str = "JPEG", orientation: int | None = None) -> bytes:
    image = Image.new("RGB", (width, height), (200, 100, 150))
    out = io.BytesIO()
    if orientation:
        exif = Image.Exif()
        exif[0x0112] = orientation
        image.save(out, fmt, exif=exif.tobytes())
    else:
        image.save(out, fmt)
    return out.getvalue()


def test_tells_jpeg_png_and_webp_by_their_bytes() -> None:
    assert images.image_type(picture(4, 4)) == "image/jpeg"
    assert images.image_type(picture(4, 4, fmt="PNG")) == "image/png"
    assert images.image_type(picture(4, 4, fmt="WEBP")) == "image/webp"
    assert images.image_type(b"RIFF....WAVE") is None
    assert images.image_type(b"%PDF-1.4") is None


def test_prepare_scales_down_and_turns_the_photo_upright() -> None:
    # A 4000x3000 landscape file tagged as rotated 90 degrees: a portrait photo.
    prepared = images.prepare(picture(4000, 3000, orientation=6))

    with Image.open(io.BytesIO(prepared)) as result:
        assert result.format == "JPEG"
        assert result.size == (1200, 1600)
        assert result.getexif().get(0x0112) is None


def test_prepare_never_scales_up_and_refuses_what_is_not_a_picture() -> None:
    with Image.open(io.BytesIO(images.prepare(picture(300, 200, fmt="PNG")))) as result:
        assert result.size == (300, 200)
    with pytest.raises(images.UnreadableImageError):
        images.prepare(b"\xff\xd8\xff garbage")


def test_a_huge_claimed_size_is_refused_before_decoding() -> None:
    # A PNG header claiming 20000x20000 with no pixel data behind it.
    header = picture(2, 2, fmt="PNG")[:33]
    header = header[:16] + (20000).to_bytes(4, "big") + (20000).to_bytes(4, "big") + header[24:]
    with pytest.raises(images.UnreadableImageError):
        images.prepare(header)


def test_photos_bound_into_a_pdf_come_back_as_pages() -> None:
    bound = images.bind_pdf(
        [images.prepare(picture(1200, 1600)), images.prepare(picture(1600, 1200))]
    )

    pages = images.pdf_pages(bound, max_pages=10)

    assert len(pages) == 2
    with Image.open(io.BytesIO(pages[0])) as page:
        assert max(page.size) == 1600
    with pytest.raises(images.UnreadableImageError):
        images.pdf_pages(bound, max_pages=1)
    with pytest.raises(images.UnreadableImageError):
        images.pdf_pages(b"%PDF-1.4 broken", max_pages=10)
