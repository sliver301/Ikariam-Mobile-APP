# Builds the app icon: the mayor picture with a red "mobile" banner, drawn sharp at 1024 px.
#   powershell -ExecutionPolicy Bypass -File art\make_icon.ps1 [-Picture <square image>]
# Writes: app/src/main/res/drawable-nodpi/ic_launcher_fg.png (adaptive icon foreground) and docs/icon.png.
param([string]$Picture = '')
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class IconFx {
    // Fades the left and right `f` px of an image to transparent so it blends into what is behind it.
    public static void FadeSides(Bitmap b, int f) {
        var d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        var a = new int[b.Width * b.Height]; Marshal.Copy(d.Scan0, a, 0, a.Length);
        for (int y = 0; y < b.Height; y++) for (int x = 0; x < b.Width; x++) {
            int dist = Math.Min(x, b.Width - 1 - x); if (dist >= f) continue;
            double k = (double)dist / f; k = k * k * (3 - 2 * k);
            int i = y * b.Width + x; int al = (int)(((a[i] >> 24) & 255) * k); a[i] = (a[i] & 0xFFFFFF) | (al << 24);
        }
        Marshal.Copy(a, 0, d.Scan0, a.Length); b.UnlockBits(d);
    }
}
"@
$art = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $art
if (-not $Picture) { $Picture = Join-Path $art 'generated\Ikariam Icon.jpg' }

$N = 1024
$src = [Drawing.Image]::FromFile($Picture)
$icon = New-Object Drawing.Bitmap $N, $N, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [Drawing.Graphics]::FromImage($icon)
$g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'; $g.PixelOffsetMode = 'HighQuality'
# sky backdrop (picture enlarged), then the mayor a bit smaller and higher so the whole beard shows above the banner
$g.DrawImage($src, -60, -60, $N + 120, $N + 120)
$mayor = New-Object Drawing.Bitmap 920, 920, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gm = [Drawing.Graphics]::FromImage($mayor); $gm.InterpolationMode = 'HighQualityBicubic'; $gm.DrawImage($src, 0, 0, 920, 920); $gm.Dispose()
[IconFx]::FadeSides($mayor, 110)
$g.DrawImage($mayor, 52, -28, 920, 920); $mayor.Dispose()
$src.Dispose()

function C($hex) { [Drawing.ColorTranslator]::FromHtml($hex) }

# Banner: curved top edge across the bottom of the icon.
$top = 772; $edge = 862
$banner = New-Object Drawing.Drawing2D.GraphicsPath
$banner.AddBezier(-20, $edge, 330, $top, 694, $top, $N + 20, $edge)
$banner.AddLine($N + 20, $edge, $N + 20, $N + 20)
$banner.AddLine($N + 20, $N + 20, -20, $N + 20)
$banner.CloseFigure()
$red = New-Object Drawing.Drawing2D.LinearGradientBrush((New-Object Drawing.Rectangle 0, $top, $N, ($N - $top)), (C '#A3141A'), (C '#5C0609'), 90)
$g.FillPath($red, $banner)
# soft highlight along the upper part of the banner
$hl = New-Object Drawing.Drawing2D.LinearGradientBrush((New-Object Drawing.Rectangle 0, $top, $N, 140), ([Drawing.Color]::FromArgb(70, 255, 120, 110)), ([Drawing.Color]::FromArgb(0, 255, 120, 110)), 90)
$g.FillPath($hl, $banner)

# Gold rim along the curve (dark outline, then a gold band with a light centre line).
$curve = New-Object Drawing.Drawing2D.GraphicsPath
$curve.AddBezier(-20, $edge, 330, $top, 694, $top, $N + 20, $edge)
$penDark = New-Object Drawing.Pen((C '#4A2A06'), 30); $penDark.LineJoin = 'Round'
$g.DrawPath($penDark, $curve)
$goldBrush = New-Object Drawing.Drawing2D.LinearGradientBrush((New-Object Drawing.Rectangle 0, ($top - 20), $N, 120), (C '#FFF0A0'), (C '#B8771A'), 90)
$penGold = New-Object Drawing.Pen($goldBrush, 20); $penGold.LineJoin = 'Round'
$g.DrawPath($penGold, $curve)
$penShine = New-Object Drawing.Pen(([Drawing.Color]::FromArgb(170, 255, 250, 215)), 5)
$g.DrawPath($penShine, $curve)

# "mobile" in gold with a dark outline and a soft shadow.
$fam = New-Object Drawing.FontFamily 'Berlin Sans FB Demi'
$fmt = New-Object Drawing.StringFormat; $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
$textRect = New-Object Drawing.RectangleF 0, 832, $N, 192
$text = New-Object Drawing.Drawing2D.GraphicsPath
$text.AddString('mobile', $fam, [int][Drawing.FontStyle]::Bold, 200, $textRect, $fmt)
$shadow = $text.Clone(); $m = New-Object Drawing.Drawing2D.Matrix; $m.Translate(0, 9); $shadow.Transform($m)
$g.FillPath((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(140, 30, 5, 0))), $shadow)
$outline = New-Object Drawing.Pen((C '#3E1E04'), 16); $outline.LineJoin = 'Round'
$g.DrawPath($outline, $text)
$b = $text.GetBounds()
$textGold = New-Object Drawing.Drawing2D.LinearGradientBrush((New-Object Drawing.RectangleF $b.X, $b.Y, $b.Width, $b.Height), (C '#FFF6B0'), (C '#C17A12'), 90)
$blend = New-Object Drawing.Drawing2D.ColorBlend 3
$blend.Colors = @((C '#FFF6B8'), (C '#F7C443'), (C '#B8700F')); $blend.Positions = @(0.0, 0.5, 1.0)
$textGold.InterpolationColors = $blend
$g.FillPath($textGold, $text)
$g.Dispose()

# docs/icon.png (512) for the GitHub page.
New-Item -ItemType Directory -Force (Join-Path $root 'docs') | Out-Null
$small = New-Object Drawing.Bitmap 512, 512
$gs = [Drawing.Graphics]::FromImage($small); $gs.InterpolationMode = 'HighQualityBicubic'; $gs.SmoothingMode = 'AntiAlias'
$gs.DrawImage($icon, 0, 0, 512, 512); $gs.Dispose()
$small.Save((Join-Path $root 'docs\icon.png'), [Drawing.Imaging.ImageFormat]::Png); $small.Dispose()

# Adaptive icon foreground: 432 px canvas (108 dp at xxxhdpi). The launcher shows the middle
# 72 dp (288 px), so the full design goes there; the hidden margin gets the picture enlarged.
$fg = New-Object Drawing.Bitmap 432, 432
$gf = [Drawing.Graphics]::FromImage($fg); $gf.InterpolationMode = 'HighQualityBicubic'; $gf.SmoothingMode = 'AntiAlias'; $gf.PixelOffsetMode = 'HighQuality'
$gf.DrawImage($icon, -72, -72, 576, 576)
$gf.DrawImage($icon, 72, 72, 288, 288)
$gf.Dispose()
$fg.Save((Join-Path $root 'app\src\main\res\drawable-nodpi\ic_launcher_fg.png'), [Drawing.Imaging.ImageFormat]::Png); $fg.Dispose()

$icon.Save((Join-Path $art 'generated\icon_1024.png'), [Drawing.Imaging.ImageFormat]::Png); $icon.Dispose()
"Icon written: docs\icon.png, res\drawable-nodpi\ic_launcher_fg.png, art\generated\icon_1024.png"
