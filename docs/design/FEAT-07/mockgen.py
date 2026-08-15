# -*- coding: utf-8 -*-
import io

PAL = {
    "k": "#2b2420", "s": "#f2c9a0", "w": "#fffdf6",
    "d": "#b08968", "D": "#8b5e34", "m": "#6b7f96", "g": "#cfe3d8",
    "f": "#efe8d8", "F": "#e6dcc6", "W": "#f7f3e8", "B": "#e0d7c2",
    "p": "#c8b7e0", "G": "#7fa66a",
}
ID = {
    "pm":      {"hair": "#2b2420", "shirt": "#4a4080", "prop": "papers",  "name": "PM",            "role": "선정·발주"},
    "admin":   {"hair": "#5a3b28", "shirt": "#5f8a5a", "prop": "laptop",  "name": "admin-dev",     "role": "어드민 개발"},
    "auditor": {"hair": "#8f8a80", "shirt": "#7a6296", "prop": "glass",   "name": "doc-auditor",   "role": "문서 감사"},
    "web":     {"hair": "#7a5230", "shirt": "#8a6b4f", "prop": "laptop",  "name": "web-dev",       "role": "웹 개발"},
    "scout":   {"hair": "#3c4a3a", "shirt": "#4f7d78", "prop": "compass", "name": "feature-scout", "role": "기능 조사"},
}
TONE = {"pending": "#976014", "active": "#3e5a86", "done": "#8b877f"}


def sprite(hair, shirt):
    rows = [
        "...kkkkkk...",
        "..kHHHHHHk..",
        ".kHHHHHHHHk.",
        ".kHssssssHk.",
        ".kskssssksk.",  # 버그 수정: 눈 2개 + 좌우 윤곽 온전
        ".kssssssssk.",
        "..kssssssk..",
        "...kssssk...",
        "..kTTTTTTk..",
        ".kTTTTTTTTk.",
        ".kTkTTTTkTk.",
        ".ks.TTTT.sk.",
    ]
    return rows, {"H": hair, "T": shirt}


def render_grid(rows, extra, x0, y0, cell, parts):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == ".":
                continue
            color = extra.get(ch) or PAL.get(ch)
            if not color:
                continue
            parts.append('<rect x="%g" y="%g" width="%g" height="%g" fill="%s"/>' % (x0 + i * cell, y0 + j * cell, cell, cell, color))


def prop_grid(prop):
    if prop == "laptop":
        return ["..mmmm..", ".mggggm.", "mmmmmmmm"], -3
    if prop == "papers":
        return ["wwww.", "wwwww", "wwwww"], -3
    if prop == "glass":
        return ["..kk.", ".kwwk", ".kwwk", "k.kk."], -4
    return [".kkk.", "kwGwk", "kwwwk", ".kkk."], -4


def desk(x0, y0, cell, parts, prop, name):
    for i in range(16):
        parts.append('<rect x="%g" y="%g" width="%g" height="%g" fill="%s"/>' % (x0 + i * cell, y0, cell, cell, PAL["d"]))
        parts.append('<rect x="%g" y="%g" width="%g" height="%g" fill="%s"/>' % (x0 + i * cell, y0 + cell, cell, cell * 2, PAL["D"]))
    g, dy = prop_grid(prop)
    render_grid(g, {}, x0 + 9 * cell, y0 + dy * cell, cell, parts)
    cx = x0 + 8 * cell
    pw = 9 * len(name) + 22
    px = cx - pw / 2
    parts.append('<rect x="%g" y="%g" width="%g" height="18" fill="%s"/>' % (px - 2, y0 + cell - 2, pw + 4, PAL["k"]))
    parts.append('<rect x="%g" y="%g" width="%g" height="14" fill="#3d342c"/>' % (px, y0 + cell, pw))
    parts.append('<text x="%g" y="%g" text-anchor="middle" font-family="ui-monospace,monospace" font-size="13" font-weight="700" fill="#fffdf6">%s</text>' % (cx, y0 + cell + 11, name))


def bubble(cx, y_head, text, color, parts):
    w = max(64, min(13 * len(text) + 24, 190))
    x = cx - 20
    y = y_head - 40
    parts.append('<rect x="%g" y="%g" width="%g" height="26" fill="%s" stroke="%s" stroke-width="2"/>' % (x, y, w, PAL["w"], color))
    parts.append('<rect x="%g" y="%g" width="8" height="5" fill="%s" stroke="%s" stroke-width="2"/>' % (x + 12, y + 26, PAL["w"], color))
    parts.append('<rect x="%g" y="%g" width="4" height="4" fill="%s"/>' % (x + 14, y + 31, color))
    parts.append('<text x="%g" y="%g" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" fill="%s">%s</text>' % (x + w / 2, y + 17, color, text))


def pixel_button(cx, y, label, parts):
    w = 13 * len(label) + 22
    x = cx - w / 2
    parts.append('<rect x="%g" y="%g" width="%g" height="20" fill="#3d342c"/>' % (x + 2, y + 2, w))
    parts.append('<rect x="%g" y="%g" width="%g" height="20" fill="#fffdf6" stroke="#2b2420" stroke-width="2"/>' % (x, y, w))
    parts.append('<text x="%g" y="%g" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" font-weight="700" fill="#2b2420">%s</text>' % (x + w / 2, y + 14, label))


def seat(who, x, y_char, bub, parts, cell=6, button=None):
    idn = ID[who]
    rows, extra = sprite(idn["hair"], idn["shirt"])
    if bub:
        text, color = bub
        bubble(x + 12 + 6 * cell, y_char, text, color, parts)
    render_grid(rows, extra, x + 12, y_char, cell, parts)
    desk(x, y_char + 9 * cell + 2, cell, parts, idn["prop"], idn["name"])
    bottom = y_char + 9 * cell + 2 + 3 * cell
    if button:
        pixel_button(x + 8 * cell, bottom + 8, button, parts)
        bottom += 34
    return bottom


def scene():
    cell = 6
    W, H = 660, 330
    parts = ['<rect width="%d" height="%d" fill="%s"/>' % (W, H, PAL["W"]),
             '<rect y="86" width="%d" height="8" fill="%s"/>' % (W, PAL["B"])]
    j, y = 0, 94
    while y < H:
        for i in range(0, W // 12 + 1):
            c = PAL["f"] if (i + j) % 2 == 0 else PAL["F"]
            parts.append('<rect x="%d" y="%d" width="12" height="12" fill="%s"/>' % (i * 12, y, c))
        j += 1
        y += 12
    render_grid(["kkkkk", "kwgwk", "kwwwk", "kkkkk"], {}, 60, 22, 5, parts)
    render_grid([".GGG.", "GGGGG", ".GGG.", ".ppp.", ".ppp."], {}, 606, 40, 6, parts)
    seats = [("pm", 30, ("결재 1건 대기", TONE["pending"]), "선정 실행"),
             ("admin", 250, ("작업 중", TONE["active"]), "작업 진행"),
             ("auditor", 470, None, "감사 실행")]
    bot = 0
    for who, x, bub, btn in seats:
        bot = max(bot, seat(who, x, 118, bub, parts, button=btn))
    for who, x, _b, _btn in seats:
        parts.append('<text x="%g" y="%g" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="12" fill="#5c5348">%s</text>' % (x + 48, bot + 26, ID[who]["role"]))
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" shape-rendering="crispEdges">%s</svg>' % (W, H, W, "".join(parts))


def mobile_scene():
    cell = 5
    W, H = 340, 480
    parts = ['<rect width="%d" height="%d" fill="%s"/>' % (W, H, PAL["W"]),
             '<rect y="46" width="%d" height="6" fill="%s"/>' % (W, PAL["B"])]
    j, y = 0, 52
    while y < H:
        for i in range(0, W // 10 + 1):
            c = PAL["f"] if (i + j) % 2 == 0 else PAL["F"]
            parts.append('<rect x="%d" y="%d" width="10" height="10" fill="%s"/>' % (i * 10, y, c))
        j += 1
        y += 10
    order = [("pm", ("결재 1건", TONE["pending"])),
             ("admin", ("작업 중", TONE["active"])),
             ("web", ("완료", TONE["done"])),
             ("auditor", None),
             ("scout", None)]
    dw = 9.5
    for idx, (who, bub) in enumerate(order):
        col = idx % 2
        row = idx // 2
        x = 24 + col * 160
        y_char = 96 + row * 130
        idn = ID[who]
        rows, extra = sprite(idn["hair"], idn["shirt"])
        if bub:
            text, color = bub
            w = max(56, 12 * len(text) + 20)
            bx = x + 36 + 6 * cell - 16
            by = y_char - 33
            parts.append('<rect x="%g" y="%g" width="%g" height="22" fill="%s" stroke="%s" stroke-width="2"/>' % (bx, by, w, PAL["w"], color))
            parts.append('<rect x="%g" y="%g" width="6" height="4" fill="%s" stroke="%s" stroke-width="1.5"/>' % (bx + 10, by + 22, PAL["w"], color))
            parts.append('<text x="%g" y="%g" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10.5" fill="%s">%s</text>' % (bx + w / 2, by + 15, color, text))
        render_grid(rows, extra, x + 36, y_char, cell, parts)
        for i in range(14):
            parts.append('<rect x="%g" y="%g" width="%g" height="%g" fill="%s"/>' % (x + i * dw, y_char + 9 * cell, dw, cell, PAL["d"]))
            parts.append('<rect x="%g" y="%g" width="%g" height="%g" fill="%s"/>' % (x + i * dw, y_char + 10 * cell, dw, cell * 2, PAL["D"]))
        cx = x + 7 * dw
        name = idn["name"]
        pw = 7 * len(name) + 16
        parts.append('<rect x="%g" y="%g" width="%g" height="15" fill="%s"/>' % (cx - pw / 2 - 2, y_char + 10 * cell, pw + 4, PAL["k"]))
        parts.append('<text x="%g" y="%g" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10.5" font-weight="700" fill="#fffdf6">%s</text>' % (cx, y_char + 10 * cell + 11.5, name))
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" shape-rendering="crispEdges">%s</svg>' % (W, H, W, "".join(parts))


def owner_banner():
    cell = 6
    W, H = 660, 96
    parts = ['<rect width="%d" height="%d" fill="#f5efdf"/>' % (W, H)]
    for i in range(0, 44):
        parts.append('<rect x="%g" y="56" width="15" height="8" fill="%s"/>' % (i * 15, PAL["d"]))
        parts.append('<rect x="%g" y="64" width="15" height="26" fill="%s"/>' % (i * 15, PAL["D"]))
    docs = ["..wwwww..", ".wwwwwww.", ".wwwwwww.", "wwwwwwwww", "wwwwwwwww"]
    render_grid(docs, {}, 60, 26, 6, parts)
    parts.append('<rect x="57" y="23" width="60" height="36" fill="none" stroke="#2b2420" stroke-width="2"/>')
    stamp = [".oo.", "oooo", "oooo", ".oo."]
    for j, row in enumerate(stamp):
        for i, ch in enumerate(row):
            if ch == "o":
                parts.append('<rect x="%g" y="%g" width="6" height="6" fill="#976014"/>' % (150 + i * 6, 30 + j * 6))
    parts.append('<text x="200" y="38" font-family="ui-monospace,monospace" font-size="15" font-weight="700" fill="#2b2420">당신의 책상</text>')
    parts.append('<text x="200" y="54" font-family="ui-sans-serif,system-ui" font-size="12" fill="#976014">결재 1건이 도장을 기다립니다</text>')
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" shape-rendering="crispEdges">%s</svg>' % (W, H, W, "".join(parts))


html = """<!doctype html><meta charset="utf-8"><title>FEAT-07 픽셀 시안 v7</title>
<body style="background:#faf7ef;color:#2b2420;font-family:ui-sans-serif,system-ui;padding:24px">
<h1 style="font-size:18px">픽셀 사무실 시안 v7 — 최신</h1>
<p style="color:#777;font-size:13px;max-width:660px">v5~v6 반영: ① 소유자 책상 배너(아래) — 결재함 상단의 픽셀 헤더. 결재 카드 본문은 FEAT-04 형태 유지(혼합안) ② 책상 아래 픽셀풍 명령 버튼(pm·auditor) ③ 모바일 캐릭터 중앙 정렬 ④ 명패 기하 실수정(검산) ⑤ pm 인디고·auditor 퍼플 ⑥ 명패 폰트 13px(잘 보이게, 책상보다 넓어도 허용) ⑦ dev 책상에도 「작업 진행」 버튼.</p>
<h2 style="font-size:15px">소유자 책상 배너 — 결재함 픽셀 헤더 (이 아래에 기존 결재 카드가 온다)</h2>
%s
<h2 style="font-size:15px;margin-top:26px">사무실 — 책상별 명령 버튼 포함</h2>
%s
<h2 style="font-size:15px;margin-top:26px">폰 세로형 데모 — 2열 격자 방, 5명 전원 (가로 스크롤 없음)</h2>
%s
</body>""" % (owner_banner(), scene(), mobile_scene())

io.open("pixel-office-mock.html", "w", encoding="utf-8").write(html)
print("written", len(html))
