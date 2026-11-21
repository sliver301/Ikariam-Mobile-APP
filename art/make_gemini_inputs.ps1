# Builds the images to give Gemini for extending the city ground upward.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File art\make_gemini_inputs.ps1
Add-Type -AssemblyName System.Drawing
$art = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $art 'source'
$out = Join-Path $art 'for_gemini'
New-Item -ItemType Directory -Force $out | Out-Null

function Load($n) { [Drawing.Image]::FromFile((Join-Path $src $n)) }
$ne = Load 'city_background_ne.jpg'; $nw = Load 'city_background_nw.jpg'
$se = Load 'city_background_se.jpg'; $sw = Load 'city_background_sw.jpg'
$jungle = Load 'jungle.jpg'; $water = Load 'water.jpg'

$J = $jungle.Width              # 272: one jungle column on each side for context
$W = 1920 + 2 * $J              # 2464
$EXT = 640                      # how much new ground to generate above the city

# 1) Full preview: jungle | city (4 tiles + water) | jungle, 1800 tall.
$full = New-Object Drawing.Bitmap $W, 1800
$g = [Drawing.Graphics]::FromImage($full)
$g.DrawImage($jungle, 0, 0, $J, 1800); $g.DrawImage($jungle, $J + 1920, 0, $J, 1800)
$g.DrawImage($ne, $J, 0, 960, 600);    $g.DrawImage($nw, $J + 960, 0, 960, 600)
$g.DrawImage($se, $J, 600, 960, 600);  $g.DrawImage($sw, $J + 960, 600, 960, 600)
$g.DrawImage($water, $J, 1200, 1920, 600)
$g.Dispose()
$full.Save((Join-Path $out 'city_full_preview.png'), [Drawing.Imaging.ImageFormat]::Png)

# 2) Canvas for outpainting: empty (transparent) space on top, then the top 600 px of the city.
$canvas = New-Object Drawing.Bitmap $W, ($EXT + 600), ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [Drawing.Graphics]::FromImage($canvas)
$g.Clear([Drawing.Color]::Transparent)
$g.DrawImage($full, (New-Object Drawing.Rectangle 0, $EXT, $W, 600), (New-Object Drawing.Rectangle 0, 0, $W, 600), [Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$canvas.Save((Join-Path $out 'canvas_extend_up_transparent.png'), [Drawing.Imaging.ImageFormat]::Png)

# Same canvas with a flat grey top, for tools that do not understand transparency.
$grey = New-Object Drawing.Bitmap $W, ($EXT + 600)
$g = [Drawing.Graphics]::FromImage($grey)
$g.Clear([Drawing.Color]::FromArgb(128, 128, 128))
$g.DrawImage($full, (New-Object Drawing.Rectangle 0, $EXT, $W, 600), (New-Object Drawing.Rectangle 0, 0, $W, 600), [Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$grey.Save((Join-Path $out 'canvas_extend_up_grey.png'), [Drawing.Imaging.ImageFormat]::Png)

# 3) Just the top strip, for reference.
$strip = $full.Clone((New-Object Drawing.Rectangle 0, 0, $W, 600), $full.PixelFormat)
$strip.Save((Join-Path $out 'city_top_strip.png'), [Drawing.Imaging.ImageFormat]::Png)

$full.Dispose(); $canvas.Dispose(); $grey.Dispose(); $strip.Dispose()
$ne.Dispose(); $nw.Dispose(); $se.Dispose(); $sw.Dispose(); $jungle.Dispose(); $water.Dispose()
"Wrote files to $out"
Get-ChildItem $out | ForEach-Object { $i = [Drawing.Image]::FromFile($_.FullName); "{0}: {1}x{2}" -f $_.Name, $i.Width, $i.Height; $i.Dispose() }
