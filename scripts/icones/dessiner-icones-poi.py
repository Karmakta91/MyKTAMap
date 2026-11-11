"""Dessine les icônes de POI ossuaire, outil et fontis (icon/*.png, 128x128 transparents).

Rôle : reproduire la charte du jeu existant de icon/ (mesurée sur les PNG) : carré arrondi de 7 à 120 px,
cadre de 8 px, rayon extérieur ~20 px, fond #1a1f2e, cadre et pictogramme de la couleur du type, traits ~8 px.
Dessin à 512 px puis réduction LANCZOS à 128 px.
Usage (racine du dépôt) : python scripts/icones/dessiner-icones-poi.py icon [planche.png icon]
  le 2e et le 3e argument ajoutent une planche de relecture à côté d'icônes existantes (128, 32 et 24 px).
Dépendance : Pillow (pip install pillow), hors de l'app.
"""
import math
import sys
from PIL import Image, ImageDraw

S = 4
TAILLE = 128 * S
FOND = (26, 31, 46, 255)
DORE = (244, 197, 66, 255)
ORANGE = (255, 153, 51, 255)


def cadre(couleur):
    im = Image.new("RGBA", (TAILLE, TAILLE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    a, b = 7 * S, 121 * S - 1
    d.rounded_rectangle([a, a, b, b], radius=20 * S, fill=couleur)
    e = 8 * S
    d.rounded_rectangle([a + e, a + e, b - e, b - e], radius=12 * S, fill=FOND)
    return im, d


def trait(d, p, q, couleur, l):
    d.line([p, q], fill=couleur, width=l)
    r = l / 2
    for x, y in (p, q):
        d.ellipse([x - r, y - r, x + r, y + r], fill=couleur)


def os_(d, p, q, couleur, l=26, r=21, ecart=17):
    """Os : tige + deux nœuds ronds à chaque bout, perpendiculaires à la tige."""
    trait(d, p, q, couleur, l)
    dx, dy = q[0] - p[0], q[1] - p[1]
    n = math.hypot(dx, dy)
    ux, uy = dx / n, dy / n
    px, py = -uy, ux
    for (x, y), s in ((p, -1), (q, 1)):
        cx, cy = x + ux * s * 6, y + uy * s * 6
        for k in (-1, 1):
            ex, ey = cx + px * k * ecart, cy + py * k * ecart
            d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=couleur)


def ossuaire():
    """Crâne au-dessus d'un seul os horizontal : pas d'os croisés, qui lisent « poison »."""
    im, d = cadre(DORE)
    c = DORE
    # Bloc crâne + os de 120 à 391, centré sur 256 comme les pictogrammes du jeu existant.
    os_(d, (170, 362), (342, 362), c, l=24, r=17, ecart=12)
    cx, cy, r = 256, 202, 82
    m = 12
    d.ellipse([cx - r - m, cy - r - m, cx + r + m, cy + r + m], fill=FOND)
    d.rounded_rectangle([cx - 50 - m, 230, cx + 50 + m, 318 + m], radius=22 + m, fill=FOND)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    d.rounded_rectangle([cx - 50, 230, cx + 50, 318], radius=22, fill=c)
    for ox in (cx - 33, cx + 33):
        d.ellipse([ox - 24, 198 - 24, ox + 24, 198 + 24], fill=FOND)
    d.polygon([(cx, 238), (cx - 13, 264), (cx + 13, 264)], fill=FOND)
    for tx in (cx - 18, cx + 18):
        d.line([(tx, 288), (tx, 318)], fill=FOND, width=10)
    return im


def outil():
    """Pic de carrier : manche en diagonale, fer courbe à deux pointes."""
    im, d = cadre(DORE)
    c = DORE
    trait(d, (150, 412), (318, 196), c, 36)
    # Fer : bande courbe perpendiculaire au manche, épaisse au centre, effilée aux pointes.
    hx, hy = 318, 196
    ax, ay = 168 - 318, 412 - 196
    n = math.hypot(ax, ay)
    ux, uy = ax / n, ay / n          # vers le bas du manche
    px, py = -uy, ux                 # le long du fer
    long_, fleche, larg = 148, 50, 62
    haut, bas = [], []
    for i in range(41):
        t = -1 + i / 20
        w = larg / 2 * (1 - abs(t) ** 1.6) + 2
        bx = hx + px * t * long_ + ux * fleche * t * t
        by = hy + py * t * long_ + uy * fleche * t * t
        haut.append((bx - ux * w, by - uy * w))
        bas.append((bx + ux * w, by + uy * w))
    d.polygon(haut + bas[::-1], fill=c)
    # Douille : bague autour de l'emmanchement.
    r = 30
    d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=c)
    return im


def fontis():
    """Coupe : voûte de galerie crevée par une cloche, éboulis au sol."""
    im, d = cadre(ORANGE)
    c = ORANGE
    l = 30
    sol, voute = 400, 262
    # Ciel de la galerie, rompu au milieu.
    trait(d, (112, voute), (186, voute), c, l)
    trait(d, (326, voute), (400, voute), c, l)
    # Cloche d'effondrement montant au-dessus de la rupture.
    pts = []
    for i in range(61):
        a = math.pi * i / 60
        x = 256 - 70 * math.cos(a)
        y = voute - 140 * math.sin(a) ** 0.85
        pts.append((x, y))
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for k in range(8):
            x, y = x0 + (x1 - x0) * k / 8, y0 + (y1 - y0) * k / 8
            d.ellipse([x - l / 2, y - l / 2, x + l / 2, y + l / 2], fill=c)
    # Sol de la galerie.
    trait(d, (112, sol), (400, sol), c, l)
    # Éboulis : cône plein sous la cloche + blocs qui tombent.
    d.polygon([(150, sol), (200, 350), (232, 330), (262, 312), (296, 334), (322, 348), (362, sol)], fill=c)
    for (bx, by, rr, ang) in ((232, 262, 20, 20), (284, 278, 17, -15)):
        coins = []
        for k in range(4):
            a = math.radians(ang + 45 + 90 * k)
            coins.append((bx + rr * 1.41 * math.cos(a), by + rr * 1.41 * math.sin(a)))
        d.polygon(coins, fill=c)
    return im


def reduire(im):
    return im.resize((128, 128), Image.LANCZOS)


def planche(icones, existantes, chemin):
    """Planche : 128 px et 32 px, fond sombre puis fond clair."""
    tous = existantes + icones
    pas = 148
    largeur = pas * len(tous) + 20
    hauteur = 2 * (148 + 52) + 20
    pl = Image.new("RGBA", (largeur, hauteur), (0, 0, 0, 0))
    d = ImageDraw.Draw(pl)
    for bloc, fond in enumerate(((10, 13, 24, 255), (240, 242, 246, 255))):
        y0 = 10 + bloc * 200
        d.rectangle([0, y0 - 10, largeur, y0 + 190], fill=fond)
        for i, (nom, im) in enumerate(tous):
            x = 20 + i * pas
            if nom in [n for n, _ in icones]:
                d.rectangle([x - 6, y0 - 4, x + 134, y0 + 186], outline=(140, 180, 255, 255), width=2)
            pl.alpha_composite(im, (x, y0))
            petit = im.resize((32, 32), Image.LANCZOS)
            pl.alpha_composite(petit, (x, y0 + 140))
            pl.alpha_composite(im.resize((24, 24), Image.LANCZOS), (x + 44, y0 + 144))
            couleur = (232, 234, 240, 255) if bloc == 0 else (20, 24, 36, 255)
            d.text((x + 76, y0 + 150), nom, fill=couleur)
    fondu = Image.new("RGBA", pl.size, (128, 128, 128, 255))
    fondu.alpha_composite(pl)
    fondu.convert("RGB").save(chemin)


def main():
    sortie = sys.argv[1]
    nouvelles = [("ossuaire", reduire(ossuaire())), ("outil", reduire(outil())), ("fontis", reduire(fontis()))]
    for nom, im in nouvelles:
        im.save(f"{sortie}/{nom}.png", optimize=True)
    if len(sys.argv) > 3:
        ref = ["chatiere", "passage", "danger", "elec", "info", "vehicule"]
        existantes = [(n, Image.open(f"{sys.argv[3]}/{n}.png").convert("RGBA")) for n in ref]
        planche(nouvelles, existantes, sys.argv[2])


if __name__ == "__main__":
    main()
