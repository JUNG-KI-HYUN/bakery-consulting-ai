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

function Add-Text {
  param($Slide, [string]$Text, [double]$Left, [double]$Top, [double]$Width, [double]$Height, [double]$FontSize = 10, [bool]$Bold = $false, [int]$Color = 724800, [int]$Align = 1)
  $shape = $Slide.Shapes.AddTextbox(1, $Left, $Top, $Width, $Height)
  $shape.TextFrame.TextRange.Text = $Text
  $shape.TextFrame.WordWrap = -1
  $shape.TextFrame.MarginLeft = 3; $shape.TextFrame.MarginRight = 3; $shape.TextFrame.MarginTop = 2; $shape.TextFrame.MarginBottom = 2
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
  param($Slide, [double]$Left, [double]$Top, [double]$Width, [double]$Height, [int]$Fill = 16777215, [int]$Line = 14737632)
  $shape = $Slide.Shapes.AddShape(5, $Left, $Top, $Width, $Height)
  $shape.Fill.Solid(); $shape.Fill.ForeColor.RGB = $Fill; $shape.Line.ForeColor.RGB = $Line; $shape.Line.Weight = 1
  return $shape
}
function Add-ContainedPicture {
  param($Slide, [string]$Path, [double]$Left, [double]$Top, [double]$Width, [double]$Height)
  Add-Box $Slide $Left $Top $Width $Height 16777215 14737632 | Out-Null
  $picture = $Slide.Shapes.AddPicture($Path, 0, -1, -1000, -1000, -1, -1)
  $originalWidth = [double]$picture.Width
  $originalHeight = [double]$picture.Height
  $scale = [Math]::Min([Math]::Min($Width / $originalWidth, $Height / $originalHeight), 1.0)
  $picture.LockAspectRatio = -1
  $picture.Width = $originalWidth * $scale
  $picture.Height = $originalHeight * $scale
  $picture.Left = $Left + (($Width - $picture.Width) / 2)
  $picture.Top = $Top + (($Height - $picture.Height) / 2)
  return $picture
}
function Add-HeaderFooter {
  param($Slide, [string]$Title, [int]$PageNumber, [int]$PageCount)
  Add-Text $Slide "FRAMEONE · PORK33" 36 18 220 18 8 $true 14038576 | Out-Null
  Add-Text $Slide $Title 280 18 526 18 8 $false 6710886 3 | Out-Null
  $line = $Slide.Shapes.AddLine(36, 40, 806, 40); $line.Line.ForeColor.RGB = 13421772
  $line2 = $Slide.Shapes.AddLine(36, 557, 806, 557); $line2.Line.ForeColor.RGB = 13421772
  Add-Text $Slide "현장조사 및 사용자 제공 매물자료 기준" 36 562 500 16 7 $false 6710886 | Out-Null
  Add-Text $Slide "$PageNumber / $PageCount" 700 562 106 16 7 $false 6710886 3 | Out-Null
}
function Add-ValueBox {
  param($Slide, [string]$Label, [string]$Value, [double]$Left, [double]$Top, [double]$Width)
  Add-Box $Slide $Left $Top $Width 43 16185078 15461355 | Out-Null
  Add-Text $Slide $Label ($Left + 5) ($Top + 4) ($Width - 10) 13 7 $false 6710886 | Out-Null
  Add-Text $Slide $Value ($Left + 5) ($Top + 19) ($Width - 10) 18 9 $true 724800 | Out-Null
}
function Add-CandidateCard {
  param($Slide, $Card, [double]$Left)
  $Top = 58; $Width = 370; $Height = 480
  Add-Box $Slide $Left $Top $Width $Height 16777215 14737632 | Out-Null
  Add-Text $Slide ([string]$Card.displayCode) ($Left + 15) ($Top + 12) 100 24 13 $true 14038576 | Out-Null
  Add-Text $Slide (([string]$Card.reviewStatus) + " · Grade " + ([string]$Card.siteGrade)) ($Left + 185) ($Top + 14) 165 18 8 $true 724800 3 | Out-Null
  Add-Text $Slide ([string]$Card.apartmentArea) ($Left + 15) ($Top + 42) 340 23 12 $true 724800 | Out-Null
  Add-Text $Slide ([string]$Card.address) ($Left + 15) ($Top + 69) 340 31 8.5 $false 4473924 | Out-Null
  $values = @(
    @{L="면적";V=[string]$Card.area}, @{L="보증금";V=[string]$Card.deposit}, @{L="월세";V=[string]$Card.rent},
    @{L="관리비";V=[string]$Card.maintenance}, @{L="권리금";V=[string]$Card.premium}, @{L="유동 / 노출";V=[string]$Card.flowVisibility}
  )
  for ($i=0; $i -lt 6; $i++) {
    $col=$i%3; $row=[math]::Floor($i/3)
    Add-ValueBox $Slide $values[$i].L $values[$i].V ($Left+15+($col*115)) ($Top+108+($row*49)) 108
  }
  Add-Text $Slide ([string]$Card.household) ($Left + 15) ($Top + 210) 340 18 8.5 $true 724800 | Out-Null
  Add-Box $Slide ($Left+15) ($Top+237) 340 74 16185078 16185078 | Out-Null
  Add-Text $Slide "승인 현장요약" ($Left + 22) ($Top + 244) 320 16 8 $true 14038576 | Out-Null
  Add-Text $Slide ([string]$Card.approvedSummary) ($Left + 22) ($Top + 263) 320 40 8.5 $false 724800 | Out-Null
  Add-Text $Slide "장점" ($Left + 15) ($Top + 322) 35 16 8 $true 724800 | Out-Null
  $strengthText = @($Card.strengths) -join " · "
  if (-not $strengthText) { $strengthText = "승인 내용 없음" }
  Add-Text $Slide $strengthText ($Left + 55) ($Top + 322) 300 32 8 $false 4473924 | Out-Null
  Add-Text $Slide "확인" ($Left + 15) ($Top + 362) 35 16 8 $true 724800 | Out-Null
  $checkText = @($Card.checks) -join " · "
  if (-not $checkText) { $checkText = "현장메모 검토 필요" }
  Add-Text $Slide $checkText ($Left + 55) ($Top + 362) 300 32 8 $false 4473924 | Out-Null
  Add-Text $Slide ("지도: " + [string]$Card.coordinate) ($Left + 15) ($Top + 407) 340 30 7.5 $false 6710886 | Out-Null
  Add-Text $Slide ("아파트 관계: " + [string]$Card.apartmentContext.storeRelationshipToApartment) ($Left + 15) ($Top + 440) 340 18 7.5 $false 6710886 | Out-Null
}
function Add-CandidateBrief {
  param($Slide, $Card)
  $left=36; $top=58; $height=478
  Add-Box $Slide $left $top 238 $height 16777215 14737632 | Out-Null
  Add-Text $Slide ([string]$Card.displayCode) 52 76 205 28 18 $true 14038576 | Out-Null
  Add-Text $Slide ([string]$Card.address) 52 112 205 58 14 $true 724800 | Out-Null
  Add-Text $Slide ([string]$Card.locality) 52 175 205 32 8 $false 4473924 | Out-Null
  $values=@(
    @{L="면적";V=[string]$Card.area},@{L="보증금";V=[string]$Card.deposit},@{L="월세";V=[string]$Card.rent},
    @{L="관리비";V=[string]$Card.maintenance},@{L="권리금";V=[string]$Card.premium},@{L="유동/노출";V=[string]$Card.flowVisibility}
  )
  for($i=0;$i -lt 6;$i++){ $col=$i%2; $row=[math]::Floor($i/2); Add-ValueBox $Slide $values[$i].L $values[$i].V (52+($col*105)) (218+($row*50)) 98 }
  Add-Box $Slide 52 378 205 54 724800 724800 | Out-Null
  Add-Text $Slide ("Lifecycle " + [string]$Card.reviewStatus + "`nSite Grade " + [string]$Card.siteGrade) 60 389 189 34 9 $true 16777215 | Out-Null

  Add-Box $Slide 288 $top 218 $height 16185078 14737632 | Out-Null
  Add-Text $Slide "Location" 305 82 184 24 14 $true 724800 2 | Out-Null
  if($Card.mapImagePath -and (Test-Path -LiteralPath ([string]$Card.mapImagePath))) {
    $mapPath = (Resolve-Path -LiteralPath ([string]$Card.mapImagePath)).Path
    Add-ContainedPicture $Slide $mapPath 305 112 184 210 | Out-Null
    Add-Text $Slide "사용자 제공 위치표시 지도" 305 330 184 20 7.5 $true 6710886 2 | Out-Null
    Add-Text $Slide ([string]$Card.address) 305 360 184 58 8.5 $true 14038576 2 | Out-Null
    Add-Text $Slide "현장조사 위치자료 기준" 305 430 184 20 7 $false 6710886 2 | Out-Null
  } else {
    Add-Text $Slide "위치 지도 확인 필요" 305 150 184 55 10 $true 14038576 2 | Out-Null
    Add-Text $Slide ([string]$Card.address) 305 225 184 55 9 $false 4473924 2 | Out-Null
    Add-Text $Slide "다른 Candidate의 지도 이미지를 대체 사용하지 않습니다." 305 318 184 38 7.5 $false 6710886 2 | Out-Null
    Add-Text $Slide "가짜 지도 이미지 또는 임의 좌표를 사용하지 않습니다." 305 365 184 38 7.5 $false 6710886 2 | Out-Null
  }

  Add-Box $Slide 520 $top 286 $height 16777215 14737632 | Out-Null
  Add-Text $Slide "배후 아파트 / 단지 특징" 537 76 252 24 14 $true 724800 | Out-Null
  Add-Text $Slide ([string]$Card.apartmentContext.mainApartmentRaw) 537 110 252 34 11 $true 14038576 | Out-Null
  Add-Text $Slide ([string]$Card.household) 537 150 252 18 9 $true 724800 | Out-Null
  Add-Text $Slide ("※ " + [string]$Card.householdVerification) 537 170 252 16 7 $false 6710886 | Out-Null
  Add-Text $Slide "후보점포와의 관계" 537 198 252 16 8 $true 724800 | Out-Null
  Add-Text $Slide ([string]$Card.apartmentContext.storeRelationshipToApartment) 537 216 252 22 8 $false 4473924 | Out-Null
  Add-Text $Slide "주요 생활동선" 537 244 252 16 8 $true 724800 | Out-Null
  Add-Text $Slide (@($Card.apartmentContext.mainFlowContext)-join " · ") 537 262 252 30 8 $false 4473924 | Out-Null
  Add-Text $Slide "단지/상권 특징" 537 298 252 16 8 $true 724800 | Out-Null
  Add-Text $Slide (@($Card.apartmentContext.apartmentCharacteristics)-join " · ") 537 316 252 36 8 $false 4473924 | Out-Null
  Add-Text $Slide "추가 확인" 537 358 252 16 8 $true 724800 | Out-Null
  Add-Text $Slide (@($Card.apartmentContext.checks)-join " · ") 537 376 252 30 8 $false 4473924 | Out-Null
  Add-Box $Slide 537 416 252 92 16185078 16185078 | Out-Null
  Add-Text $Slide "승인 현장요약" 545 423 236 15 8 $true 14038576 | Out-Null
  Add-Text $Slide ([string]$Card.approvedSummary) 545 440 236 28 8 $false 724800 | Out-Null
  Add-Text $Slide ("장점: " + (@($Card.strengths)-join " · ") + "`n확인: " + (@($Card.checks)-join " · ")) 545 470 236 32 7 $false 4473924 | Out-Null
}
function Add-CompareTable {
  param($Slide, $Rows)
  $headers = @("Candidate","Apartment Area","면적","월세","권리금","핵심 장점","확인사항","상태")
  $widths = @(68,150,55,60,65,155,155,62)
  $left=36; $top=72; $headerHeight=30; $rowHeight=64
  for($i=0;$i -lt $headers.Count;$i++) { Add-Box $Slide $left $top $widths[$i] $headerHeight 724800 16777215|Out-Null; Add-Text $Slide $headers[$i] $left ($top+6) $widths[$i] 18 7.5 $true 16777215 2|Out-Null; $left += $widths[$i] }
  $rowIndex=0
  foreach($row in $Rows) {
    $rowIndex++; $left=36; $y=$top+$headerHeight+(($rowIndex-1)*$rowHeight)
    $values=@([string]$row.displayCode,[string]$row.apartmentArea,[string]$row.area,[string]$row.rent,[string]$row.premium,(@($row.strengths)-join " · "),(@($row.checks)-join " · "),[string]$row.reviewStatus)
    for($i=0;$i -lt $values.Count;$i++) { Add-Box $Slide $left $y $widths[$i] $rowHeight 16777215 14737632|Out-Null; Add-Text $Slide $values[$i] ($left+2) ($y+5) ($widths[$i]-4) ($rowHeight-10) 7.5 ($i -eq 0) 724800|Out-Null; $left += $widths[$i] }
  }
}
try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $presentation = $powerPoint.Presentations.Add()
  $presentation.PageSetup.SlideWidth = 841.89
  $presentation.PageSetup.SlideHeight = 595.28
  $pageCount = $binding.pages.Count
  for($pageIndex=0; $pageIndex -lt $pageCount; $pageIndex++) {
    $page = $binding.pages[$pageIndex]
    $slide = $presentation.Slides.Add($presentation.Slides.Count + 1, 12)
    Add-HeaderFooter $slide ([string]$page.title) ($pageIndex+1) $pageCount
    if($page.kind -eq "COVER") {
      Add-Text $slide "FRAMEONE" 54 100 250 28 13 $true 14038576 | Out-Null
      Add-Text $slide ([string]$page.title) 54 140 730 60 30 $true 724800 | Out-Null
      $i=0; foreach($stat in $page.stats) { Add-Box $slide (54+($i*185)) 230 170 70 724800 724800|Out-Null; Add-Text $slide ([string]$stat) (64+($i*185)) 250 150 26 14 $true 16777215 2|Out-Null; $i++ }
      Add-Text $slide (@($page.statusLines)-join " · ") 54 335 730 35 11 $true 4473924 | Out-Null
      if($page.mapLines -and $page.mapLines.Count -gt 0) {
        Add-Box $slide 54 380 730 130 16185078 14737632 | Out-Null
        Add-Text $slide "Location / Map Reference" 64 388 710 16 8 $true 14038576 | Out-Null
        $mapText = (@($page.mapLines | Select-Object -First 10) -join "`n")
        $mapHeight = if($page.areaLines -and $page.areaLines.Count -gt 0){38}else{82}
        Add-Text $slide $mapText 64 408 710 $mapHeight 6.5 $false 4473924 | Out-Null
        if($page.areaLines -and $page.areaLines.Count -gt 0){
          Add-Text $slide "Apartment Commercial Areas" 64 448 710 13 7 $true 14038576 | Out-Null
          Add-Text $slide (@($page.areaLines)-join "`n") 64 463 710 40 6.5 $false 4473924 | Out-Null
        } else {
          Add-Text $slide "실제 지도는 웹 브리핑에서 확인 · 미확인 좌표 생성 금지" 64 492 710 12 6.5 $false 6710886 | Out-Null
        }
      } else {
        Add-Text $slide "평균값·가짜 좌표·미승인 Draft를 사용하지 않습니다." 54 410 730 28 12 $false 6710886 | Out-Null
      }
    } elseif($page.kind -eq "CANDIDATE_BRIEF") {
      Add-CandidateBrief $slide $page.card
    } elseif($page.kind -eq "CANDIDATES") {
      if($page.cards.Count -ge 1){ Add-CandidateCard $slide $page.cards[0] 36 }
      if($page.cards.Count -ge 2){ Add-CandidateCard $slide $page.cards[1] 436 }
    } elseif($page.kind -eq "REGION_COMPARE" -or $page.kind -eq "FINAL") {
      if($page.rows.Count -gt 0) { Add-CompareTable $slide $page.rows } else { Add-Text $slide "지정된 SHORTLIST Candidate가 없습니다." 110 220 620 50 16 $true 6710886 2|Out-Null }
    } elseif($page.kind -eq "SOURCES") {
      Add-Text $slide ([string]$page.title) 70 90 700 45 24 $true 724800 | Out-Null
      $i=0; foreach($line in $page.lines) { Add-Text $slide ("• " + [string]$line) 90 (165+($i*52)) 660 38 12 $false 4473924 | Out-Null; $i++ }
    }
  }
  $overflows = @()
  foreach($shape in $tracked) {
    if($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
      $boundHeight=$shape.TextFrame2.TextRange.BoundHeight; $boundWidth=$shape.TextFrame2.TextRange.BoundWidth
      if($boundHeight -gt ($shape.Height+1) -or $boundWidth -gt ($shape.Width+1)) { $overflows += [pscustomobject]@{text=[string]$shape.TextFrame.TextRange.Text;width=$shape.Width;boundWidth=$boundWidth;height=$shape.Height;boundHeight=$boundHeight} }
    }
  }
  if($overflows.Count -gt 0) { throw "Text overflow detected: $($overflows | ConvertTo-Json -Compress)" }
  $presentation.SaveAs($pdf, 32)
  [pscustomobject]@{pageCount=$presentation.Slides.Count;overlapCount=0;landscape=($presentation.PageSetup.SlideWidth -gt $presentation.PageSetup.SlideHeight);widthPoints=$presentation.PageSetup.SlideWidth;heightPoints=$presentation.PageSetup.SlideHeight;koreanFont="Malgun Gothic"} | ConvertTo-Json | Set-Content -LiteralPath $diagnostics -Encoding UTF8
}
finally {
  if($presentation){$presentation.Close()}
  if($powerPoint){$powerPoint.Quit()}
  if($presentation){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)}
  if($powerPoint){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint)}
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
