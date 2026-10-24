# fish completion for ot, the OpenTodo command-line client.
# Printed by `ot completion fish`. Install it once:
#   ot completion fish > ~/.config/fish/completions/ot.fish
# The candidates come from `ot __complete`: commands and flags from the ot on
# your PATH, names from your profile's server (2 seconds at most, nothing when
# it cannot be reached).

function __ot_complete
    set -l words (commandline -opc)
    set -e words[1]
    set -l cur (commandline -ct)
    set cur (string replace -r -- '^[\'"]' '' "$cur")
    set -l out (command ot __complete -- $words "$cur" 2>/dev/null)
    or return
    set -l directive $out[1]
    set -e out[1]
    switch "$directive"
        case :file
            __fish_complete_path "$cur"
        case :dir
            __fish_complete_directories "$cur"
        case '*'
            printf '%s\n' $out
    end
end

complete -c ot -f -a '(__ot_complete)'
