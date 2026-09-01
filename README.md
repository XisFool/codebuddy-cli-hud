# codebuddy-cli-hud

`codebuddy-cli-hud` 是 CodeBuddy Code `statusLine` 的紧凑终端 HUD。CodeBuddy 大约每 300ms
通过 stdin 传入一份会话 JSON，本程序输出最多 4 行 ANSI 状态信息。

- 需要 Node.js >= 18。
- 不需要执行 `npm install`。
- 没有第三方 npm 依赖，只使用 Node.js 内置模块。
- 单次运行有 1500ms 预算；内部错误会静默降级，进程仍以 exit code `0` 结束。

GitHub 项目地址：[XisFool/codebuddy-cli-hud](https://github.com/XisFool/codebuddy-cli-hud)

## 功能与数据口径

默认 HUD 最多输出 4 行：环境与模型、Token/上下文/Cache、Diff/Credits/耗时，以及任务或最近工具活动。

| 项目 | 含义 |
| --- | --- |
| `Token` | 当前 `context_window.current_usage` 的 `input_tokens + output_tokens`。括号内分别显示 `in` 与 `out`，不是整个会话累计。 |
| 上下文进度 | 使用当前输入 Token、`context_window_size` 和 payload 的 `used_percentage`；不会把会话累计 Token 混入当前上下文。 |
| `cache` | 优先从 transcript 的 `providerData` 聚合当前对话轮次的缓存命中率；无法取得 telemetry 时才回退 payload，缺字段显示 `cache --`。 |
| `Δ +N -M` | 当前逻辑会话内的 `cost.total_lines_added` 与 `cost.total_lines_removed`。不支持 Unicode 时使用 `[D]`。 |
| `⏱` / `API` | 当前逻辑会话内的 `cost.total_duration_ms` 与 `cost.total_api_duration_ms`。 |
| `Credits` | **当前 `transcript_path` 所代表会话的累计实际消费**：汇总所有合法 `providerData.rawUsage.credit`。它不是模型倍率、不是单轮消费，也不是用户历史全局累计。 |

`credit: 0` 是有效的零消费，会被保留。缺失、负数、`NaN`、无限值、字符串和其他非数字值不会计入。

每个 transcript 都有独立状态文件，默认位于 `~/.codebuddy/codebuddy-hud-usage-state/`。后续刷新只读取新追加的 JSONL 内容；缓存损坏、文件截断、轮换或同大小覆盖都会自动重建。新会话会使用新的 transcript 状态，不会复用上一会话的累计值。

如果 payload 没有 `transcript_path`，程序无法定位 transcript，因此无法读取累计 Credits；此时只会回退到 payload 明示的 `cost.credits`。若 transcript 中存在有效 credit，累计值优先于 payload 的美元估值或 credit 字段。没有可用消费数据时不会显示伪造的 `0.00x credits`。

`/clear` 后，CodeBuddy 有时仍保留进程累计的 Diff 和耗时字段。HUD 会按 `transcript_path` 保存一个只含散列和数字基线的短期状态；当 `session_id` 变化、累计上下文回退，或当前上下文从较大值回到初始小值时，`Δ`、`⏱` 和 `API` 会从新的逻辑会话重新计数。Credits 仍严格按 transcript 累计；只有新的 `transcript_path` 才会开始一份新的 Credits 总额。

## 安装

先 clone 仓库并进入目录。项目没有依赖安装步骤：

```bash
git clone https://github.com/XisFool/codebuddy-cli-hud.git
cd codebuddy-cli-hud
node runtime/bin/codebuddy-hud.js --setup
```

`--setup` 会在 CodeBuddy 的 `settings.json` 写入 `statusLine`。若原本已有 `statusLine`，首次安装会将完整 settings 备份为 `settings.json.bak.codebuddy-hud`；重复执行 `--setup` 不会覆盖这份原始备份。

### Windows

在 PowerShell 或 `cmd.exe` 中执行：

```powershell
node runtime/bin/codebuddy-hud.js --setup
node runtime/bin/codebuddy-hud.js --status
node runtime/bin/codebuddy-hud.js --uninstall
```

Windows 上，`--setup` 会在 `runtime/bin/` 生成被 `.gitignore` 忽略的
`codebuddy-hud.cmd` shim，并把安装时的 `process.execPath` 写入 shim。这样 GUI 启动的
CodeBuddy 不依赖当前 shell 的 `PATH`，适用于 nvm、fnm、Volta 等 Node 管理器。切换 Node
版本或 Node 安装路径后，重新执行 `--setup` 即可刷新 shim。该 shim 是本机生成文件，不应提交。

生成的 command 使用引号；包含空格、中文或 Unicode 的目录可用。shim 自身也使用 CRLF，并通过
真实 `cmd.exe` 验证过在含 `&`、`^`、`(`、`)`、`%` 和 Unicode 的目录中运行。不要手工复制其他
开发者机器生成的 `.cmd` 文件。

默认设置文件为 `%USERPROFILE%\.codebuddy\settings.json`。

### Linux、macOS 与 WSL

```sh
node runtime/bin/codebuddy-hud.js --setup
node runtime/bin/codebuddy-hud.js --status
node runtime/bin/codebuddy-hud.js --uninstall
```

POSIX 平台的 settings command 直接使用安装时的 Node 绝对路径和
`runtime/bin/codebuddy-hud.js`，不需要 `.cmd` shim。路径中的空格、双引号、反斜杠、`$` 和反引号会在
双引号 shell 参数中转义。`chmod 755` 只是方便直接运行脚本的尽力操作，失败不会使安装失败。

默认设置文件为 `$HOME/.codebuddy/settings.json`。程序可从任意工作目录运行，使用的是安装时写入的
绝对路径。

## Settings 路径与环境变量

默认 CodeBuddy 根目录是 `~/.codebuddy`。可通过以下环境变量隔离安装、使用便携配置或定位调试问题：

| 变量 | 含义 |
| --- | --- |
| `CODEBUDDY_HOME` | 覆盖 CodeBuddy 根目录；settings、HUD 缓存、错误日志和 usage state 均位于其下。 |
| `CODEBUDDY_SETTINGS_PATH` | 直接覆盖 `settings.json` 路径，优先级高于 `CODEBUDDY_HOME`。 |

PowerShell 示例：

```powershell
$env:CODEBUDDY_HOME = 'D:\temp\codebuddy-home'
node runtime/bin/codebuddy-hud.js --setup
```

`cmd.exe` 示例：

```bat
set CODEBUDDY_SETTINGS_PATH=D:\temp\codebuddy-settings.json
node runtime\bin\codebuddy-hud.js --setup
```

Bash、zsh 或 WSL 示例：

```sh
export CODEBUDDY_HOME="/tmp/codebuddy-home"
node runtime/bin/codebuddy-hud.js --setup
```

使用临时目录测试安装、卸载或 CI 时，应同时隔离 `CODEBUDDY_HOME` 和
`CODEBUDDY_SETTINGS_PATH`，避免触碰真实用户配置。

## 命令

```bash
node runtime/bin/codebuddy-hud.js --setup
node runtime/bin/codebuddy-hud.js --status
node runtime/bin/codebuddy-hud.js --uninstall
```

- `--setup`：注册 HUD，并在 Windows 创建或刷新本机 shim。
- `--status`：使用示例 payload 预览 HUD。
- `--uninstall`：有备份时恢复首次安装前的 settings；没有备份时只移除属于
  `codebuddy-hud` 的 `statusLine`。同时清理 HUD 的本地缓存、transcript usage state 与会话统计基线。

所有命令异常都以 exit code `0` 静默降级；目录只读、权限不足、文件锁或状态文件写入失败不会让
statusLine 崩溃。

## 配置

默认配置是 `runtime/codebuddy-hud.config.json`。可在项目工作目录放置
`codebuddy-hud.config.json` 覆盖其中一部分，配置会深度合并：

```json
{
  "display": {
    "showToolActivity": true,
    "toolActivityTailBytes": 16384,
    "unicode": "auto"
  }
}
```

输出结构本身最多只有 4 行；即使 `display.maxLines` 配成很大，也不会生成额外 HUD 行。

Unicode 判定可用 `CODEBUDDY_HUD_FORCE_ASCII=1` 或
`CODEBUDDY_HUD_FORCE_UNICODE=1` 覆盖。Windows 会缓存 `chcp.com` 的探测结果；POSIX 会结合
`LC_ALL`、`LC_CTYPE`、`LANG` 和 `TERM` 判断。`LANG=C` 或 `TERM=dumb` 会降级为 ASCII。

## 常见问题

**执行后没有 HUD 或 Node 路径已经变更**：Windows 重新执行 `--setup` 以刷新
`codebuddy-hud.cmd`。Linux/macOS/WSL 请确认 settings command 中的 Node 与仓库绝对路径仍存在。

**需要查看已注册内容**：执行 `node runtime/bin/codebuddy-hud.js --status`，并检查默认或
`CODEBUDDY_SETTINGS_PATH` 指向的 `settings.json`。

**Credits 不显示或看起来不是总历史**：Credits 只针对当前 `transcript_path`。新 transcript 是新会话；
没有 `transcript_path` 时无法读取会话累计值。检查 provider 是否写入数值型
`providerData.rawUsage.credit`。

**`/clear` 后 Diff 或计时没有重置**：确保清空后至少收到一次新的 statusLine payload。HUD 会在
`session_id` 改变、`total_input_tokens` 回退，或当前上下文从较大值回到初始小值时建立新基线。若宿主未提供
这些边界信号，HUD 会保留宿主 payload 的原始统计，避免把普通上下文压缩误判为 `/clear`。

**Cache 显示 `cache --`**：provider 没有提供可计算的缓存字段时这是正常降级，不会伪造 0%。

**Unicode 字形异常**：设置 `CODEBUDDY_HUD_FORCE_ASCII=1`，或删除 CodeBuddy 根目录下的
`codebuddy-hud-cache-state.json` 后重新探测。

**只读 HOME、CODEBUDDY_HOME 或 settings 目录**：HUD 仍应静默退出；安装和持久化状态会跳过无法写入
的位置。为实际安装设置一个可写的 `CODEBUDDY_HOME` 或 `CODEBUDDY_SETTINGS_PATH`。

## 开发与测试

```bash
node --test "tests/unit/*.test.mjs"
npm run verify
node runtime/bin/codebuddy-hud.js --status
git diff --check
```

`npm run verify` 只调用仓库脚本，不会安装依赖。测试覆盖 stdin 垃圾数据和过大输入、EPIPE、缓存和
transcript 增量扫描、20MB transcript、`/clear` 会话统计基线、安装备份/恢复、Windows `.cmd`、ASCII/Unicode
与终端注入清理。

## 安全边界与限制

所有可能进入终端的外部字符串都会经过 `sanitizeTerminalText()`：ANSI CSI、OSC、OSC 8 超链接、C1
控制字符、bidi/RTL 控制字符和普通控制字符都会被移除，文本也会被长度限制。项目配置的 effort 值采用
白名单；深层配置和 `__proto__` 合并受到防护。

HUD 不发送网络请求，也不读取 transcript 之外的会话内容。工具活动只从 transcript 尾部滑窗读取，最多
256KB；单条特别巨大的 JSONL 条目可能让较旧的工具活动或当前轮次 cache telemetry 不可见，此时会优雅
回退。首次建立或损坏的 Credits state 会扫描对应 transcript，后续刷新只读取追加内容；state 写入失败只会
失去缓存，不会中断 HUD。`/clear` 没有可供 statusLine 直接消费的稳定 transcript 事件；当宿主同时不改变
`session_id`、也不回退上下文计数时，HUD 无法可靠地区分它与普通对话，只能保留原始 Diff 和耗时。
