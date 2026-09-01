# codebuddy-cli-hud

[![Node.js >=18](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm dependencies](https://img.shields.io/badge/npm%20dependencies-0-2ea44f)](#安装)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#许可证)

> CodeBuddy Code 的实时终端 statusLine HUD。每次会话刷新后，它在终端底部展示当前模型、上下文、Token、缓存命中、代码变更、会话 Credits 与任务进度。
>
> 不需要 `npm install`，不发送网络请求，也不会因为 HUD 出错而中断 CodeBuddy。

[GitHub 项目](https://github.com/XisFool/codebuddy-cli-hud) · [安装](#安装) · [验证](#验证) · [诊断](#诊断) · [卸载](#卸载)

---

## 显示效果

```text
GPT-5.5  high  |  main*  |  my-project  |  default
Token 250.1k (in: 249k · out: 1.1k)  |  249k/1M [##........] 25%  |  cache 96.8%
Δ +1.7k -161  |  82.04 credits  |  2h47m (API: 1h23m)
2 active  |  5/8 done  |  Edit auth.ts
```

### 四行布局

- **第 1 行：当前环境**。模型、推理强度、Git 分支、项目目录和权限模式。
- **第 2 行：上下文资源**。本次上下文的输入/输出 Token、上下文进度和当前轮次缓存命中率。
- **第 3 行：会话进度**。代码新增/删除、当前会话 Credits、总耗时与 API 耗时。
- **第 4 行：正在做什么**。活跃子代理、任务完成进度，以及最近的工具调用。

没有对应数据的行或片段会自动隐藏。HUD 最多输出 4 行。

支持 Unicode 的终端会显示 `Δ` 和进度条；不支持时自动使用 `[D]`、`#` 等 ASCII 回退，不会显示乱码。

---

## 安装

前提：已安装 **Node.js >= 18**，并且本机已使用 CodeBuddy Code。

### Windows PowerShell 或 cmd.exe

```powershell
git clone https://github.com/XisFool/codebuddy-cli-hud.git
cd codebuddy-cli-hud
node runtime/bin/codebuddy-hud.js --setup
```

### Linux、macOS 与 WSL

```sh
git clone https://github.com/XisFool/codebuddy-cli-hud.git
cd codebuddy-cli-hud
node runtime/bin/codebuddy-hud.js --setup
```

安装器会：

1. 写入 CodeBuddy `settings.json` 的 `statusLine.command`。
2. 首次覆盖已有 statusLine 前，备份原 settings 为 `settings.json.bak.codebuddy-hud`。
3. 在 Windows 生成本机专用的 `runtime/bin/codebuddy-hud.cmd`。

重新运行 `--setup` 是安全的：它会修复路径和 Windows Node 版本变更，但不会覆盖第一次安装留下的原始 settings 备份。

> Windows 的 `.cmd` shim 内含安装时的 Node 绝对路径，因此从 GUI 启动的 CodeBuddy 不依赖当前终端的 `PATH`。不要从其他电脑复制这个文件；切换 nvm、fnm、Volta 的 Node 版本后重新执行 `--setup`。

---

## 验证

安装完成后，先在仓库目录运行：

```bash
node runtime/bin/codebuddy-hud.js --status
```

它应输出示例 HUD。随后新开或刷新一个 CodeBuddy Code 会话，HUD 会出现在终端底部。

也可以检查 `settings.json` 是否已包含 `statusLine`：

```powershell
Get-Content "$env:USERPROFILE\.codebuddy\settings.json"
```

```sh
cat "$HOME/.codebuddy/settings.json"
```

默认 settings 路径：

| 平台 | 默认路径 |
| --- | --- |
| Windows | `%USERPROFILE%\.codebuddy\settings.json` |
| Linux / macOS / WSL | `$HOME/.codebuddy/settings.json` |

settings 会保存安装时的仓库和 Node 绝对路径。因此仓库被移动、删除，或者 Node 安装路径变化后，只需回到仓库重新执行 `--setup`。

---

## 诊断

### 没有看到 HUD

最常见原因是 `statusLine.command` 指向了已移动的仓库或旧 Node 路径。进入仓库后重新执行：

```bash
node runtime/bin/codebuddy-hud.js --setup
```

### Unicode 图标或进度条乱码

先强制使用 ASCII：

```powershell
$env:CODEBUDDY_HUD_FORCE_ASCII = '1'
```

```sh
export CODEBUDDY_HUD_FORCE_ASCII=1
```

也可以删除 CodeBuddy 根目录中的 `codebuddy-hud-cache-state.json` 后重新打开会话，让 HUD 重新检测终端编码。

### Credits 未显示或看起来不是账号总消费

Credits 只针对当前 `transcript_path`，不是账户历史总消费。请确认 transcript 中包含数值型 `providerData.rawUsage.credit`；没有 `transcript_path` 时，HUD 无法读取 transcript 累计值。

### `/clear` 后 Diff 或计时没有重置

等待下一次 statusLine 刷新。HUD 通过 `session_id` 变化、上下文累计回退或当前上下文回到初始小值识别清空边界。若宿主不提供任何这些边界信号，HUD 会保留原始统计，避免把正常上下文压缩误判为 `/clear`。

### HOME、settings 或状态目录不可写

HUD 会静默降级并保持 CodeBuddy 正常运行。若要完成安装或保存状态，请把 `CODEBUDDY_HOME` 或 `CODEBUDDY_SETTINGS_PATH` 指向可写位置。

---

## 卸载

在仓库目录执行：

```bash
node runtime/bin/codebuddy-hud.js --uninstall
```

卸载器会恢复首次安装前备份的 `settings.json`。没有备份时，它只删除本项目写入的 statusLine，并清理 HUD 本地缓存、Credits checkpoint 和会话统计基线。Windows 同时移除本机生成的 `.cmd` shim。

---

## 配置（可选）

默认配置已经适合日常使用。需要按项目调整时，在项目根目录创建 `codebuddy-hud.config.json`：

```json
{
  "display": {
    "showToolActivity": true,
    "showCacheHitRate": true,
    "showDiffStats": true,
    "unicode": "auto"
  }
}
```

| 配置 | 作用 |
| --- | --- |
| `display.showTokenBar` | 显示或隐藏 Token 与上下文进度条。 |
| `display.showCacheHitRate` | 显示或隐藏缓存命中率。 |
| `display.showDiffStats` | 显示或隐藏代码变更统计。 |
| `display.showCost` | 显示或隐藏 Credits。 |
| `display.showDuration` | 显示或隐藏总耗时与 API 耗时。 |
| `display.showToolActivity` | 显示或隐藏最近工具活动。 |
| `display.unicode` | `"auto"`、`true` 或 `false`。 |
| `display.useNerdFonts` | 设为 `true` 时使用 Nerd Fonts 图标。 |

无论怎样配置，HUD 都不会超过 4 行。

---

## 数据口径

### Token 与 cache

`Token` 显示的是当前 `context_window.current_usage` 的输入和输出，不是整个会话累计。上下文进度条也使用当前上下文数据，因此不会出现累计 Token 与进度百分比不一致的情况。

`cache` 优先使用 transcript 中当前对话轮次的 provider telemetry 聚合计算。遥测缺失时显示 `cache --`，不会把未知状态伪装成 0%。

### Diff 与耗时

`Δ +N -M`、总耗时和 API 耗时都代表当前逻辑会话。执行 `/clear` 后，HUD 识别到会话边界时会从零开始统计。

### Credits

Credits 是当前 `transcript_path` 对应会话的**累计实际消费**：它汇总所有合法的 `providerData.rawUsage.credit`，不是模型倍率、不是单轮消费、也不是整个用户历史的总额。

- `credit: 0` 会被保留为真实零消费。
- 缺失、负数、字符串、`NaN` 和无限值不会计入。
- 每个 transcript 独立累计；新 transcript 即新会话。
- 有有效 transcript credit 时，优先显示它，而不是 payload 的美元估值。
- 没有 `transcript_path` 时，只能回退使用 payload 明示的 `cost.credits`。

---

## 高级路径设置

默认 CodeBuddy 根目录为 `~/.codebuddy`。需要隔离测试、便携安装或排障时，可以使用：

| 变量 | 用途 |
| --- | --- |
| `CODEBUDDY_HOME` | 覆盖 CodeBuddy 根目录；HUD 缓存与 transcript 状态放在其中。 |
| `CODEBUDDY_SETTINGS_PATH` | 直接指定 `settings.json`，优先级高于 `CODEBUDDY_HOME`。 |

PowerShell：

```powershell
$env:CODEBUDDY_HOME = 'D:\temp\codebuddy-home'
node runtime/bin/codebuddy-hud.js --setup
```

Bash、zsh 或 WSL：

```sh
export CODEBUDDY_HOME="/tmp/codebuddy-home"
node runtime/bin/codebuddy-hud.js --setup
```

---

## 隐私、兼容性与限制

- 不发送网络请求，不读取 transcript 以外的会话内容。
- 所有输出到终端的外部文本都会经过 `sanitizeTerminalText()`；ANSI/OSC 注入、控制字符和 bidi/RTL 控制字符会被移除。
- Credits checkpoint 和会话基线只保存在本机 CodeBuddy 根目录。缓存损坏、文件截断或状态不可写时会自动降级，不会中断 HUD。
- Windows、Linux、macOS、WSL 均支持；含空格、Unicode 与常见 shell 特殊字符的安装路径可用。
- 单次运行目标小于 1500ms，所有内部异常静默处理并以 exit code `0` 结束。
- 特别巨大的单条 transcript 记录可能使较早的工具活动或当前轮 cache telemetry 不可见；HUD 会省略该段或回退到 payload。

---

## 开发与测试

项目使用 CommonJS 和 Node.js 内置模块。

```bash
node --test "tests/unit/*.test.mjs"
npm run verify
node runtime/bin/codebuddy-hud.js --status
git diff --check
```

## 许可证

MIT
