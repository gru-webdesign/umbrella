"""Builds app icons and splash screens from the game sprites (pixel-exact upscales)."""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda n: Image.open(os.path.join(ROOT, "assets", n)).convert("RGBA")
up = lambda im, k: im.resize((im.width * k, im.height * k), Image.NEAREST)


def sky(size):
    top, bot = (115, 239, 247), (65, 166, 246)
    im = Image.new("RGBA", (size, size))
    band = max(1, size // 24)          # stepped, pixel-art gradient
    for y in range(0, size, band):
        t = y / size
        c = tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,)
        im.paste(c, (0, y, size, min(size, y + band)))
    return im


def background(size, wall_k):
    im = sky(size)
    L, R = up(A("facade_left.png"), wall_k), up(A("facade_right.png"), wall_k)
    for y in range(0, size, L.height):
        im.alpha_composite(L, (0, y))
        im.alpha_composite(R, (size - R.width, y))
    return im


def hero_layer(size, k):
    hero = up(A("hero_drift_0.png"), k)
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    im.alpha_composite(hero, ((size - hero.width) // 2, (size - hero.height) // 2))
    return im


def icon(size, wall_k, hero_k):
    im = background(size, wall_k)
    im.alpha_composite(hero_layer(size, hero_k))
    return im


def main():
    os.makedirs(os.path.join(ROOT, "icons"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "resources"), exist_ok=True)
    # web / PWA
    icon(192, 1, 3).save(os.path.join(ROOT, "icons", "icon-192.png"))
    icon(512, 3, 8).save(os.path.join(ROOT, "icons", "icon-512.png"))
    icon(512, 3, 6).save(os.path.join(ROOT, "icons", "icon-maskable-512.png"))  # hero inside the safe zone
    icon(180, 1, 3).convert("RGB").save(os.path.join(ROOT, "icons", "apple-touch-icon.png"))
    # Android (capacitor-assets): adaptive icon = background + foreground, both 1024
    background(1024, 6).save(os.path.join(ROOT, "resources", "icon-background.png"))
    hero_layer(1024, 12).save(os.path.join(ROOT, "resources", "icon-foreground.png"))
    icon(1024, 6, 16).save(os.path.join(ROOT, "resources", "icon-only.png"))
    splash = Image.new("RGBA", (2732, 2732), (26, 28, 44, 255))
    hero = up(A("hero_wave_0.png"), 18)
    splash.alpha_composite(hero, ((2732 - hero.width) // 2, (2732 - hero.height) // 2))
    splash.save(os.path.join(ROOT, "resources", "splash.png"))
    splash.save(os.path.join(ROOT, "resources", "splash-dark.png"))
    print("icons written")


if __name__ == "__main__":
    main()
