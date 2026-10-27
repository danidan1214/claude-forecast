# claude-forecast

A Claude Code mod that draws one line above the prompt. It tells you **when** you will run out, not just how much you used.

```
ctx 62% ~5t  5h 71% out ~38m ↻1h20m  wk 18% ↻3d4h  cache 94% ⏳52m  last +48.2k $0.31  ⎇ my-repo:feature-x
```

## What it shows

| Part | Meaning |
|---|---|
| `ctx 62% ~5t` | Context used, and about how many more turns fit at the pace of your last turns. |
| `5h 71% out ~38m` | 5-hour limit used. Red `out ~38m` when, at the pace of the last 30 minutes, it runs out before it resets. Green `✓` when the reset comes first. |
| `↻1h20m` | Time until that window resets. |
| `wk 18%` | Weekly limit used. |
| `cache 94% ⏳52m` | Share of the last turn's input served from the prompt cache, and time left before the cache expires. After it expires (`cold`), the next turn pays to write the whole context again. |
| `last +48.2k $0.31` | Tokens and dollars of the last turn. Yellow when it cost more than twice the average of recent turns. |
| `⎇ my-repo:feature-x` | Repository and branch of the last file Claude edited, so it follows you across repos in a multi-repo workspace. |

## Alerts

- **Cache:** a toast one minute before the prompt cache expires while Claude waits for you.
- **5-hour limit:** a toast when the forecast says the limit runs out before it resets. Once per window.

## Narrow terminals

| Width | Hidden |
|---|---|
| 110 columns or more | nothing |
| 90–109 | weekly limit and reset times |
| under 90 | also the repository |

## Install

In a Claude Code session:

```
/plugin install forecast-meter --marketplace danidan1214/claude-forecast
```

Answer `y` to add the marketplace, then pick a scope.

### From a local folder

```
git clone https://github.com/danidan1214/claude-forecast.git ~/.claude/mods/claude-forecast
claude --plugin-dir ~/.claude/mods/claude-forecast
```

To load it in every session, add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`.

## Configuration

One option, shown as a row in `/config`:

| Option | Values | Default | What it does |
|---|---|---|---|
| `cacheTtl` | `5m`, `1h` | `1h` | Prompt cache lifetime the countdown uses. Set it to match your account. |

## Limits

- Claude Code does not report the cache TTL, so the countdown uses `cacheTtl`.
- Forecasts need a few minutes of data: the 5-hour forecast needs two readings at least 2 minutes apart, and the turn estimate needs two turns that grew the context.
- `~Nt` measures against the full window. Auto-compact may trigger earlier.
- Rate limits only appear on a subscription.
- Dollar figures are the session estimate (as `/cost`), not what a subscription bills.

## Development

```
claude plugin validate .
claude plugin test .
```

## License

MIT
