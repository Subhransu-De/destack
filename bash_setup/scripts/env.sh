# Prevent MSYS from rewriting Unix-style command arguments as Windows paths.
export MSYS_NO_PATHCONV=1

# Share history between active Bash sessions.
shopt -s histappend
export PROMPT_COMMAND="history -a; history -n"

export PYTHONUTF8=1
export PATH="$HOME/.local/bin:$PATH"

# Discover selected WinGet package directories without embedding a user path.
if command -v cygpath >/dev/null 2>&1 && [[ -n "${LOCALAPPDATA:-}" ]]; then
    winget_packages="$(cygpath -u "$LOCALAPPDATA")/Microsoft/WinGet/Packages"

    for package_dir in \
        "$winget_packages"/ajeetdsouza.zoxide_Microsoft.Winget.Source_* \
        "$winget_packages"/Fastfetch-cli.Fastfetch_Microsoft.Winget.Source_*; do
        if [[ -d "$package_dir" ]]; then
            export PATH="$package_dir:$PATH"
        fi
    done

    unset package_dir winget_packages
fi
