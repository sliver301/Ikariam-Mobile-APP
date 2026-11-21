# Builds the app icon from scratch (original artwork, no game images): a white Greek temple with a
# terracotta roof on a green island in the Aegean, with the sun, a cloud and a small ship.
#   powershell -ExecutionPolicy Bypass -File art\make_icon.ps1
# Writes: app/src/main/res/drawable-nodpi/ic_launcher_fg.png (adaptive icon foreground, 432 px)
#         docs/icon.png (512 px, rounded, for the GitHub page)
Add-Type -AssemblyName System.Drawing
$art = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $art

function C([string]$hex, [int]$a = 255) { [Drawing.Color]::FromArgb($a, [Drawing.ColorTranslator]::FromHtml($hex)) }
function Grad($x, $y, $w, $h, $c1, $c2, $angle = 90) {
    New-Object Drawing.Drawing2D.LinearGradientBrush((New-Object Drawing.RectangleF ([single]$x), ([single]$y), ([single]$w), ([single]$h)), $c1, $c2, ([single]$angle))
}
function Brush($c) { New-Object Drawing.SolidBrush $c }
function Pen($c, $w) { $p = New-Object Drawing.Pen($c, ([single]$w)); $p.LineJoin = 'Round'; $p.StartCap = 'Round'; $p.EndCap = 'Round'; $p }
function Poly($pts) {
    $p = New-Object Drawing.Drawing2D.GraphicsPath
    $arr = @(); for ($i = 0; $i -lt $pts.Count; $i += 2) { $arr += New-Object Drawing.PointF ([single]$pts[$i]), ([single]$pts[$i + 1]) }
    $p.AddPolygon([Drawing.PointF[]]$arr); $p
}
function Rect($x, $y, $w, $h) { $p = New-Object Drawing.Drawing2D.GraphicsPath; $p.AddRectangle((New-Object Drawing.RectangleF ([single]$x), ([single]$y), ([single]$w), ([single]$h))); $p }

# The scene is designed for a 1024 x 1024 visible square; sky and sea run on past its edges
# (to -256 .. 1280) so the adaptive icon's hidden margin is filled too.
function Draw-Scene([Drawing.Graphics]$g) {
    $ink = C '#4A3826'
    # --- sky
    $g.FillRectangle((Grad -256 -256 1536 900 (C '#2F7FCF') (C '#BEE4F6')), -256, -256, 1536, 900)
    # --- sun with glow
    $glow = New-Object Drawing.Drawing2D.GraphicsPath; $glow.AddEllipse(590, 40, 380, 380)
    $gb = New-Object Drawing.Drawing2D.PathGradientBrush $glow
    $gb.CenterColor = C '#FFF4C0' 190; $gb.SurroundColors = [Drawing.Color[]]@((C '#FFF4C0' 0))
    $g.FillPath($gb, $glow)
    $g.FillEllipse((Grad 690 140 180 180 (C '#FFF6C8') (C '#FFC23A')), 690, 140, 180, 180)
    # --- cloud
    $cloud = (C '#FFFFFF' 235)
    foreach ($e in @(@(110, 215, 150, 90), @(180, 175, 150, 120), @(270, 200, 150, 100), @(80, 245, 300, 70))) {
        $g.FillEllipse((Brush $cloud), $e[0], $e[1], $e[2], $e[3])
    }
    $g.FillEllipse((Brush (C '#D6E9F5' 200)), 95, 278, 270, 30)
    # --- far islands on the horizon (hazy)
    $far = New-Object Drawing.Drawing2D.GraphicsPath
    $far.AddBezier(-256, 650, -80, 640, 60, 585, 230, 650); $far.CloseFigure()
    $g.FillPath((Brush (C '#86B3C9')), $far)
    $far2 = New-Object Drawing.Drawing2D.GraphicsPath
    $far2.AddBezier(860, 652, 940, 612, 1050, 610, 1280, 652); $far2.CloseFigure()
    $g.FillPath((Brush (C '#96BED0')), $far2)
    # --- sea
    $g.FillRectangle((Grad -256 645 1536 640 (C '#3A9AD6') (C '#0E4A86')), -256, 645, 1536, 640)
    $g.FillRectangle((Brush (C '#FFFFFF' 70)), -256, 645, 1536, 5)
    # sun glitter
    foreach ($s in @(@(740, 668, 90), @(760, 690, 60), @(720, 712, 110), @(770, 740, 50), @(735, 775, 80))) {
        $g.DrawLine((Pen (C '#FFF3C4' 200) 7), $s[0], $s[1], $s[0] + $s[2], $s[1])
    }
    # --- island: sand under green
    $sand = New-Object Drawing.Drawing2D.GraphicsPath
    $sand.AddBezier(60, 770, 150, 700, 230, 650, 300, 648)
    $sand.AddLine(300, 648, 724, 648)
    $sand.AddBezier(724, 648, 794, 650, 874, 700, 964, 770)
    $sand.CloseFigure()
    $g.FillPath((Grad 60 640 904 130 (C '#F3E2A8') (C '#D7B86C')), $sand)
    $grass = New-Object Drawing.Drawing2D.GraphicsPath
    $grass.AddBezier(105, 742, 180, 680, 240, 628, 300, 626)
    $grass.AddLine(300, 626, 724, 626)
    $grass.AddBezier(724, 626, 784, 628, 844, 680, 919, 742)
    $grass.AddBezier(919, 742, 700, 728, 324, 728, 105, 742)
    $grass.CloseFigure()
    $g.FillPath((Grad 100 600 820 150 (C '#7CC04A') (C '#3E7F2B')), $grass)
    # foam along the beach
    $foam = New-Object Drawing.Drawing2D.GraphicsPath
    $foam.AddBezier(40, 778, 300, 800, 724, 800, 984, 778)
    $g.DrawPath((Pen (C '#FFFFFF' 210) 9), $foam)
    # olive trees
    foreach ($t in @(@(210, 660, 1.0), @(818, 664, 0.9), @(255, 672, 0.75))) {
        $x = $t[0]; $y = $t[1]; $k = $t[2]
        $g.FillRectangle((Brush (C '#6B4A2A')), $x - 5 * $k, $y, 10 * $k, 26 * $k)
        $g.FillEllipse((Brush (C '#2F6B26')), $x - 34 * $k, $y - 50 * $k, 68 * $k, 62 * $k)
        $g.FillEllipse((Brush (C '#4C9234')), $x - 26 * $k, $y - 46 * $k, 46 * $k, 42 * $k)
    }
    # --- temple
    $g.FillEllipse((Brush (C '#1F4A18' 110)), 270, 610, 484, 44)            # its shadow on the grass
    $stone = C '#F4EDE0'; $stoneDark = C '#CDBFA6'
    $steps = @(@(286, 598, 452, 30), @(302, 572, 420, 28), @(318, 550, 388, 24))
    foreach ($s in $steps) {
        $p = Rect $s[0] $s[1] $s[2] $s[3]
        $g.FillPath((Grad $s[0] $s[1] $s[2] $s[3] $stone $stoneDark), $p)
        $g.DrawPath((Pen $ink 5), $p)
    }
    # dark inner wall between the columns
    $g.FillRectangle((Grad 330 380 364 172 (C '#7E6A52') (C '#5C4A36')), 330, 380, 364, 172)
    # six columns
    for ($i = 0; $i -lt 6; $i++) {
        $x = 338 + $i * 62
        $shaft = Rect $x 396 40 154
        $g.FillPath((Grad $x 396 40 154 (C '#FFFFFF') (C '#D4C8B2') 0), $shaft)
        $g.DrawLine((Pen (C '#C4B59B') 3), $x + 14, 404, $x + 14, 544)
        $g.DrawLine((Pen (C '#C4B59B') 3), $x + 27, 404, $x + 27, 544)
        $g.DrawPath((Pen $ink 4), $shaft)
        $cap = Rect ($x - 8) 384 56 14
        $g.FillPath((Brush $stone), $cap); $g.DrawPath((Pen $ink 4), $cap)
    }
    # architrave and frieze
    $arch = Rect 314 342 396 44
    $g.FillPath((Grad 314 342 396 44 $stone $stoneDark), $arch); $g.DrawPath((Pen $ink 5), $arch)
    $g.DrawLine((Pen (C '#B89F78') 4), 318, 362, 706, 362)
    for ($x = 336; $x -le 690; $x += 34) { $g.DrawLine((Pen (C '#B89F78') 3), $x, 366, $x, 382) }
    # cornice
    $corn = Rect 298 328 428 16
    $g.FillPath((Brush $stone), $corn); $g.DrawPath((Pen $ink 5), $corn)
    # terracotta pediment roof with a lighter gable inside and a gold ornament on top
    $roof = Poly @(292, 330, 512, 220, 732, 330)
    $g.FillPath((Grad 292 220 440 110 (C '#E0623A') (C '#A8331C')), $roof); $g.DrawPath((Pen $ink 6), $roof)
    $gable = Poly @(350, 322, 512, 248, 674, 322)
    $g.FillPath((Grad 350 248 324 74 (C '#F0C9A0') (C '#D49C6C')), $gable); $g.DrawPath((Pen (C '#8E3A1E') 4), $gable)
    $g.FillEllipse((Grad 494 196 36 36 (C '#FFF0A0') (C '#C98A14')), 494, 196, 36, 36)
    $g.DrawEllipse((Pen $ink 4), 494, 196, 36, 36)
    # --- small ship with a red sail
    $hull = Poly @(724, 846, 868, 846, 846, 880, 748, 880)
    $g.FillPath((Brush (C '#6B4423')), $hull); $g.DrawPath((Pen (C '#3A2410') 4), $hull)
    $g.DrawLine((Pen (C '#3A2410') 6), 796, 846, 796, 742)
    $sail = Poly @(752, 752, 842, 752, 836, 832, 758, 832)
    $g.FillPath((Grad 752 752 90 80 (C '#E5483A') (C '#A82218') 0), $sail); $g.DrawPath((Pen (C '#5A1A10') 4), $sail)
    $g.FillRectangle((Brush (C '#F6E7C8')), 755, 784, 84, 14)
    # --- waves
    foreach ($w in @(@(120, 900), @(330, 950), @(560, 910), @(220, 1010), @(640, 990), @(900, 940))) {
        $arc = New-Object Drawing.Drawing2D.GraphicsPath
        $arc.AddBezier($w[0], $w[1], $w[0] + 25, $w[1] - 22, $w[0] + 55, $w[1] - 22, $w[0] + 80, $w[1])
        $g.DrawPath((Pen (C '#FFFFFF' 150) 7), $arc)
    }
}

function New-Canvas($size) {
    $b = New-Object Drawing.Bitmap $size, $size, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [Drawing.Graphics]::FromImage($b)
    $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
    @($b, $g)
}
function Resize($src, $size) {
    $r = New-Canvas $size; $r[1].DrawImage($src, 0, 0, $size, $size); $r[1].Dispose(); $r[0]
}

# Adaptive-icon foreground: 108 dp canvas whose middle 72 dp is what the launcher shows.
# Draw at 1536 (the 1024 design in the middle), then scale to 432 px (108 dp at xxxhdpi).
$big = New-Canvas 1536
$big[1].TranslateTransform(256, 256); Draw-Scene $big[1]; $big[1].Dispose()
$fg = Resize $big[0] 432
$fg.Save((Join-Path $root 'app\src\main\res\drawable-nodpi\ic_launcher_fg.png'), [Drawing.Imaging.ImageFormat]::Png)
$fg.Dispose()

# docs/icon.png: the visible 1024 square, rounded corners, 512 px.
$sq = New-Canvas 1024
$sq[1].DrawImage($big[0], -256, -256); $sq[1].Dispose(); $big[0].Dispose()
$rounded = New-Canvas 1024
$rp = New-Object Drawing.Drawing2D.GraphicsPath; $r = 220
$rp.AddArc(0, 0, $r, $r, 180, 90); $rp.AddArc(1024 - $r, 0, $r, $r, 270, 90)
$rp.AddArc(1024 - $r, 1024 - $r, $r, $r, 0, 90); $rp.AddArc(0, 1024 - $r, $r, $r, 90, 90); $rp.CloseFigure()
$rounded[1].FillPath((New-Object Drawing.TextureBrush $sq[0]), $rp); $rounded[1].Dispose()
New-Item -ItemType Directory -Force (Join-Path $root 'docs') | Out-Null
$small = Resize $rounded[0] 512
$small.Save((Join-Path $root 'docs\icon.png'), [Drawing.Imaging.ImageFormat]::Png)
$small.Dispose(); $rounded[0].Dispose(); $sq[0].Dispose()
"Icon written: docs\icon.png, res\drawable-nodpi\ic_launcher_fg.png"
