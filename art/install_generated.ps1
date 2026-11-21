# Installs a Gemini-extended city picture into the app.
#
#   1. Save Gemini's result as  art\generated\city_extended.png  (or .jpg)
#   2. Run:  powershell -ExecutionPolicy Bypass -File art\install_generated.ps1
#   3. Rebuild the app (build.bat).
#
# The picture must be the canvas we gave Gemini (2464 x 1240 layout: new ground on top, the
# city's real top edge at the bottom). Any size / small shifts are fine: the script scales it
# to 2464 px wide and finds where the real city edge sits by matching pixels.
param([string]$Picture = '')

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class Art {
    static int[] Px(Bitmap b) {
        var d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        var a = new int[b.Width * b.Height]; Marshal.Copy(d.Scan0, a, 0, a.Length); b.UnlockBits(d); return a;
    }
    static int Lum(int c) { return ((c >> 16) & 255) * 3 + ((c >> 8) & 255) * 6 + (c & 255); }
    // Finds the row in `gen` where the top of `strip` (the real city edge) best matches.
    public static int FindEdge(Bitmap gen, Bitmap strip, int guess, int range) {
        int step = 4, w = Math.Min(gen.Width, strip.Width), rows = 160;
        int[] g = Px(gen), s = Px(strip); int best = guess; double bestErr = double.MaxValue;
        for (int off = Math.Max(0, guess - range); off <= Math.Min(gen.Height - rows, guess + range); off++) {
            double err = 0;
            for (int y = 0; y < rows; y += step) for (int x = 0; x < w; x += step)
                err += Math.Abs(Lum(g[(off + y) * gen.Width + x]) - Lum(s[y * strip.Width + x]));
            if (err < bestErr) { bestErr = err; best = off; }
        }
        return best;
    }
    // Fades the bottom `fade` rows of `img` to transparent.
    public static void FadeBottom(Bitmap img, int fade) {
        var d = img.LockBits(new Rectangle(0, 0, img.Width, img.Height), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        var a = new int[img.Width * img.Height]; Marshal.Copy(d.Scan0, a, 0, a.Length);
        for (int y = img.Height - fade; y < img.Height; y++) {
            double k = 1.0 - (double)(y - (img.Height - fade) + 1) / (fade + 1);
            for (int x = 0; x < img.Width; x++) { int i = y * img.Width + x; int al = (int)(((a[i] >> 24) & 255) * k); a[i] = (a[i] & 0xFFFFFF) | (al << 24); }
        }
        Marshal.Copy(a, 0, d.Scan0, a.Length); img.UnlockBits(d);
    }
}
'@

$art = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $art
if (-not $Picture) {
    $Picture = Get-ChildItem (Join-Path $art 'generated') -File | Where-Object { $_.Extension -match '^\.(png|jpe?g|webp)$' } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Picture -or -not (Test-Path $Picture)) { throw "Put Gemini's picture in art\generated\ first." }
"Using: $Picture"

$SIDE = 272; $W = 1920 + 2 * $SIDE; $OVERLAP = 60
$strip = [Drawing.Bitmap]::FromFile((Join-Path $art 'for_gemini\city_top_strip.png'))

# Scale Gemini's picture to 2464 px wide.
$src = [Drawing.Bitmap]::FromFile($Picture)
$H = [int][Math]::Round($src.Height * $W / $src.Width)
$gen = New-Object Drawing.Bitmap $W, $H, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [Drawing.Graphics]::FromImage($gen); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($src, 0, 0, $W, $H); $g.Dispose(); $src.Dispose()

# Where does the real city edge start in Gemini's picture? Expected: 600 px from the bottom.
$edge = [Art]::FindEdge($gen, $strip, [Math]::Max(0, $H - 600), 120)
"Scaled to ${W}x$H, city edge found at row $edge (expected about $($H - 600))"
if ($edge -lt 200) { throw "Gemini added only $edge px above the city; ask it to extend further upward." }

# Keep: everything above the edge + OVERLAP px of the edge (faded out over the real art).
$outH = $edge + $OVERLAP
$out = $gen.Clone((New-Object Drawing.Rectangle 0, 0, $W, $outH), [Drawing.Imaging.PixelFormat]::Format32bppArgb)
[Art]::FadeBottom($out, $OVERLAP)
$assets = Join-Path $root 'app\src\main\assets\art'
New-Item -ItemType Directory -Force $assets | Out-Null
$file = 'city_top.png'
$out.Save((Join-Path $assets $file), [Drawing.Imaging.ImageFormat]::Png)
$out.Dispose(); $gen.Dispose(); $strip.Dispose()

# Manifest: which city tiles this picture belongs to (the hash part of the game's tile URLs).
$urls = Get-Content (Join-Path $art 'source\urls.json') -Raw | ConvertFrom-Json
function Hash($u) { [IO.Path]::GetFileNameWithoutExtension(([Uri]$u).AbsolutePath) }
$pairs = New-Object System.Collections.ArrayList
[void]$pairs.Add(@((Hash $urls.city_background_ne), (Hash $urls.city_background_nw)))
# Every city layout (5 phases, normal + capital) has the same top edge, so the one picture
# fits all of them: list each layout's top tiles (from art\source\layouts\layouts.json).
$layoutsFile = Join-Path $art 'source\layouts\layouts.json'
if (Test-Path $layoutsFile) {
    $layouts = Get-Content $layoutsFile -Raw | ConvertFrom-Json
    foreach ($p in $layouts.PSObject.Properties) {
        $pair = @((Hash $p.Value.ne), (Hash $p.Value.nw))
        if (-not ($pairs | Where-Object { $_[0] -eq $pair[0] -and $_[1] -eq $pair[1] })) { [void]$pairs.Add($pair) }
    }
}
$entries = foreach ($pair in $pairs) {
    @{ tiles = $pair; file = $file; side = $SIDE; width = $W; ext = $edge; overlap = $OVERLAP }
}
$manifest = @{ cityTop = @($entries) }
"Layouts covered: $($pairs.Count)"
$manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $assets 'manifest.json') -Encoding ascii
"Installed $file (${W}x$outH) and manifest.json in $assets. Now rebuild the app."
