# shellcheck shell=bash

# Load Angular CLI autocompletion.
# source <(ng completion script)

#Alias
alias ~='cd ~'
alias .1='cd ..'
alias .2='cd ../..'
alias .3='cd ../../..'
alias .4='cd ../../../..'
alias .5='cd ../../../../..'
alias rm='rm -ri'
alias cp='cp -r'
alias ll='ls -alh'
alias cls='clear'
alias vimbash='vim ~/bash_scripts; source ~/.bashrc'
alias notebash='notepad ~/.bashrc && source ~/.bashrc'
alias rm='rm -rf'

mkcd() {
    if [[ $# -ne 1 ]]; then
        echo 'Usage: mkcd <directory>' >&2
        return 2
    fi

    mkdir -p -- "$1" || return
    cd -- "$1" || return
}

alias mpv='mpv.exe'
alias mpvpip='mpv.exe --ontop --no-border --snap-window'

alias clean='mvn clean install'
alias cleant='mvn clean install -DskipTests'
alias mvn='mvn.cmd'
alias npx='bunx'

alias omnigit='git config --local user.name "YOUR_GIT_NAME"; git config --local user.email "YOUR_GIT_EMAIL"'

alias c='code'
alias zd='zed'
alias agr='antigravity'

alias cd=z

## Upgrade AI agent CLIs

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

## Lang update
alias lang_up='bun upgrade; rustup update stable && winget.exe source update && winget.exe upgrade --id GoLang.Go --accept-source-agreements --accept-package-agreements && winget.exe upgrade --id Python.Python.3.14 --accept-source-agreements --accept-package-agreements && winget.exe upgrade --id Python.Launcher --accept-source-agreements --accept-package-agreements && rustc --version && go version && python --version && py --version'


## Terraform

alias tf='terraform'
alias tfaa='terraform apply --auto-approve'

## Agents ##

alias ca='cursor-agent'
alias cc='claude'
alias ccr='cc --resume'

_codex_bun() {
    local codex_js
    codex_js="$(cygpath -w "$HOME/.bun/install/global/node_modules/@openai/codex/bin/codex.js")"
    bun run --bun --no-install "$codex_js" "$@"
}

alias cxl='_codex_bun -m gpt-5.6-luna -c model_reasoning_effort="xhigh"'
# alias cxl='_codex_bun -m gpt-5.6-sol -c model_reasoning_effort="low"'
alias cxm='_codex_bun -m gpt-5.6-sol -c model_reasoning_effort="medium"'
alias cx='_codex_bun -m gpt-5.6-sol -c model_reasoning_effort="high"'
alias cxr='_codex_bun resume'
alias cxe='_codex_bun exec -m gpt-5.4-mini --skip-git-repo-check -c model_reasoning_effort="medium"'
alias oc='opencode --dangerously-skip-permissions'
alias pir='pi --resume'
alias rj='rejoin'
