# shellcheck shell=bash

export MSYS_NO_PATHCONV=1 # Prevent MSYS from converting Unix-style paths to Windows paths in commands

shopt -s histappend
export PROMPT_COMMAND="history -a; history -n"
export PYTHONUTF8=1

# Keep dependency caches, generated output, and VCS internals out of zoxide.
# The Windows zoxide binary expects semicolon-separated Windows-style globs.
_zoxide_home="${USERPROFILE:-$(cygpath -w "$HOME")}"
_zoxide_excluded_components=(
    .git node_modules target __pycache__ .venv venv site-packages
    .pytest_cache .ruff_cache .mypy_cache .tox
    .next .nuxt .turbo .parcel-cache coverage build obj
    .cargo .rustup .m2 .gradle .npm .pnpm-store .yarn .bun
)
_zoxide_exclude_globs=("$_zoxide_home")
for _zoxide_component in "${_zoxide_excluded_components[@]}"; do
    _zoxide_exclude_globs+=("*\\${_zoxide_component}" "*\\${_zoxide_component}\\*")
done
printf -v _ZO_EXCLUDE_DIRS '%s;' "${_zoxide_exclude_globs[@]}"
export _ZO_EXCLUDE_DIRS="${_ZO_EXCLUDE_DIRS%;}"
unset _zoxide_home _zoxide_component _zoxide_excluded_components _zoxide_exclude_globs

WINGET_PKGS="$(cygpath -u "$LOCALAPPDATA")/Microsoft/WinGet/Packages"
export PATH="$HOME/.local/bin:${WINGET_PKGS}/ajeetdsouza.zoxide_Microsoft.Winget.Source_8wekyb3d8bbwe:${WINGET_PKGS}/Fastfetch-cli.Fastfetch_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"
