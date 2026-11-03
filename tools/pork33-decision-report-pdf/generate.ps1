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
$red = 2697613

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
  param($Slide, [double]$Left, [double]$Top, [double]$Width, [double]$Height, [int]$Fill = 16777215, [int]$Line = 14079702, [double]$Radius = 0)
  $shapeType = if ($Radius -gt 0) { 5 } else { 1 }
  $shape = $Slide.Shapes.AddShape($shapeType, $Left, $Top, $Width, $Height)
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
  Add-Text $Slide ("포크33 의사결정 리포트 V2 · " + $Region) 500 24 302 15 7.5 $false $script:muted 3 | Out-Null
  Add-Line $Slide 40 52 802 52 $script:line 0.8 | Out-Null
  Add-Line $Slide 40 552 802 552 $script:line 0.8 | Out-Null
  Add-Text $Slide "FRAMEONE   현장조사 및 사용자 제공 자료 기준" 40 559 470 15 7 $false $script:muted | Out-Null
  Add-Text $Slide "수요지표는 후보별 범위·분포이며 합계가 아닙니다." 40 575 470 12 6.5 $false $script:muted | Out-Null
  Add-Text $Slide (("{0:D2}" -f $PageNumber) + " / " + ("{0:D2}" -f $PageCount)) 720 560 82 16 8 $true $script:dark 3 | Out-Null
}

function Add-Metric {
  param($Slide, [string]$Label, [string]$Value, [double]$Left, [double]$Top, [double]$Width)
  Add-Text $Slide $Label $Left $Top $Width 14 7.5 $false $script:muted | Out-Null
  Add-Text $Slide $Value $Left ($Top + 17) $Width 24 13 $true $script:dark | Out-Null
}

function Add-DecisionMetric {
  param($Slide, [string]$Label, [string]$Value, [double]$Left, [double]$Top, [double]$Width, [double]$ValueHeight = 22, [double]$ValueSize = 9.5)
  Add-Text $Slide $Label $Left $Top $Width 12 7 $false $script:muted | Out-Null
  Add-Text $Slide $Value $Left ($Top + 13) $Width $ValueHeight $ValueSize $true $script:dark | Out-Null
  Add-Line $Slide $Left ($Top + 13 + $ValueHeight + 2) ($Left + $Width) ($Top + 13 + $ValueHeight + 2) $script:line 0.5 | Out-Null
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
  } else { Add-RelativeMap $Slide $region.points 40 158 440 376 }
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

function Add-RegionDemand {
  param($Slide, $Page)
  $d = $Page.demand
  Add-Text $Slide "REGION DEMAND SUMMARY" 40 70 330 16 8 $true $script:green | Out-Null
  Add-Text $Slide ([string]$d.regionLabel + " 상권·수요") 40 91 520 36 24 $true $script:dark | Out-Null
  Add-Text $Slide "후보별 반경 500m Snapshot의 범위와 분포" 40 127 480 18 9 $false $script:muted | Out-Null
  Add-Box $Slide 40 158 440 270 $script:soft $script:line | Out-Null
  Add-Text $Slide "APARTMENT AREA DISTRIBUTION · 비지리 배치" 52 168 416 14 7 $true $script:muted | Out-Null
  $areas = @($d.apartmentAreas); $cols = 3; $boxW = 126; $boxH = 54; $gapX = 12; $gapY = 12
  for($i=0; $i -lt $areas.Count; $i++) {
    $row=[Math]::Floor($i/$cols); $col=$i%$cols; $x=58+($col*($boxW+$gapX)); $y=198+($row*($boxH+$gapY))
    Add-Box $Slide $x $y $boxW $boxH $script:white $script:green 8 | Out-Null
    Add-Text $Slide ([string]$areas[$i].label) ($x+6) ($y+8) ($boxW-12) 24 7.2 $true $script:green 2 | Out-Null
    Add-Text $Slide (([string]$areas[$i].candidateCount)+"개 후보") ($x+6) ($y+34) ($boxW-12) 12 6.5 $false $script:muted 2 | Out-Null
  }
  Add-Text $Slide "서로 다른 500m 반경은 중첩될 수 있어 총합으로 표시하지 않습니다." 52 405 416 14 6.5 $false $script:muted | Out-Null
  Add-Text $Slide "수요 지표" 500 158 302 20 12 $true $script:dark | Out-Null
  Add-Line $Slide 500 182 802 182 $script:dark 0.8 | Out-Null
  Add-DecisionMetric $Slide "주거인구" ([string]$d.residentialPopulationRange.display) 500 190 302 20 9.5
  Add-DecisionMetric $Slide "세대수" ([string]$d.householdRange.display) 500 228 302 20 9.5
  Add-DecisionMetric $Slide (([string]$d.competitorMetricLabel) + " 수") ([string]$d.meatShopRange.display) 500 266 302 20 9.5
  Add-DecisionMetric $Slide "유동 최다 시간대" ([string]$d.peakTimeDistribution) 500 304 302 22 8.5
  Add-DecisionMetric $Slide "주요 성·연령" ([string]$d.peakGenderAgeDistribution) 500 344 302 22 8.2
  Add-DecisionMetric $Slide "일반주거 특징" ([string]$d.generalResidentialSummary) 500 384 302 22 8.2
  Add-Box $Slide 40 445 762 88 $script:soft $script:soft | Out-Null
  Add-Text $Slide "FRAMEONE 해석" 54 456 180 16 9 $true $script:green | Out-Null
  Add-Text $Slide (@($d.interpretation) -join "`n") 54 478 730 42 8.2 $false $script:dark | Out-Null
  Add-Text $Slide ("Apartment Area " + [string]$d.apartmentAreaCount + "개 · Candidate " + [string]$d.candidateCount + "곳 · Snapshot " + [string]$d.snapshotCount + "건") 515 424 287 14 7 $true $script:green 3 | Out-Null
}

function Area-MapRects([int]$Count) {
  if ($Count -le 1) { return ,@(@(40,158,440,272)) }
  if ($Count -eq 2) { return ,@(@(40,158,214,272),@(266,158,214,272)) }
  if ($Count -eq 3) { return ,@(@(40,158,214,130),@(266,158,214,130),@(153,300,214,130)) }
  return ,@(@(40,158,214,130),@(266,158,214,130),@(40,300,214,130),@(266,300,214,130))
}

function Add-ApartmentArea {
  param($Slide, $Page)
  $a = $Page.area; $maps=@($a.mapThumbnails); $rects=Area-MapRects ([Math]::Min($maps.Count,4))
  Add-Text $Slide "APARTMENT AREA ANALYSIS" 40 70 330 16 8 $true $script:green | Out-Null
  Add-Text $Slide ([string]$a.label) 40 91 500 36 24 $true $script:dark | Out-Null
  Add-Text $Slide ((@($a.candidateIds) -join " · ") + " · 후보 " + [string]$a.candidateCount + "곳") 40 127 500 18 9 $false $script:muted | Out-Null
  for($i=0; $i -lt [Math]::Min($maps.Count,4); $i++) {
    $r=$rects[$i]; Add-Box $Slide $r[0] $r[1] $r[2] $r[3] $script:soft $script:line | Out-Null
    if($maps[$i].mapPath -and (Test-Path -LiteralPath ([string]$maps[$i].mapPath))){Add-ContainedPicture $Slide ([string]$maps[$i].mapPath) $r[0] $r[1] $r[2] $r[3] $false | Out-Null}
    else{Add-Text $Slide "위치 지도 확인 필요" ($r[0]+10) ($r[1]+($r[3]/2)-8) ($r[2]-20) 16 8 $true $script:muted 2 | Out-Null}
    Add-Box $Slide ($r[0]+5) ($r[1]+5) 56 18 $script:dark $script:dark | Out-Null
    Add-Text $Slide ([string]$maps[$i].candidateId) ($r[0]+9) ($r[1]+7) 48 12 6.5 $true $script:white 2 | Out-Null
  }
  Add-Text $Slide "생활권 공통정보" 500 158 302 20 12 $true $script:dark | Out-Null
  Add-Line $Slide 500 182 802 182 $script:dark 0.8 | Out-Null
  Add-DecisionMetric $Slide "직접 배후 아파트" (@($a.directApartments) -join " · ") 500 190 302 34 8.3
  Add-DecisionMetric $Slide "기존 조사 기재 세대수" ([string]$a.existingHouseholdDisplay) 500 242 302 20 9.2
  Add-DecisionMetric $Slide "일반주거 배후" ([string]$a.generalResidentialDisplay) 500 280 302 22 8.2
  Add-DecisionMetric $Slide "오피스텔 배후" ([string]$a.officetelDisplay) 500 320 302 20 8.5
  Add-DecisionMetric $Slide ("SBIZ365 500m " + [string]$a.competitorMetricLabel) ([string]$a.competitionDisplay) 500 358 302 20 8.8
  Add-Text $Slide "Candidate별 출입구·생활동선" 500 400 302 14 7 $true $script:muted | Out-Null
  $relations=@($a.candidateRelations)
  Add-Text $Slide (($relations | ForEach-Object {([string]$_.candidateId)+"  "+([string]$_.entrance)+" · "+(@($_.flow)-join " · ")}) -join "`n") 500 417 302 62 7.2 $false $script:dark | Out-Null
  Add-Box $Slide 40 455 762 78 $script:soft $script:soft | Out-Null
  Add-Text $Slide "FRAMEONE 검토의견" 54 466 180 16 9 $true $script:green | Out-Null
  Add-Text $Slide (@($a.frameoneOpinion) -join "`n") 54 487 730 34 8 $false $script:dark | Out-Null
  Add-Text $Slide ([string]$a.householdSource) 40 436 440 12 6.3 $false $script:muted | Out-Null
}

function Add-CompareCard {
  param($Slide, $Candidate, [double]$Left, [double]$Top, [double]$Width, [double]$Height)
  Add-Box $Slide $Left $Top $Width $Height $script:white $script:line 8 | Out-Null
  Add-Text $Slide ([string]$Candidate.displayCode) ($Left+10) ($Top+9) ($Width-82) 20 12 $true $script:green | Out-Null
  Add-Box $Slide ($Left+$Width-64) ($Top+7) 54 26 $script:white $script:green 7 | Out-Null
  Add-Text $Slide ("Grade " + [string]$Candidate.siteGrade) ($Left+$Width-60) ($Top+12) 46 14 7.3 $true $script:green 2 | Out-Null
  Add-Text $Slide ([string]$Candidate.address) ($Left+10) ($Top+35) ($Width-20) 28 6.7 $false $script:muted | Out-Null
  $photoTop=$Top+67; $photoHeight=104
  Add-Box $Slide ($Left+10) $photoTop ($Width-20) $photoHeight $script:soft $script:soft | Out-Null
  if($Candidate.representativePhotoPath -and (Test-Path -LiteralPath ([string]$Candidate.representativePhotoPath))){Add-ContainedPicture $Slide ([string]$Candidate.representativePhotoPath) ($Left+10) $photoTop ($Width-20) $photoHeight $false | Out-Null}
  else{Add-Text $Slide "대표사진 미확보" ($Left+15) ($photoTop+43) ($Width-30) 18 8.5 $true $script:muted 2 | Out-Null}
  $y=$photoTop+$photoHeight+5
  foreach($row in @(@("면적",$Candidate.area),@("보증금",$Candidate.deposit),@("월세",$Candidate.rent),@("관리비",$Candidate.maintenance),@("권리금",$Candidate.premium))){Add-Text $Slide ([string]$row[0]) ($Left+10) $y 46 12 6.5 $false $script:muted | Out-Null; Add-Text $Slide ([string]$row[1]) ($Left+56) $y ($Width-66) 12 6.8 $true $script:dark 3 | Out-Null; $y+=14}
  Add-Line $Slide ($Left+10) ($y+1) ($Left+$Width-10) ($y+1) $script:line 0.5 | Out-Null; $y+=7
  $detailRows=@(@("아파트 접근",$Candidate.apartmentAccess),@("생활동선",$Candidate.mainFlow),@("경쟁환경",$Candidate.competitionEnvironment),@("가시성",$Candidate.visibility),@("단기정차",$Candidate.shortStop))
  if(@($Candidate.strengths).Count -gt 0){$detailRows += ,@("장점",(@($Candidate.strengths)-join " · "))}
  if(@($Candidate.checks).Count -gt 0){$detailRows += ,@("확인사항",(@($Candidate.checks)-join " · "))}
  foreach($row in $detailRows){Add-Text $Slide ([string]$row[0]) ($Left+10) $y 54 11 5.9 $true $(if($row[0] -eq "확인사항"){$script:amber}else{$script:muted}) | Out-Null; Add-Text $Slide (Display-Value $row[1]) ($Left+64) $y ($Width-74) 11 5.9 $false $script:dark | Out-Null; $y+=12}
  Add-Line $Slide ($Left+10) ($Top+$Height-31) ($Left+$Width-10) ($Top+$Height-31) $script:line 0.5 | Out-Null
  $lifeColor=if($Candidate.lifecycleCode -eq "DROP"){$script:red}elseif($Candidate.lifecycleCode -eq "SHORTLIST"){$script:amber}else{$script:green}
  Add-Text $Slide ([string]$Candidate.lifecycle) ($Left+10) ($Top+$Height-24) ($Width-20) 16 8 $true $lifeColor | Out-Null
}

function Add-CandidateCompare {
  param($Slide, $Page)
  $rows=@($Page.candidates); $suffix=if([int]$Page.pageCount -gt 1){" ("+[string]$Page.pageNumber+"/"+[string]$Page.pageCount+")"}else{""}
  Add-Text $Slide "CANDIDATE COMPARE" 40 70 330 16 8 $true $script:green | Out-Null
  Add-Text $Slide ([string]$Page.apartmentAreaLabel + $suffix) 40 91 560 36 24 $true $script:dark | Out-Null
  Add-Text $Slide "같은 Apartment Area 후보의 선택 판단 요약" 40 127 500 18 9 $false $script:muted | Out-Null
  $gap=12; $count=$rows.Count
  if($count -eq 1){$cardW=520;$startX=161}else{$cardW=(762-(($count-1)*$gap))/$count;$startX=40}
  for($i=0;$i -lt $count;$i++){Add-CompareCard $Slide $rows[$i] ($startX+($i*($cardW+$gap))) 155 $cardW 374}
  Add-Text $Slide "Site Grade는 입지 조건 적합도 분류이며 출점 성공확률·계약추천·매출 가능성을 의미하지 않습니다." 40 534 762 12 6.5 $false $script:muted 3 | Out-Null
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
  } elseif ($c.mapImagePath -and (Test-Path -LiteralPath ([string]$c.mapImagePath))) { Add-ContainedPicture $Slide ([string]$c.mapImagePath) 40 154 310 380 $true | Out-Null }
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
    $region = if($page.kind -eq "REGION_OVERVIEW"){[string]$page.region.label}elseif($page.kind -eq "REGION_DEMAND_SUMMARY"){[string]$page.demand.regionLabel}elseif($page.kind -eq "APARTMENT_AREA_ANALYSIS"){[string]$page.area.regionLabel}elseif($page.kind -eq "CANDIDATE_COMPARE"){[string]$page.regionLabel}else{[string]$page.candidate.regionLabel}
    Add-HeaderFooter $slide $region ($pageIndex+1) $pageCount
    if($page.kind -eq "REGION_OVERVIEW"){Add-RegionOverview $slide $page}
    elseif($page.kind -eq "REGION_DEMAND_SUMMARY"){Add-RegionDemand $slide $page}
    elseif($page.kind -eq "APARTMENT_AREA_ANALYSIS"){Add-ApartmentArea $slide $page}
    elseif($page.kind -eq "CANDIDATE_COMPARE"){Add-CandidateCompare $slide $page}
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
