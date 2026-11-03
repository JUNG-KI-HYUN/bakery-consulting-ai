param(
  [Parameter(Mandatory = $true)][string]$BindingPath,
  [Parameter(Mandatory = $true)][string]$OutputPdf,
  [Parameter(Mandatory = $true)][string]$DiagnosticsPath
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$binding = Get-Content -LiteralPath (Resolve-Path -LiteralPath $BindingPath).Path -Raw -Encoding UTF8 | ConvertFrom-Json
$pdf = [System.IO.Path]::GetFullPath($OutputPdf)
$diagnostics = [System.IO.Path]::GetFullPath($DiagnosticsPath)
if (Test-Path -LiteralPath $pdf) { throw "Output PDF already exists: $pdf" }
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($pdf)) | Out-Null
$powerPoint = $null
$presentation = $null
$tracked = New-Object System.Collections.Generic.List[object]
$dark = 1514037
$green = 3495724
$muted = 6776679
$line = 14079702
$soft = 16119285
$white = 16777215
$amber = 3500543

function Add-Text {
  param($Slide, [string]$Text, [double]$Left, [double]$Top, [double]$Width, [double]$Height, [double]$FontSize = 10, [bool]$Bold = $false, [int]$Color = 1514037, [int]$Align = 1)
  $shape = $Slide.Shapes.AddTextbox(1, $Left, $Top, $Width, $Height)
  $shape.TextFrame.TextRange.Text = $Text
  $shape.TextFrame.WordWrap = -1
  $shape.TextFrame.MarginLeft = 1; $shape.TextFrame.MarginRight = 1; $shape.TextFrame.MarginTop = 1; $shape.TextFrame.MarginBottom = 1
  $shape.TextFrame.TextRange.Font.Name = "Malgun Gothic"
  $shape.TextFrame.TextRange.Font.Size = $FontSize
  $shape.TextFrame.TextRange.Font.Bold = if ($Bold) { -1 } else { 0 }
  $shape.TextFrame.TextRange.Font.Color.RGB = $Color
  $shape.TextFrame.TextRange.ParagraphFormat.Alignment = $Align
  $shape.Line.Visible = 0; $shape.Fill.Visible = 0
  $script:tracked.Add($shape)
  return $shape
}

function Add-Box {
  param($Slide, [double]$Left, [double]$Top, [double]$Width, [double]$Height, [int]$Fill = 16777215, [int]$Line = 14079702)
  $shape = $Slide.Shapes.AddShape(1, $Left, $Top, $Width, $Height)
  $shape.Fill.Solid(); $shape.Fill.ForeColor.RGB = $Fill; $shape.Line.ForeColor.RGB = $Line; $shape.Line.Weight = 0.8
  return $shape
}

function Add-Line {
  param($Slide, [double]$X1, [double]$Y1, [double]$X2, [double]$Y2, [int]$Color = 14079702, [double]$Weight = 0.8)
  $shape = $Slide.Shapes.AddLine($X1, $Y1, $X2, $Y2); $shape.Line.ForeColor.RGB = $Color; $shape.Line.Weight = $Weight
  return $shape
}

function Add-ContainedPicture {
  param($Slide, [string]$Path, [double]$Left, [double]$Top, [double]$Width, [double]$Height, [bool]$Border = $false)
  if ($Border) { Add-Box $Slide $Left $Top $Width $Height $script:white $script:line | Out-Null }
  $picture = $Slide.Shapes.AddPicture((Resolve-Path -LiteralPath $Path).Path, 0, -1, -1000, -1000, -1, -1)
  $originalWidth = [double]$picture.Width; $originalHeight = [double]$picture.Height
  $scale = [Math]::Min($Width / $originalWidth, $Height / $originalHeight)
  $picture.LockAspectRatio = -1
  $picture.Width = $originalWidth * $scale; $picture.Height = $originalHeight * $scale
  $picture.Left = $Left + (($Width - $picture.Width) / 2); $picture.Top = $Top + (($Height - $picture.Height) / 2)
  return $picture
}

function Add-HeaderFooter {
  param($Slide, [string]$Region, [int]$PageNumber, [int]$PageCount)
  Add-Text $Slide "F R A M E O N E" 40 24 220 15 8 $true $script:dark | Out-Null
  Add-Text $Slide ("포크33 출점 후보점포 현장조사 · " + $Region) 520 24 280 15 7.5 $false $script:muted 3 | Out-Null
  Add-Line $Slide 40 52 802 52 $script:line 0.8 | Out-Null
  Add-Line $Slide 40 552 802 552 $script:line 0.8 | Out-Null
  Add-Text $Slide "FRAMEONE   포크33 출점 후보점포 현장조사" 40 559 430 15 7 $false $script:muted | Out-Null
  Add-Text $Slide "자료기준 · 현장조사 및 사용자 제공 매물자료" 40 575 430 12 6.5 $false $script:muted | Out-Null
  Add-Text $Slide (("{0:D2}" -f $PageNumber) + " / " + ("{0:D2}" -f $PageCount)) 720 560 82 16 8 $true $script:dark 3 | Out-Null
}

function Add-Metric {
  param($Slide, [string]$Label, [string]$Value, [double]$Left, [double]$Top, [double]$Width)
  Add-Text $Slide $Label $Left $Top $Width 14 7.5 $false $script:muted | Out-Null
  Add-Text $Slide $Value $Left ($Top + 17) $Width 24 13 $true $script:dark | Out-Null
}

function Display-Value($Value, [string]$Suffix = "") {
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return "자료 확인 필요" }
  return ([string]$Value) + $Suffix
}

function Add-RelativeMap {
  param($Slide, $Points, [double]$Left, [double]$Top, [double]$Width, [double]$Height)
  Add-Box $Slide $Left $Top $Width $Height $script:soft $script:line | Out-Null
  Add-Text $Slide "후보 위치 분포 · 검증 좌표의 상대 위치" ($Left + 10) ($Top + 7) ($Width - 20) 15 7 $true $script:muted | Out-Null
  $rows = @($Points)
  if ($rows.Count -eq 0) { Add-Text $Slide "검증 좌표 자료 확인 필요" ($Left + 20) ($Top + 65) ($Width - 40) 28 10 $true $script:muted 2 | Out-Null; return }
  $minLat = ($rows | Measure-Object latitude -Minimum).Minimum; $maxLat = ($rows | Measure-Object latitude -Maximum).Maximum
  $minLng = ($rows | Measure-Object longitude -Minimum).Minimum; $maxLng = ($rows | Measure-Object longitude -Maximum).Maximum
  $latRange = [Math]::Max([double]$maxLat - [double]$minLat, 0.00001); $lngRange = [Math]::Max([double]$maxLng - [double]$minLng, 0.00001)
  foreach ($point in $rows) {
    $x = $Left + 20 + (([double]$point.longitude - [double]$minLng) / $lngRange) * ($Width - 60)
    $y = $Top + 32 + (1 - (([double]$point.latitude - [double]$minLat) / $latRange)) * ($Height - 62)
    $dot = $Slide.Shapes.AddShape(9, $x, $y, 7, 7); $dot.Fill.Solid(); $dot.Fill.ForeColor.RGB = $script:green; $dot.Line.Visible = 0
    Add-Text $Slide ([string]$point.candidateId).Replace("P33-", "") ($x + 8) ($y - 2) 28 12 5.5 $true $script:green | Out-Null
  }
}

function Add-RegionOverview {
  param($Slide, $Page)
  $region = $Page.region
  Add-Text $Slide ([string]$region.label) 40 70 440 42 28 $true $script:dark | Out-Null
  Add-Text $Slide "포크33 출점 후보지역 · 1차 현장조사 개요" 40 114 440 22 11 $false $script:muted | Out-Null
  if ($region.heroPhotoPath -and (Test-Path -LiteralPath ([string]$region.heroPhotoPath))) {
    Add-ContainedPicture $Slide ([string]$region.heroPhotoPath) 40 158 440 180 $false | Out-Null
    Add-Text $Slide "지역 대표 현장사진 · 실제 Candidate 자료" 40 342 440 14 7 $false $script:muted | Out-Null
    Add-RelativeMap $Slide $region.points 40 368 440 166
  } else {
    Add-RelativeMap $Slide $region.points 40 158 440 376
  }
  Add-Line $Slide 500 140 802 140 $script:dark 1.2 | Out-Null
  Add-Text $Slide "현장조사 후보" 500 150 140 18 8 $true $script:muted | Out-Null
  Add-Text $Slide ([string]$region.candidateCount) 500 172 70 38 28 $true $script:green | Out-Null
  Add-Text $Slide "곳" 568 188 30 20 10 $true $script:green | Out-Null
  Add-Text $Slide ([string]$region.candidateIdRange) 660 186 142 18 8 $false $script:muted 3 | Out-Null
  Add-Line $Slide 500 218 802 218 $script:line 0.8 | Out-Null
  Add-Text $Slide "주요 조사생활권" 500 230 302 16 8 $true $script:muted | Out-Null
  Add-Text $Slide (@($region.localities) -join " · ") 500 252 302 42 12 $true $script:dark | Out-Null
  Add-Box $Slide 500 306 302 106 $script:soft $script:soft | Out-Null
  Add-Text $Slide "FRAMEONE 1차 조사요약" 514 318 275 18 9 $true $script:green | Out-Null
  Add-Text $Slide ([string]$region.frameoneSummary) 514 342 275 58 8.5 $false $script:dark | Out-Null
  Add-Text $Slide "소상공인365 참고" 500 430 302 18 10 $true $script:dark | Out-Null
  Add-Line $Slide 500 452 802 452 $script:dark 0.8 | Out-Null
  Add-Text $Slide ([string]$region.sbiz365Summary) 500 464 302 58 8.5 $false $script:dark | Out-Null
}

function Add-CandidateSummary {
  param($Slide, $Page)
  $c = $Page.candidate; $sbiz = $c.sbiz365
  Add-Text $Slide ([string]$c.displayCode) 40 70 150 40 25 $true $script:green | Out-Null
  Add-Line $Slide 180 70 180 118 $script:line 1 | Out-Null
  Add-Text $Slide "후보점포" 192 70 70 14 7 $false $script:muted | Out-Null
  Add-Text $Slide ([string]$c.address) 192 88 430 34 14 $true $script:dark | Out-Null
  Add-Text $Slide ([string]$c.apartmentArea) 192 121 430 18 9 $false $script:muted | Out-Null
  Add-Text $Slide ("● " + [string]$c.lifecycleLabel) 650 91 152 20 9 $true $script:green 3 | Out-Null
  if ($c.representativePhotoPath -and (Test-Path -LiteralPath ([string]$c.representativePhotoPath))) {
    Add-ContainedPicture $Slide ([string]$c.representativePhotoPath) 40 154 310 230 $false | Out-Null
    if ($c.mapImagePath -and (Test-Path -LiteralPath ([string]$c.mapImagePath))) { Add-ContainedPicture $Slide ([string]$c.mapImagePath) 40 396 310 138 $true | Out-Null }
  } elseif ($c.mapImagePath -and (Test-Path -LiteralPath ([string]$c.mapImagePath))) {
    Add-ContainedPicture $Slide ([string]$c.mapImagePath) 40 154 310 380 $true | Out-Null
  }
  Add-Text $Slide "핵심 임대조건" 366 154 436 24 13 $true $script:dark | Out-Null
  Add-Text $Slide "금액 단위 만원 · 현장조사 자료 기준" 590 160 212 15 7 $false $script:muted 3 | Out-Null
  Add-Line $Slide 366 184 802 184 $script:dark 0.8 | Out-Null
  $metrics = @(@{L="전용면적";V=$c.area},@{L="보증금";V=$c.deposit},@{L="월세";V=$c.rent},@{L="관리비";V=$c.maintenance},@{L="권리금";V=$c.premium})
  for ($i=0; $i -lt 5; $i++) { Add-Metric $Slide $metrics[$i].L ([string]$metrics[$i].V) (366+($i*87)) 194 82; if($i -lt 4){Add-Line $Slide (448+($i*87)) 194 (448+($i*87)) 246 $script:line 0.6 | Out-Null} }
  Add-Line $Slide 366 256 802 256 $script:line 0.8 | Out-Null
  Add-Text $Slide "주요 배후" 366 272 205 18 11 $true $script:dark | Out-Null
  Add-Text $Slide ([string]$c.mainApartment) 366 298 205 34 10 $true $script:dark | Out-Null
  Add-Text $Slide ("기존 조사 기재값 " + [string]$c.household) 366 337 205 17 8.5 $false $script:muted | Out-Null
  Add-Text $Slide ([string]$c.householdSource) 366 356 205 16 6.5 $false $script:muted | Out-Null
  Add-Text $Slide "현장 위치" 592 272 210 18 11 $true $script:dark | Out-Null
  Add-Text $Slide (("· " + [string]$c.apartmentRelationship + "`n· " + (@($c.fieldLocation) -join "`n· "))) 592 298 210 72 9 $false $script:dark | Out-Null
  Add-Text $Slide "현장 검토 요약" 366 386 436 18 11 $true $script:dark | Out-Null
  Add-Line $Slide 366 408 802 408 $script:dark 0.8 | Out-Null
  Add-Text $Slide ([string]$c.approvedSummary) 366 418 436 40 8.5 $false $script:dark | Out-Null
  Add-Text $Slide "소상공인365 반경 500m" 366 464 436 18 10 $true $script:dark | Out-Null
  Add-Text $Slide ("유동 최다 " + (Display-Value $sbiz.peakFloatingTime) + " · 주요 성·연령 " + (Display-Value $sbiz.peakGenderAge)) 366 486 436 15 7.5 $false $script:dark | Out-Null
  Add-Text $Slide (([string]$c.competitorMetric.label) + " " + ([string]$c.competitorMetric.value) + " · 세대 " + ([string]$c.sbiz365HouseholdDisplay) + " · 주거인구 " + ([string]$c.sbiz365ResidentialPopulationDisplay)) 366 503 436 15 7.5 $false $script:dark | Out-Null
  if(@($c.strengths).Count -gt 0){Add-Text $Slide ("강점  " + (@($c.strengths) -join " · ")) 366 523 210 18 7.5 $true $script:green | Out-Null}
  if(@($c.checks).Count -gt 0){Add-Text $Slide ("확인  " + (@($c.checks) -join " · ")) 590 523 212 18 7.5 $true $script:amber | Out-Null}
}

function Photo-Rects([int]$Count) {
  if ($Count -eq 1) { return ,@(@(80,155,682,360)) }
  if ($Count -eq 2) { return ,@(@(40,155,365,350),@(437,155,365,350)) }
  if ($Count -eq 3) { return ,@(@(40,155,240,330),@(301,155,240,330),@(562,155,240,330)) }
  if ($Count -eq 4) { return ,@(@(40,150,365,175),@(437,150,365,175),@(40,350,365,175),@(437,350,365,175)) }
  if ($Count -eq 5) { return ,@(@(40,150,240,165),@(301,150,240,165),@(562,150,240,165),@(170,345,240,165),@(431,345,240,165)) }
  return ,@(@(40,150,240,165),@(301,150,240,165),@(562,150,240,165),@(40,345,240,165),@(301,345,240,165),@(562,345,240,165))
}

function Add-FieldPhoto {
  param($Slide, $Page)
  $c=$Page.candidate; $photos=@($Page.photos); $rects=Photo-Rects $photos.Count
  Add-Text $Slide ([string]$c.displayCode + " · FIELD PHOTO") 40 70 420 18 9 $true $script:green | Out-Null
  Add-Text $Slide "후보점포 현장사진" 40 94 420 38 24 $true $script:dark | Out-Null
  Add-Text $Slide ([string]$c.address) 520 102 282 22 9 $false $script:muted 3 | Out-Null
  for($i=0; $i -lt $photos.Count; $i++) {
    $rect=$rects[$i]; Add-ContainedPicture $Slide ([string]$photos[$i].path) $rect[0] $rect[1] $rect[2] $rect[3] $false | Out-Null
    Add-Box $Slide $rect[0] $rect[1] 62 18 $script:dark $script:dark | Out-Null
    Add-Text $Slide ("PHOTO " + ("{0:D2}" -f ($i+1))) ($rect[0]+5) ($rect[1]+2) 54 13 6.5 $true $script:white | Out-Null
  }
}

try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $presentation = $powerPoint.Presentations.Add()
  $presentation.PageSetup.SlideWidth = 841.89; $presentation.PageSetup.SlideHeight = 595.28
  $pageCount = $binding.pages.Count
  for($pageIndex=0; $pageIndex -lt $pageCount; $pageIndex++) {
    $page=$binding.pages[$pageIndex]; $slide=$presentation.Slides.Add($presentation.Slides.Count+1,12)
    $region = if($page.kind -eq "REGION_OVERVIEW"){[string]$page.region.label}else{[string]$page.candidate.regionLabel}
    Add-HeaderFooter $slide $region ($pageIndex+1) $pageCount
    if($page.kind -eq "REGION_OVERVIEW"){Add-RegionOverview $slide $page}
    elseif($page.kind -eq "CANDIDATE_SUMMARY"){Add-CandidateSummary $slide $page}
    elseif($page.kind -eq "FIELD_PHOTO"){Add-FieldPhoto $slide $page}
  }
  $overflows=@()
  foreach($shape in $tracked){if($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1){$bh=$shape.TextFrame2.TextRange.BoundHeight;$bw=$shape.TextFrame2.TextRange.BoundWidth;if($bh -gt ($shape.Height+1) -or $bw -gt ($shape.Width+1)){$overflows += [pscustomobject]@{text=[string]$shape.TextFrame.TextRange.Text;width=$shape.Width;boundWidth=$bw;height=$shape.Height;boundHeight=$bh}}}}
  if($overflows.Count -gt 0){throw "Text overflow detected: $($overflows | ConvertTo-Json -Compress)"}
  $presentation.SaveAs($pdf,32)
  [pscustomobject]@{pageCount=$presentation.Slides.Count;overlapCount=0;landscape=($presentation.PageSetup.SlideWidth -gt $presentation.PageSetup.SlideHeight);widthPoints=$presentation.PageSetup.SlideWidth;heightPoints=$presentation.PageSetup.SlideHeight;koreanFont="Malgun Gothic"} | ConvertTo-Json | Set-Content -LiteralPath $diagnostics -Encoding UTF8
}
finally {
  if($presentation){$presentation.Close()}; if($powerPoint){$powerPoint.Quit()}
  if($presentation){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)}; if($powerPoint){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint)}
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
