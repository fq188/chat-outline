import zlib, struct, os, math

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(OUT, exist_ok=True)

BG = (14, 143, 111)      # #0E8F6F
FG = (255, 255, 255)


def rounded_rect(x, y, w, h, r, X, Y):
    """return True if point (X,Y) inside rounded rect"""
    if X < x or X > x + w or Y < y or Y > y + h:
        return False
    cx = min(max(X, x + r), x + w - r)
    cy = min(max(Y, y + r), y + h - r)
    return (X - cx) ** 2 + (Y - cy) ** 2 <= r * r


def render(size, ss=4):
    S = size * ss
    px = [[(0, 0, 0, 0)] * S for _ in range(S)]

    pad = S * 0.045
    r = S * 0.22
    for y in range(S):
        for x in range(S):
            if rounded_rect(pad, pad, S - 2 * pad, S - 2 * pad, r, x + 0.5, y + 0.5):
                px[y][x] = (*BG, 255)

    # 目录条：左侧小方点 + 右侧横线
    bars = [(0.345, 0.90), (0.50, 0.72), (0.655, 0.82)]
    bh = S * 0.075
    dot = S * 0.075
    for cy, xend in bars:
        y0 = S * cy - bh / 2
        # dot
        for y in range(S):
            for x in range(S):
                dx, dy = x + 0.5 - S * 0.285, y + 0.5 - S * cy
                if dx * dx + dy * dy <= (dot / 2) ** 2:
                    px[y][x] = (*FG, 255)
        # bar
        x0, x1 = S * 0.40, S * xend
        rr = bh / 2
        for y in range(S):
            for x in range(S):
                if rounded_rect(x0, y0, x1 - x0, bh, rr, x + 0.5, y + 0.5):
                    px[y][x] = (*FG, 255)

    # 降采样
    out = []
    for y in range(size):
        row = []
        for x in range(size):
            rs = gs = bs = as_ = 0
            for j in range(ss):
                for i in range(ss):
                    p = px[y * ss + j][x * ss + i]
                    a = p[3] / 255.0
                    rs += p[0] * a
                    gs += p[1] * a
                    bs += p[2] * a
                    as_ += p[3]
            n = ss * ss
            a = as_ / n
            if a < 1:
                rr_ = gg = bb = 0
            else:
                k = as_ / 255.0
                rr_, gg, bb = rs / k, gs / k, bs / k
            row.append((int(rr_), int(gg), int(bb), int(a)))
        out.append(row)
    return out


def write_png(path, pixels):
    h = len(pixels)
    w = len(pixels[0])
    raw = b""
    for row in pixels:
        raw += b"\x00" + b"".join(struct.pack("BBBB", *p) for p in row)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


for s in (16, 32, 48, 128):
    write_png(os.path.join(OUT, f"icon{s}.png"), render(s, ss=4 if s <= 48 else 2))
    print("wrote", s)
