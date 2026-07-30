# Navigation and file management.
alias ~='cd ~'
alias .1='cd ..'
alias .2='cd ../..'
alias .3='cd ../../..'
alias .4='cd ../../../..'
alias .5='cd ../../../../..'
alias rm='rm -rf'
alias cp='cp -r'
alias ll='ls -alh'
alias cls='clear'
alias vimbash='vim ~/bash_scripts; source ~/.bashrc'
alias notebash='notepad ~/.bashrc && source ~/.bashrc'

mkcd() {
    if [[ $# -ne 1 ]]; then
        echo 'Usage: mkcd <directory>' >&2
        return 2
    fi

    mkdir -p -- "$1" || return
    cd -- "$1" || return
}

# Applications and build tools.
alias mpvpip='mpv --ontop --no-border --snap-window'
alias clean='mvn clean install'
alias cleant='mvn clean install -DskipTests'
alias mvn='mvn.cmd'
alias npx='bunx'
alias c='code'
alias zd='zed'
alias agr='antigravity'
alias cd='z'

# AI agent CLIs.
cursor-agent() {
    "$HOME/.local/bin/cursor-agent.cmd" "$@"
}

agent() {
    cursor-agent "$@"
}

agent_up() {
    claude update
    cursor-agent update
    bun update -g --latest

    local opencode_package="$HOME/.bun/install/global/node_modules/opencode-ai"
    if ! opencode --version >/dev/null 2>&1 && [ -f "$opencode_package/postinstall.mjs" ]; then
        echo "Repairing OpenCode's native launcher after the Bun update..."
        (cd "$opencode_package" && node postinstall.mjs)
        hash -r
    fi

    opencode --version
    winget upgrade --id 9PLM9XGG6VKS --source msstore --include-unknown --accept-source-agreements
    yt-dlp --update
}

alias ca='cursor-agent'
alias cc='claude --allow-dangerously-skip-permissions'
alias ccr='cc --resume'
alias cxl='codex -m gpt-5.6-sol -c model_reasoning_effort="low"'
alias cxm='codex -m gpt-5.6-sol -c model_reasoning_effort="medium"'
alias cx='codex -m gpt-5.6-sol -c model_reasoning_effort="high"'
alias cxr='cx resume'
alias cxe='codex exec -m gpt-5.4-mini --skip-git-repo-check -c model_reasoning_effort="medium"'
alias oc='opencode --dangerously-skip-permissions'
alias pir='pi --resume'

# Language and package updates.
alias lang_up='bun upgrade; rustup update stable && winget.exe source update && winget.exe upgrade --id GoLang.Go --accept-source-agreements --accept-package-agreements && winget.exe upgrade --id Python.Python.3.14 --accept-source-agreements --accept-package-agreements && winget.exe upgrade --id Python.Launcher --accept-source-agreements --accept-package-agreements && rustc --version && go version && python --version && py --version'

# Terraform.
alias tf='terraform'
alias tfaa='terraform apply --auto-approve'
