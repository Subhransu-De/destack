# shellcheck shell=bash
# shellcheck disable=SC1090

# Load the standard profile files created by Git for Windows.
test -f ~/.profile && . ~/.profile
test -f ~/.bashrc && . ~/.bashrc

# Show a system summary in interactive sessions when Fastfetch is available.
if [[ $- == *i* ]] && command -v fastfetch >/dev/null 2>&1; then
    fastfetch
fi
