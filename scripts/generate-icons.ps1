[CmdletBinding()]
param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\appPackage")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function New-ParkAssistIcon {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [int]$Size,
    [Parameter(Mandatory)] [bool]$OutlineOnly
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $scale = $Size / 192.0
    if (-not $OutlineOnly) {
      $graphics.FillRectangle([System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#0078D4")), 0, 0, $Size, $Size)
    }

    $white = [System.Drawing.Color]::White
    $stroke = [Math]::Max(2.0, 12.0 * $scale)
    $pen = [System.Drawing.Pen]::new($white, $stroke)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    try {
      $garage = [System.Drawing.Drawing2D.GraphicsPath]::new()
      try {
        $garage.StartFigure()
        $garage.AddLine(42 * $scale, 150 * $scale, 42 * $scale, 77 * $scale)
        $garage.AddBezier(42 * $scale, 77 * $scale, 42 * $scale, 57 * $scale, 54 * $scale, 46 * $scale, 73 * $scale, 46 * $scale)
        $garage.AddLine(73 * $scale, 46 * $scale, 119 * $scale, 46 * $scale)
        $garage.AddBezier(119 * $scale, 46 * $scale, 138 * $scale, 46 * $scale, 150 * $scale, 57 * $scale, 150 * $scale, 77 * $scale)
        $garage.AddLine(150 * $scale, 77 * $scale, 150 * $scale, 150 * $scale)
        $graphics.DrawPath($pen, $garage)
      } finally {
        $garage.Dispose()
      }

      $graphics.DrawLine($pen, 53 * $scale, 113 * $scale, 65 * $scale, 91 * $scale)
      $graphics.DrawLine($pen, 65 * $scale, 91 * $scale, 123 * $scale, 91 * $scale)
      $graphics.DrawLine($pen, 123 * $scale, 91 * $scale, 137 * $scale, 113 * $scale)
      $graphics.DrawLine($pen, 53 * $scale, 113 * $scale, 137 * $scale, 113 * $scale)

      $wheelRadius = 10 * $scale
      $wheelBrush = [System.Drawing.SolidBrush]::new($white)
      try {
        $graphics.FillEllipse($wheelBrush, 61 * $scale, 113 * $scale, $wheelRadius * 2, $wheelRadius * 2)
        $graphics.FillEllipse($wheelBrush, 111 * $scale, 113 * $scale, $wheelRadius * 2, $wheelRadius * 2)
      } finally {
        $wheelBrush.Dispose()
      }

      $lensBrush = [System.Drawing.SolidBrush]::new($(if ($OutlineOnly) { $white } else { [System.Drawing.ColorTranslator]::FromHtml("#50E6FF") }))
      try {
        $graphics.FillEllipse($lensBrush, 131 * $scale, 30 * $scale, 35 * $scale, 35 * $scale)
      } finally {
        $lensBrush.Dispose()
      }
    } finally {
      $pen.Dispose()
    }

    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null
New-ParkAssistIcon -Path (Join-Path $resolvedOutput "color.png") -Size 192 -OutlineOnly $false
New-ParkAssistIcon -Path (Join-Path $resolvedOutput "outline.png") -Size 32 -OutlineOnly $true
Write-Host "Generated app icons in $resolvedOutput"
