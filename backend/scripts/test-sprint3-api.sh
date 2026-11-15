#!/usr/bin/env bash
set -euo pipefail

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo "This script requires Git Bash and Windows PowerShell."
  exit 1
fi

exec powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '
$ErrorActionPreference = "Stop"
$base = "http://localhost:8000"
$campaignId = "65eed54f-8b89-4698-a8f5-4afd125c01c8"

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Url,
    [string]$Token,
    [object]$Body
  )

  $request = @{
    Uri = $Url
    Method = $Method
    ErrorAction = "Stop"
    TimeoutSec = 20
  }
  if ($Token) {
    $request.Headers = @{ Authorization = "Bearer $Token" }
  }
  if ($null -ne $Body) {
    $request.ContentType = "application/json"
    $request.Body = ConvertTo-Json -InputObject $Body -Depth 10 -Compress
  }
  return Invoke-RestMethod @request
}

$health = Invoke-Api -Method "GET" -Url "$base/health" -Token $null -Body $null
if ($health.status -ne "ok") {
  throw "Application health check failed."
}

$manager = Invoke-Api -Method "POST" -Url "$base/api/v1/auth/login" -Token $null -Body @{
  email = "demo.khoa1@example.invalid"
  password = "Demo@123456"
}
$managerToken = $manager.access_token
if (-not $managerToken) {
  throw "Could not log in as demo.khoa1@example.invalid."
}

$startAt = [DateTime]::UtcNow.AddMinutes(-2).ToString("o")
$endAt = [DateTime]::UtcNow.AddHours(2).ToString("o")
foreach ($phase in @("TOPIC_SUBMISSION", "TOPIC_APPROVAL")) {
  $null = Invoke-Api -Method "PUT" -Url "$base/api/v1/campaigns/$campaignId/timeline" -Token $managerToken -Body @{
    phase = $phase
    title = "$phase API smoke test"
    start_at = $startAt
    end_at = $endAt
    is_locked = $false
  }
}
Write-Host "Demo topic milestones opened for the next two hours."

$lecturer = Invoke-Api -Method "POST" -Url "$base/api/v1/auth/login" -Token $null -Body @{
  email = "demo.gv1@example.invalid"
  password = "Demo@123456"
}
$stamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
$topicTitle = "Sprint 3 API smoke test $stamp"
$topic = Invoke-Api -Method "POST" -Url "$base/api/v1/topic-workflow/campaigns/$campaignId/topics" -Token $lecturer.access_token -Body @{
  title_vi = $topicTitle
  description = "Automated local API workflow check."
  objectives = "Verify proposal, review, and student visibility."
  required_skills = @("JavaScript", "SQL")
  technologies = @("Node.js", "PostgreSQL")
  max_students = 2
}
if ($topic.status -ne "PENDING_APPROVAL") {
  throw "Topic was not created in PENDING_APPROVAL status."
}
Write-Host "Submitted topic $($topic.id): $($topic.title_vi)"

$pending = @(Invoke-Api -Method "GET" -Url "$base/api/v1/topic-workflow/campaigns/$campaignId/topics/pending" -Token $managerToken -Body $null)
if (-not ($pending | Where-Object { $_.id -eq $topic.id })) {
  throw "Submitted topic was not found in the manager review queue."
}
Write-Host "Topic is present in the manager review queue."

$null = Invoke-Api -Method "PATCH" -Url "$base/api/v1/topic-workflow/campaigns/$campaignId/topics/$($topic.id)/decision" -Token $managerToken -Body @{
  decision = "APPROVED"
}
Write-Host "Topic approved."

$student = Invoke-Api -Method "POST" -Url "$base/api/v1/auth/login" -Token $null -Body @{
  email = "demo.sv1@example.invalid"
  password = "Demo@123456"
}
$approved = @(Invoke-Api -Method "GET" -Url "$base/api/v1/topic-workflow/campaigns/$campaignId/topics" -Token $student.access_token -Body $null)
if (-not ($approved | Where-Object { $_.id -eq $topic.id })) {
  throw "Approved topic was not visible to the eligible demo student."
}
Write-Host "Eligible student can see the approved topic."
Write-Host "Sprint 3 API smoke test passed."
'
