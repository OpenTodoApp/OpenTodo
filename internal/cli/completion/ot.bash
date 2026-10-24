# bash completion for ot, the OpenTodo command-line client.
# Printed by `ot completion bash`. Install it once:
#   mkdir -p ~/.local/share/bash-completion/completions
#   ot completion bash > ~/.local/share/bash-completion/completions/ot
# or add this line to ~/.bashrc:
#   source <(ot completion bash)
# The candidates come from `ot __complete`: commands and flags from the ot on
# your PATH, names from your profile's server (2 seconds at most, nothing when
# it cannot be reached).

_ot_complete() {
    local cur="${COMP_WORDS[COMP_CWORD]}"
    # An opening quote typed before Tab is not part of the value.
    case "$cur" in
        \"*|\'*) cur="${cur:1}" ;;
    esac
    local out
    out=$(command ot __complete -- "${COMP_WORDS[@]:1:COMP_CWORD-1}" "$cur" 2>/dev/null) || return 0
    COMPREPLY=()
    local directive line
    {
        IFS= read -r directive
        while IFS= read -r line; do
            line="${line%%$'\t'*}"
            [ -n "$line" ] && COMPREPLY+=("$(printf '%q' "$line")")
        done
    } <<< "$out"
    case "$directive" in
        :file)
            compopt -o filenames 2>/dev/null
            mapfile -t COMPREPLY < <(compgen -f -- "$cur")
            ;;
        :dir)
            compopt -o filenames 2>/dev/null
            mapfile -t COMPREPLY < <(compgen -d -- "$cur")
            ;;
    esac
    return 0
}

complete -F _ot_complete ot
