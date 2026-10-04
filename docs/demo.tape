# Recording for the README demo. Requires https://github.com/charmbracelet/vhs.
#
# Prerequisites:
#   - `termwire`, `tmux`, `nvim` and `opencode` on PATH
#   - a sibling worktree at ../termwire-demo whose `.termwire.jsonc` puts the
#     editor and the agent in one window, so the jump is visible:
#
#       { "version": 1, "windows": [ { "name": "work", "panes": [
#           { "id": "editor", "role": "editor" },
#           { "id": "agent", "splitFrom": "editor", "direction": "horizontal",
#             "sizePercent": 42, "command": ["opencode"] } ] } ] }
#
#   - that worktree's `opencode.json` disables any MCP server needing auth,
#     or its toast covers the agent pane for the first ten seconds.
#
# Render:  vhs docs/demo.tape
# Then cut the dead time and shrink to 1200px. The first cut drops the editor
# starting up, because a plugin notice there can open a picker over the config:
#
#   ffmpeg -i docs/demo-raw.gif -filter_complex "\
#     [0:v]trim=0:2.4,setpts=PTS-STARTPTS[a];\
#     [0:v]trim=9.6:14.8,setpts=PTS-STARTPTS[b];\
#     [0:v]trim=14.8:28.8,setpts=(PTS-STARTPTS)/2.8[c];\
#     [0:v]trim=28.8:36.0,setpts=PTS-STARTPTS[d];\
#     [a][b][c][d]concat=n=4:v=1:a=0[v];\
#     [v]fps=18,scale=1200:-1:flags=lanczos,split[s0][s1];\
#     [s0]palettegen=max_colors=192:stats_mode=diff[p];\
#     [s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" docs/demo.gif
#
# The boundaries follow this take; re-check them after re-recording.

Output "docs/demo-raw.gif"

Set Shell "zsh"
Set FontFamily "JetBrainsMono Nerd Font"
Set FontSize 16
Set Width 1400
Set Height 780
Set Padding 10
Set Framerate 24

Hide
# vhs inherits the environment, and inside tmux the CLI switches the client
# instead of attaching, so the recording would stay empty.
Type "unset TMUX TMUX_PANE"
Enter
Type "clear"
Enter
Sleep 2s
Show

Sleep 800ms
Type@45ms "termwire up demo -w"
Sleep 600ms
Enter
Wait+Screen@45s /Ask anything/
Sleep 2s

Hide
# Dismiss whatever the editor opened on startup.
Escape
Sleep 300ms
Escape
Sleep 300ms
Show
Sleep 1s

# Focus the agent pane: the editor pane is the one `up` leaves active.
Ctrl+b
Type "o"
Sleep 1200ms

Type@45ms "which function sanitizes the session name? show me"
Sleep 600ms
Enter
# The agent's answer wraps unpredictably, so wait on the clock, not on text.
Sleep 40s
