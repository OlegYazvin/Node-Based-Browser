#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/generate-release-notes.sh [options]

Options:
  --output <path>   Output markdown file (default: Installer/RELEASE_NOTES.MD)
  --repo <owner/name>
                    GitHub repository for compare/run links
  --base <sha>      Base commit SHA for the push range
  --head <sha>      Head commit SHA for the push range (default: HEAD)
  --ref <name>      Branch or ref name for display
  --run-url <url>   Optional GitHub Actions run URL
  --help            Show this help text
EOF
}

output_path="Installer/RELEASE_NOTES.MD"
repo_full_name=""
base_sha=""
head_ref="HEAD"
ref_name=""
run_url=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      output_path="$2"
      shift 2
      ;;
    --repo)
      repo_full_name="$2"
      shift 2
      ;;
    --base)
      base_sha="$2"
      shift 2
      ;;
    --head)
      head_ref="$2"
      shift 2
      ;;
    --ref)
      ref_name="$2"
      shift 2
      ;;
    --run-url)
      run_url="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

head_sha="$(git rev-parse "${head_ref}^{commit}")"
base_is_valid=0

if [[ -n "$base_sha" && ! "$base_sha" =~ ^0+$ ]] && git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
  base_is_valid=1
fi

if [[ "$base_is_valid" -eq 1 ]]; then
  range_spec="${base_sha}..${head_sha}"
else
  if git rev-parse "${head_sha}^" >/dev/null 2>&1; then
    base_sha="$(git rev-parse "${head_sha}^")"
    range_spec="${base_sha}..${head_sha}"
  else
    base_sha=""
    range_spec="${head_sha}"
  fi
fi

mapfile -t commit_lines < <(git log --reverse --format='%h%x09%s%x09%an' "${range_spec}")

if [[ "${#commit_lines[@]}" -eq 0 ]]; then
  commit_lines=("$(git log -1 --format='%h%x09%s%x09%an' "${head_sha}")")
fi

if [[ -n "$base_sha" ]]; then
  mapfile -t changed_files < <(git diff --name-only "${base_sha}" "${head_sha}")
else
  mapfile -t changed_files < <(git show --pretty='' --name-only "${head_sha}")
fi

if [[ "${#changed_files[@]}" -eq 0 ]]; then
  changed_files=("(no file-level diff detected)")
fi

declare -A area_counts=()
declare -a area_order=()

categorize_path() {
  local path="$1"
  case "$path" in
    .github/workflows/*)
      echo "GitHub Actions"
      ;;
    Installer/*)
      echo "Installer directory"
      ;;
    gecko/release-artifacts/*)
      echo "Gecko release artifacts"
      ;;
    gecko/*)
      echo "Gecko overlay/runtime"
      ;;
    scripts/*)
      echo "Build and packaging scripts"
      ;;
    tests/*)
      echo "Tests"
      ;;
    *)
      echo "Other repo files"
      ;;
  esac
}

for path in "${changed_files[@]}"; do
  area="$(categorize_path "$path")"

  if [[ -z "${area_counts[$area]+x}" ]]; then
    area_counts[$area]=0
    area_order+=("$area")
  fi

  area_counts[$area]=$((area_counts[$area] + 1))
done

generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
short_head="${head_sha:0:7}"
short_base=""
compare_url=""

if [[ -n "$base_sha" ]]; then
  short_base="${base_sha:0:7}"
fi

if [[ -n "$repo_full_name" && -n "$base_sha" ]]; then
  compare_url="https://github.com/${repo_full_name}/compare/${base_sha}...${head_sha}"
fi

mkdir -p "$(dirname "$output_path")"

{
  echo "# Latest Release Notes"
  echo
  echo "Generated automatically at ${generated_at}."
  echo
  if [[ -n "$ref_name" ]]; then
    echo "- Ref: \`${ref_name}\`"
  fi
  if [[ -n "$short_base" ]]; then
    echo "- Range: \`${short_base} -> ${short_head}\`"
  else
    echo "- Commit: \`${short_head}\`"
  fi
  if [[ -n "$run_url" ]]; then
    echo "- Workflow run: ${run_url}"
  fi
  if [[ -n "$compare_url" ]]; then
    echo "- Compare: ${compare_url}"
  fi
  echo
  echo "## Highlights"
  echo
  echo "- Commits included: ${#commit_lines[@]}"
  echo "- Files changed: ${#changed_files[@]}"
  for area in "${area_order[@]}"; do
    echo "- ${area}: ${area_counts[$area]}"
  done
  echo
  echo "## Commits"
  echo
  for line in "${commit_lines[@]}"; do
    IFS=$'\t' read -r commit subject author <<<"$line"
    echo "- \`${commit}\` ${subject} (${author})"
  done
  echo
  echo "## Changed Files"
  echo
  for path in "${changed_files[@]}"; do
    echo "- \`${path}\`"
  done
} >"$output_path"
