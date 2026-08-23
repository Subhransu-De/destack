# shellcheck shell=bash
# shellcheck disable=SC1003,SC1090

if [ -d "$HOME/bash_scripts" ]; then
    for file in "$HOME/bash_scripts/"*.sh; do
        [ -r "$file" ] && . "$file"
    done
fi

# Windows Terminal shell integration. This must run after the existing prompt,
# history, and zoxide setup so it can compose with those hooks.
if [[ -n "${WT_SESSION:-}" ]]; then
    if [[ -z "${__WT_SHELL_INTEGRATION_LOADED:-}" ]]; then
        __WT_SHELL_INTEGRATION_LOADED=1
        __WT_PS1_BASE="${PS1}"
    fi

    # Refresh these definitions whenever .bashrc is sourced so an open shell
    # receives integration fixes without recapturing an already-wrapped PS1.
    __WT_COMMAND_FINISHED_PREFIX='\e]133;D;'
    __WT_PROMPT_START='\e]133;A\e\\'
    __WT_COMMAND_START='\e]133;B\e\\'
    __WT_COMMAND_EXECUTED='\e]133;C\e\\'
    __WT_CWD_PREFIX='\e]9;9;"'
    __WT_CWD_SUFFIX='"\e\\'
    __WT_STRING_TERMINATOR='\e\\'

    __wt_prompt_command() {
        local exit_status=$?
        local windows_cwd
        local drive
        # Use a mixed Windows path so Bash cannot reinterpret path components
        # such as "\s" as PS1 prompt escapes ("\s" expands to "bash").
        if [[ $PWD == "${__WT_LAST_PWD:-}" ]]; then
            windows_cwd="$__WT_WINDOWS_CWD"
        else
            case $PWD in
                /[[:alpha:]]|/[[:alpha:]]/*)
                    drive="${PWD:1:1}"
                    windows_cwd="${drive^^}:${PWD:2}"
                    [[ ${#PWD} -eq 2 ]] && windows_cwd+='/'
                    ;;
                *)
                    windows_cwd="$(builtin pwd -W 2>/dev/null || cygpath -m "$PWD")"
                    ;;
            esac
            __WT_LAST_PWD="$PWD"
            __WT_WINDOWS_CWD="$windows_cwd"
        fi
        local cwd_sequence="${__WT_CWD_PREFIX}${windows_cwd}${__WT_CWD_SUFFIX}"

        PS1="\[${__WT_COMMAND_FINISHED_PREFIX}${exit_status}${__WT_STRING_TERMINATOR}\]"
        PS1+="\[${__WT_PROMPT_START}\]"
        PS1+="\[${cwd_sequence}\]"
        PS1+="${__WT_PS1_BASE}"
        PS1+="\[${__WT_COMMAND_START}\]"
    }

    # Bash 4.4+ emits this immediately before executing the entered command.
    if ((BASH_VERSINFO[0] > 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4))); then
        PS0="\[${__WT_COMMAND_EXECUTED}\]"
    fi

    # Avoid corrupting multiline commands with a visible continuation prefix.
    PS2=''

    # env.sh resets PROMPT_COMMAND when .bashrc is re-sourced, so re-compose it.
    case ";${PROMPT_COMMAND:-};" in
        *";__wt_prompt_command;"*) ;;
        *) PROMPT_COMMAND="__wt_prompt_command${PROMPT_COMMAND:+;${PROMPT_COMMAND}}" ;;
    esac
fi
