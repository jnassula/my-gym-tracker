"""What the server makes of a picture before keeping it as a profile photo (pure)."""

import io

import pytest
from PIL import Image

from app.users import avatar
from app.users.avatar import NotAnImageError, normalise

RED, GREEN, BLUE, WHITE = (220, 30, 30), (30, 160, 60), (30, 60, 200), (255, 255, 255)


def encode(picture: Image.Image, fmt: str = "PNG", **options: object) -> bytes:
    out = io.BytesIO()
    picture.save(out, format=fmt, **options)
    return out.getvalue()


def stripes(width: int, height: int) -> Image.Image:
    """Red on the left third, green in the middle, blue on the right."""
    picture = Image.new("RGB", (width, height), GREEN)
    picture.paste(RED, (0, 0, width // 3, height))
    picture.paste(BLUE, (width - width // 3, 0, width, height))
    return picture


def decoded(data: bytes) -> Image.Image:
    picture = Image.open(io.BytesIO(data))
    picture.load()
    return picture


def close_to(pixel: object, colour: tuple[int, int, int]) -> bool:
    """JPEG is lossy: the same colour within a small margin."""
    assert isinstance(pixel, tuple)
    return all(abs(got - want) <= 12 for got, want in zip(pixel, colour, strict=True))


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_any_accepted_format_becomes_a_square_jpeg(fmt: str) -> None:
    result = decoded(normalise(encode(stripes(1500, 900), fmt)))

    assert (result.format, result.mode, result.size) == ("JPEG", "RGB", (512, 512))


def test_the_square_is_the_middle_of_the_picture() -> None:
    # Of 1500 columns the middle 900 stay (300 to 1200): 200 of the red stripe, the whole green
    # one and 200 of the blue. Scaled to 512, the stripes change at 114 and at 398.
    result = decoded(normalise(encode(stripes(1500, 900))))

    colours = [result.getpixel((x, 256)) for x in (100, 128, 256, 384, 412)]

    for colour, expected in zip(colours, (RED, GREEN, GREEN, GREEN, BLUE), strict=True):
        assert close_to(colour, expected)


def test_a_small_picture_is_not_scaled_up() -> None:
    result = decoded(normalise(encode(stripes(300, 200))))

    assert result.size == (200, 200)


def test_a_phone_photo_is_turned_upright_and_loses_its_metadata() -> None:
    # Stored lying on its side, with the orientation and a GPS position in the EXIF data.
    sideways = Image.new("RGB", (900, 600), RED)
    sideways.paste(BLUE, (0, 0, 450, 600))  # the left half of the stored pixels
    exif = Image.Exif()
    exif[0x0112] = 6  # "rotate 90° clockwise to show"
    exif[0x8825] = {1: "N", 2: (38.0, 43.0, 0.0), 3: "W", 4: (9.0, 8.0, 0.0)}  # GPS IFD
    data = encode(sideways, "JPEG", exif=exif)
    assert decoded(data).getexif().get(0x8825)  # the upload does carry a position

    result = decoded(normalise(data))

    assert result.size == (512, 512)
    assert dict(result.getexif()) == {}
    assert "exif" not in result.info
    # Upright, the stored left half is the top half.
    assert close_to(result.getpixel((256, 60)), BLUE)
    assert close_to(result.getpixel((256, 450)), RED)


def test_transparency_goes_on_white() -> None:
    logo = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    logo.paste((*BLUE, 255), (100, 100, 300, 300))

    result = decoded(normalise(encode(logo)))

    assert close_to(result.getpixel((10, 10)), WHITE)
    assert close_to(result.getpixel((200, 200)), BLUE)


def test_a_palette_png_with_a_transparent_colour_goes_on_white() -> None:
    palette = Image.new("P", (64, 64), 0)
    palette.putpalette([0, 0, 0, *BLUE])
    palette.paste(1, (16, 16, 48, 48))

    result = decoded(normalise(encode(palette, transparency=0)))

    assert close_to(result.getpixel((2, 2)), WHITE)
    assert close_to(result.getpixel((32, 32)), BLUE)


@pytest.mark.parametrize(
    "data",
    [
        b"",
        b"%PDF-1.7 not a picture",
        b"<html><script>alert(1)</script>",
        b"\xff\xd8\xff\xe0 a JPEG's first bytes and nothing behind them",
        encode(stripes(64, 64), "GIF"),  # a real image, of a kind that isn't accepted
        encode(stripes(64, 64), "BMP"),
        encode(stripes(600, 600), "JPEG")[:400],  # cut off halfway
    ],
)
def test_what_is_not_a_readable_picture_is_refused(data: bytes) -> None:
    with pytest.raises(NotAnImageError):
        normalise(data)


def test_a_picture_that_claims_too_many_pixels_is_refused_before_decoding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    data = encode(stripes(400, 300))
    monkeypatch.setattr(avatar, "MAX_PIXELS", 400 * 300 - 1)

    with pytest.raises(NotAnImageError):
        normalise(data)

    monkeypatch.setattr(avatar, "MAX_PIXELS", 400 * 300)
    assert decoded(normalise(data)).size == (300, 300)
