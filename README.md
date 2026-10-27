# claude-forecast

A Claude Code mod that draws one line above the prompt. It tells you **when** you will run out, not just how much you used.

```
ctx ━━━── 62% ~5 turns │ 5h ━━━━─ 71% out in 38m →14:30 │ wk ━──── 18% │ cache hit 94% │ turn 48.2k · $0.31        ⎇ my-repo:feature-x
```

## What it shows

| Part | Meaning |
|---|---|
| `ctx ━━━── 62% ~5 turns` | Context used. From 50 %, about how many more turns fit at the pace of your last turns. |
| `5h ━━━━─ 71% out in 38m` | 5-hour limit used. Red `out in 38m` when, at the pace of the last 30 minutes, it runs out before it resets. |
| `→14:30` | When a limit resets, as a clock time (weekday added when it is not today). Shown from 70 % or when the forecast warns. |
| `wk ━──── 18%` | Weekly limit used. |
| `cache hit 94%` | Share of the last turn's input read from the prompt cache, which costs about a tenth of fresh input. Yellow under 80 %. Adds `· 3m left` when the cache is about to expire and `· cold` once it has: the next turn then pays to write the whole context again. |
| `turn 48.2k · $0.31` | New tokens (input, output and cache writes; cache reads left out) and dollars of the last turn. Yellow with `▲` when it cost more than twice the average of recent turns. |
| `⎇ my-repo:feature-x` | Repository and branch of the last file Claude edited, right-aligned, so it follows you across repos in a multi-repo workspace. |

Color only marks what needs attention: values stay neutral below 70 %, turn yellow from 70 % and red from 90 %. Details appear only when they matter.

## Alerts

- **Cache:** a toast one minute before the prompt cache expires while Claude waits for you.
- **5-hour limit:** a toast when the forecast says the limit runs out before it resets. Once per window.

## Narrow terminals

The line never wraps. It measures each part against the terminal width: first parts drop their bars and details, then whole parts hide in this order: repository, turn, weekly, cache, 5-hour. Context always stays.

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
- `~N turns` measures against the full window. Auto-compact may trigger earlier.
- Rate limits only appear on a subscription.
- Dollar figures are the session estimate (as `/cost`), not what a subscription bills.

## Development

```
claude plugin validate .
claude plugin test .
```

## License

MIT
