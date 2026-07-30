# shellcheck shell=bash
# shellcheck disable=SC1003

# Windows Terminal shell integration for Git Bash.
# Add this after any prompt customization in ~/.bashrc.
if [[ -n "${WT_SESSION:-}" ]]; then
    if [[ -z "${__WT_SHELL_INTEGRATION_LOADED:-}" ]]; then
        __WT_SHELL_INTEGRATION_LOADED=1
        __WT_PS1_BASE="${PS1}"
    fi

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

        # Forward slashes prevent Bash from treating path fragments as PS1 escapes.
        windows_cwd="$(cygpath -m "$PWD")"
        local cwd_sequence="${__WT_CWD_PREFIX}${windows_cwd}${__WT_CWD_SUFFIX}"

        PS1="\[${__WT_COMMAND_FINISHED_PREFIX}${exit_status}${__WT_STRING_TERMINATOR}\]"
        PS1+="\[${__WT_PROMPT_START}\]"
        PS1+="\[${cwd_sequence}\]"
        PS1+="${__WT_PS1_BASE}"
        PS1+="\[${__WT_COMMAND_START}\]"
    }

    if ((BASH_VERSINFO[0] > 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4))); then
        PS0="\[${__WT_COMMAND_EXECUTED}\]"
    fi

    PS2=''

    case ";${PROMPT_COMMAND:-};" in
        *";__wt_prompt_command;"*) ;;
        *) PROMPT_COMMAND="__wt_prompt_command${PROMPT_COMMAND:+;${PROMPT_COMMAND}}" ;;
    esac
fi
