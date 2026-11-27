"""Maakt de screenshots voor de Play Store uit die voor de App Store.

Google weigert een beeld waarvan de lange zijde meer dan twee keer de korte is,
en een iPhone-screenshot (1206 x 2622) is net langer. Dit script zet elk
screenshot uit store/apple/screenshots/ ongeschaald van vorm op een navy vlak in
de formaten die de Play Console vraagt:

- telefoon 1080 x 1920 (9:16, ook goed voor promotie);
- tablet 7" 1200 x 1920;
- tablet 10" 1600 x 2560 (elke zijde minstens 1080).

Allemaal PNG zonder alfakanaal. Draaien: python3 scripts/play-screenshots.py
(vraagt Pillow: pip install pillow).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "store/apple/screenshots"
OUT = ROOT / "store/play/screenshots"

NAVY = (0x0E, 0x1A, 0x36)  # COLORS.navy in src/theme/tokens.ts

FORMATS = {
    "phone": (1080, 1920),
    "tablet-7": (1200, 1920),
    "tablet-10": (1600, 2560),
}

MARGIN = 0.05  # boven en onder, als deel van de hoogte
RADIUS = 0.055  # afgeronde hoek, als deel van de breedte van het screenshot


def compose(shot: Image.Image, size: tuple[int, int]) -> Image.Image:
    w, h = size
    target_h = round(h * (1 - 2 * MARGIN))
    target_w = round(shot.width * target_h / shot.height)
    scaled = shot.convert("RGB").resize((target_w, target_h), Image.LANCZOS)

    # Hoeken afronden met een masker op vier keer de grootte, voor een zachte rand.
    r = round(target_w * RADIUS)
    big = Image.new("L", (target_w * 4, target_h * 4), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        (0, 0, target_w * 4 - 1, target_h * 4 - 1), radius=r * 4, fill=255
    )
    mask = big.resize((target_w, target_h), Image.LANCZOS)

    canvas = Image.new("RGB", size, NAVY)
    x, y = (w - target_w) // 2, (h - target_h) // 2

    # Een zachte schaduw onder het scherm, net donkerder dan het navy.
    shadow = Image.new("L", size, 0)
    shadow.paste(mask, (x, y + round(h * 0.006)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(round(h * 0.012)))
    canvas.paste(Image.new("RGB", size, (4, 8, 20)), (0, 0), shadow.point(lambda v: v * 0.6))

    canvas.paste(scaled, (x, y), mask)
    return canvas


def main() -> None:
    shots = sorted(SRC.glob("*.png"))
    if not shots:
        raise SystemExit(f"geen screenshots in {SRC}")
    for name, size in FORMATS.items():
        folder = OUT / name
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob("*.png"):
            old.unlink()
        for path in shots:
            with Image.open(path) as shot:
                compose(shot, size).save(folder / path.name, optimize=True)
        print(f"{name}: {len(shots)} x {size[0]} x {size[1]}")


if __name__ == "__main__":
    main()
