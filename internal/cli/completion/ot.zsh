#compdef ot
# zsh completion for ot, the OpenTodo command-line client.
# Printed by `ot completion zsh`. Install it once into a directory on $fpath:
#   mkdir -p ~/.zfunc
#   ot completion zsh > ~/.zfunc/_ot
# and in ~/.zshrc, before `compinit`:
#   fpath=(~/.zfunc $fpath)
# or, after `compinit`:
#   source <(ot completion zsh)
# The candidates come from `ot __complete`: commands and flags from the ot on
# your PATH, names from your profile's server (2 seconds at most, nothing when
# it cannot be reached).

_ot() {
    local -a lines items
    local directive line value desc
    lines=("${(@f)$(command ot __complete -- "${(@Q)words[2,CURRENT-1]}" "${(Q)PREFIX}" 2>/dev/null)}")
    directive=${lines[1]}
    case $directive in
        :file) _files; return ;;
        :dir) _files -/; return ;;
    esac
    for line in "${(@)lines[2,-1]}"; do
        [[ -z $line ]] && continue
        value=${line%%$'\t'*}
        desc=${line#*$'\t'}
        value=${value//:/\\:}
        if [[ -n $desc ]]; then
            items+=("$value:$desc")
        else
            items+=("$value")
        fi
    done
    (( ${#items} )) || return 1
    _describe -t values 'ot' items
}

if [[ "${funcstack[1]}" == "_ot" ]]; then
    _ot "$@"
else
    compdef _ot ot
fi
