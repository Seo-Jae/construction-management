# Convert the supplied emblem to Windows icon/installer formats without changing its design.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetDir = Join-Path $PSScriptRoot '../assets'
$source = [System.Drawing.Image]::FromFile((Join-Path $assetDir 'emblem-source.png'))

function Convert-EmblemBitmap([int]$width, [int]$height, [int]$emblemSize, [int]$left, [int]$top, [System.Drawing.Color]$background) {
    $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear($background)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($source, $left, $top, $emblemSize, $emblemSize)
    } finally { $graphics.Dispose() }
    return $bitmap
}

try {
    if ($source.Width -ne $source.Height) { throw 'The emblem source must be square to preserve its proportions.' }
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $frames = [System.Collections.Generic.List[byte[]]]::new()
    foreach ($size in $sizes) {
        $bitmap = Convert-EmblemBitmap $size $size $size 0 0 ([System.Drawing.Color]::Navy)
        $memory = [System.IO.MemoryStream]::new()
        try {
            $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
            $frames.Add($memory.ToArray())
            if ($size -eq 256) { $bitmap.Save((Join-Path $assetDir 'app.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
        } finally { $memory.Dispose(); $bitmap.Dispose() }
    }
    $stream = [System.IO.File]::Create((Join-Path $assetDir 'app.ico'))
    $writer = [System.IO.BinaryWriter]::new($stream)
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
        $offset = 6 + 16 * $sizes.Count
        for ($index = 0; $index -lt $sizes.Count; $index++) {
            $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
            $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
            $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([uint16]1); $writer.Write([uint16]32)
            $writer.Write([uint32]$frames[$index].Length); $writer.Write([uint32]$offset)
            $offset += $frames[$index].Length
        }
        foreach ($frame in $frames) { $writer.Write($frame) }
    } finally { $writer.Dispose(); $stream.Dispose() }
    $header = Convert-EmblemBitmap 150 57 57 93 0 ([System.Drawing.Color]::White)
    $sidebar = Convert-EmblemBitmap 164 314 164 0 75 ([System.Drawing.Color]::FromArgb(3, 19, 48))
    try {
        $header.Save((Join-Path $assetDir 'installer-header.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
        $sidebar.Save((Join-Path $assetDir 'installer-sidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
    } finally { $header.Dispose(); $sidebar.Dispose() }
} finally { $source.Dispose() }
