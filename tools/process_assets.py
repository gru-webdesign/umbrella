"""Converts the AI-generated source art in art/source/ into clean pixel-art PNGs in assets/.

Steps per image: key out the magenta background, split sprite sheets into frames,
and downscale each frame to true pixel size by taking the median colour of every block.
Run:  python3 tools/process_assets.py
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art", "source")
OUT = os.path.join(ROOT, "assets")


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert("RGB")).astype(np.int16)


def magenta_mask(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r > 170) & (b > 170) & (g < 120) & (np.abs(r - b) < 80)


def frames_by_columns(mask, n, min_gap=20):
    """Split a sheet into n frames using empty columns between them."""
    cols = mask.any(axis=0)
    runs, start = [], None
    for x, v in enumerate(cols):
        if v and start is None:
            start = x
        if not v and start is not None:
            runs.append([start, x])
            start = None
    if start is not None:
        runs.append([start, len(cols)])
    # merge runs separated by small gaps
    merged = [runs[0]]
    for r in runs[1:]:
        if r[0] - merged[-1][1] < min_gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    # keep the n widest groups, in left-to-right order
    merged = sorted(sorted(merged, key=lambda r: r[1] - r[0], reverse=True)[:n])
    return merged


def downscale(rgb, keep, s):
    """Median of each s x s block; a block is opaque when most of it is content."""
    h, w = keep.shape
    H, W = h // s, w // s
    rgb = rgb[: H * s, : W * s].reshape(H, s, W, s, 3)
    keep = keep[: H * s, : W * s].reshape(H, s, W, s)
    # sample the inner part of each block to avoid JPEG edge bleed
    m = max(1, s // 4)
    inner = rgb[:, m : s - m, :, m : s - m, :]
    col = np.median(inner.reshape(H, inner.shape[1], W, inner.shape[3], 3).transpose(0, 2, 1, 3, 4).reshape(H, W, -1, 3), axis=2)
    cover = keep.mean(axis=(1, 3))
    out = np.zeros((H, W, 4), np.uint8)
    out[..., :3] = np.clip(col, 0, 255)
    out[..., 3] = np.where(cover > 0.5, 255, 0)
    # anything still magenta-ish becomes transparent
    out[..., 3][magenta_mask(out[..., :3].astype(np.int16))] = 0
    return despill(out)


def despill(rgba):
    """Edge pixels tinted by the magenta background become the dark outline colour."""
    op = rgba[..., 3] > 0
    edge = op & ndimage.binary_dilation(~op)
    c = rgba[..., :3].astype(np.int16)
    tint = (c[..., 0] + c[..., 2]) / 2 - c[..., 1]
    pink = edge & (tint > 45) & (np.abs(c[..., 0] - c[..., 2]) < 90)
    rgba[pink, :3] = (26, 28, 44)
    return rgba


def clean_specks(rgba, min_size=3):
    lab, n = ndimage.label(rgba[..., 3] > 0)
    if n:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        for i, sz in enumerate(sizes, 1):
            if sz < min_size:
                rgba[lab == i, 3] = 0
    return rgba


def crop_alpha(rgba):
    ys, xs = np.nonzero(rgba[..., 3])
    return rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def save(rgba, name):
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, name))
    return {"w": int(rgba.shape[1]), "h": int(rgba.shape[0])}


def sheet(src, n, target_h, name, drop_below=None, flip=False):
    """Cut a sheet into n frames that share one scale and one canvas size."""
    a = load(src)
    keep = ~magenta_mask(a)
    keep = ndimage.binary_opening(keep, iterations=2)
    if drop_below is not None:
        keep[int(drop_below * keep.shape[0]) :, :] = False
    runs = frames_by_columns(keep, n)
    ys, _ = np.nonzero(keep)
    top, bot = ys.min(), ys.max() + 1
    s = max(2, round((bot - top) / target_h))
    frames = []
    for x0, x1 in runs:
        f = downscale(a[top:bot, x0:x1], keep[top:bot, x0:x1], s)
        frames.append(clean_specks(f))
    # common canvas, bottom-centre aligned
    W = max(f.shape[1] for f in frames)
    H = max(f.shape[0] for f in frames)
    meta = []
    for i, f in enumerate(frames):
        c = np.zeros((H, W, 4), np.uint8)
        ox = (W - f.shape[1]) // 2
        c[H - f.shape[0] :, ox : ox + f.shape[1]] = f
        if flip:
            c = c[:, ::-1]
        meta.append(save(c, f"{name}_{i}.png"))
    print(f"{name}: {n} frames {W}x{H} (scale 1/{s})")
    return {"frames": n, **meta[0]}


def background(src, name, keyed=False, size=(180, 320)):
    im = Image.open(os.path.join(SRC, src)).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    s = a.shape[1] // size[0]
    keep = ~magenta_mask(a) if keyed else np.ones(a.shape[:2], bool)
    out = downscale(a, keep, s)
    out = np.asarray(Image.fromarray(out, "RGBA").resize(size, Image.NEAREST))
    if not keyed:
        out = out.copy()
        out[..., 3] = 255
    print(f"{name}: {size[0]}x{size[1]} (scale 1/{s})")
    return save(np.ascontiguousarray(out), f"{name}.png")


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {
        "hero_drift": sheet("hero_wind.jpg", 2, 46, "hero_drift"),
        "hero_wave": sheet("hero_wave.jpg", 2, 46, "hero_wave"),
        "hero_dive": sheet("hero_fall_closed.jpg", 2, 40, "hero_dive"),
        "hero_death": sheet("hero_death.jpg", 3, 40, "hero_death", drop_below=0.66),
        "bird": sheet("bird.jpg", 2, 14, "bird"),
        "balloon": sheet("balloon.jpg", 2, 30, "balloon"),
        "plane": sheet("plane.jpg", 1, 9, "plane"),
        "dish": sheet("dish.jpg", 1, 26, "dish"),
        "pigeon_roof": sheet("pigeon_roof.jpg", 2, 22, "pigeon_roof"),
        "bg_day": background("bg_sky_day.jpg", "bg_day"),
        "bg_dusk": background("bg_sky_dusk.jpg", "bg_dusk"),
        "bg_menu": background("bg_sky_to_roofs.jpg", "bg_menu"),
        "bg_street": background("bg_street_lamps.jpg", "bg_street"),
        "clouds": background("layer_clouds.jpg", "clouds", keyed=True),
        "roofs": background("layer_roofs.jpg", "roofs", keyed=True),
    }
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(meta, f, indent=1)


if __name__ == "__main__":
    sys.exit(main())
