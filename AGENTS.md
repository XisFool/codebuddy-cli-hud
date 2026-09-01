# codebuddy-cli-hud — AGENTS.md

CodeBuddy Code 的 statusLine HUD：宿主每 ~300ms 把会话 JSON 从 stdin 喂进来，
HUD 打印 ≤4 行 ANSI 看板。CommonJS，Node >=18。

## 硬约束（改任何代码前先记住）

- **零 npm 依赖**，只用 Node 内置模块
- **单次运行 <1500ms**（实测 p50 ~225ms；`bin/codebuddy-hud.js:10` 有超时兜底）。
  耗时构成：Node 启动 ~70ms + require ~23ms + **单次 git spawn 60-140ms（主要波动源）**，
  其余（解析/渲染/transcript 回扫）合计 <2ms
- **恒 `exit(0)`**：任何内部错误都必须静默降级为少几行，绝不能输出坏状态。
  入口用 `process.exitCode = 0` + 事件循环自然排空（stdout 管道在 POSIX 是异步写，
  立即 `process.exit()` 会截断输出——2026-09-01 修复）。自然排空会暴露宿主提前关闭
  stdout 时写回的异步 EPIPE error，所以入口挂上了 `process.stdout/stderr.on('error')`
  静默吞掉（2026-09-01 补丁）；`--setup/--uninstall` 抛错也被捕获记日志而非逃逸成 exit 1
- **默认 ≤4 行**（`config.js:30` `display.maxLines: 4`）。结构上限就是 4：
  `renderer.js` 只有 4 个 `lines.push` 调用点，项目配置把 maxLines 改成 9999 也超不过
- **所有外部字符串必须过 `sanitizeTerminalText()`**（防 transcript 注入 ANSI/OSC）。
  strip 范围含 C1（U+0080-U+009F）与 bidi 控制符（U+202E 等）——JSON.stringify 不转义
  这两个区段，此前会隐形穿透。effort 标签走 `resolveEffortLevel` 白名单
  （low/medium/high/max）+ 渲染层 sanitize 双保险：`config.defaultEffortLevel` 来自
  会话 cwd 下任意仓库的 `codebuddy-hud.config.json`，属不受信输入（2026-09-01 修复）

## 架构（入口 → 数据流）

```
runtime/bin/codebuddy-hud.js   入口；--setup/--status/--uninstall
  ├ parser.js                  从 payload 提取 token/diff/cost/agent
  ├ config.js                  默认 + 随包 + 项目级三方 deepMerge
  ├ renderer.js                4 行组装
  │ ├ renderer/format.js       颜色 / 进度条 / cache 命中率
  │ ├ renderer/diff-render.js
  │ └ renderer/agents-render.js
  ├ transcript.js              尾读 transcript（最近工具活动）
  ├ git.js / model-info.js / encoding.js / sanitize.js / paths.js
  └ statusline-installer.js    --setup 写 settings.json
tests/fixtures/*.json          4 个 payload fixture
scripts/verify-display.js      E2E
```

## 改完后怎么验（必读）

```bash
# 单测 —— 必须用 glob 形式，目录形式会假阳性 MODULE_NOT_FOUND
node --test "tests/unit/*.test.mjs"
npm run verify                       # 6 个 E2E 用例
node runtime/bin/codebuddy-hud.js --status   # 冒烟

# 真实 transcript 冒烟（路径换成 ~/.codebuddy/projects/**/*.jsonl 里的真实文件）：
node -e "console.log(JSON.stringify({model:{display_name:'x'},cwd:'C:/Users/谢文灿',
  transcript_path:'<真实.jsonl>',context_window:{context_window_size:200000,
  used_percentage:42,total_input_tokens:84000,total_output_tokens:1200,
  current_usage:{input_tokens:84000,output_tokens:1200}}}))" \
  | node runtime/bin/codebuddy-hud.js
```

## 两个必须知道的坑

1. **测试命令只能 glob 形式**：`node --test tests/unit/*.test.mjs`。
   目录形式 `node --test tests/unit/` 在 Windows Git Bash + Node 24 下会
   `MODULE_NOT_FOUND` 并报告 1 失败（即便全部真通过）。引号必须保留——
   由 Node 自己展开，不依赖 shell，Windows / WSL 行为一致。
3. **真实 transcript 行格式**：`function_call` / `function_call_result` 用
   `callId` 关联（Claude 的 `tool_use` / `tool_result` 也兼容）。
   单行可达数 KB（`providerData` 带完整 usage），所以 `transcript.js` 用
   16KB 滑动窗口从 EOF 回扫、上限 256KB，而非固定单次尾读。
4. **Windows `.cmd` shim 烘焙了安装时的 `process.execPath` 绝对路径**
   （`statusline-installer.js` `buildCmdShimContent`），不再裸依赖 PATH——
   nvm/fnm/volta 用户切换 node 版本后需重跑 `--setup`。
5. **chcp.com 结果缓存在 `~/.codebuddy/codebuddy-hud-cache-state.json`**
   （`encoding.js`）：首跑 ~80ms，之后 ~0.5ms。改过控制台代码页或看到字形异常时
   删掉该文件（或 `--uninstall`）即可重探；`CODEBUDDY_HUD_FORCE_ASCII/UNICODE`
   永远优先于缓存。`--uninstall` 会顺手清理它。
6. **错误日志 `~/.codebuddy/codebuddy-hud-error.log` 超过 1MB 自动重置**
   （只保留当前条目）——错误若以 300ms 节奏重复，无轮转时一天 ~28.8 万行。

## 已知语义细节

### cache 命中率（最容易踩的坑）

**真实遥测只存在于 transcript 的 `providerData` 里，不在 statusLine payload 里。**
`context_window.current_usage` 不带 cache 字段（或带恒 0 的陷阱字段）。

`transcript.js` 的 `getRecentUsageMetrics()` 从文件尾部滑窗扫最近一条
`providerData`，按优先级取字段：

| 优先级 | 字段 | 分母 |
|---|---|---|
| 1 | `rawUsage.prompt_cache_hit_tokens` | `rawUsage.prompt_tokens` |
| 2 | `usage.inputTokensDetails[].cached_tokens` | `usage.inputTokens` |
| 3 | `cache_read_input_tokens`（Anthropic 遗留） | 自适应 `input_tokens` |

优先级 1 和 2 里 **hit 已包含在 prompt 总数中**（`hit + miss === prompt_tokens`），
所以分母直接用 prompt 总数，**不要**再加一次 cache。只有优先级 3 才需要
自适应分母（Anthropic 的 `input_tokens` 可能不含 cache）。

> **陷阱**：这个 provider 的 `rawUsage` 同时带 `cache_read_input_tokens: 0`
> （恒零）和 `prompt_cache_hit_tokens: 133120`（真实值）。只读 Anthropic 风格
> 字段名会一直报 0%，而真实命中率是 96-99%。2026-09-01 修的就是这个。

**三态契约**（`renderer/format.js` `calculateTurnCacheMetrics`）：
- `null` — usage 对象整体缺失 → renderer 整段不渲染
- `{available:false}` — usage 存在但缺必需字段 → 渲染 `cache --`
- `{available:true,X%}` — 可计算 → 渲染值（含真 0.0%）

#### 口径：本轮聚合，不是单次调用的瞬时值

**一轮对话 = 多次 API 调用**（实测 avg 19.3 次/轮，max 38 次）。每条
`function_call` 各自带一份 `prompt_tokens` / `prompt_cache_hit_tokens`。

若只取文件末尾那一条（瞬时值），命中率会在 **0% ~ 99%** 之间剧烈跳变——
缓存失效后的第一次调用 `hit≈0`，之后迅速回到 96-99%。这就是"cache 有时为 0"
的第二个根因（第一个是上面的陷阱字段）。

所以 badge 显示 `getTurnUsageMetrics()` 的 **本轮聚合**：

```
从 EOF 回扫，收集所有 usage，遇到 role:'user' 的 message 立即停止
（该行是轮次起点，其 usage 属新一轮，不计入）
命中率 = sum(hitTokens) / sum(promptTokens)
```

扫描上限 `MAX_TURN_SCAN_LINES = 200`（长轮次也够；解析 200 行约 1.9ms，
占单次运行 ~250ms 的 1% 以内，性能不是瓶颈）。

`getRecentUsageMetrics()`（瞬时值）保留但 **HUD badge 不用它**，仅供调试。

renderer 的 cache badge 优先用本轮聚合；credits 则使用整个 transcript 的增量累计，
两者都扫不到时才 fallback 到 payload（fixture / `--status` 走这条路）。

### Token、变更与 Credits

- **Token 资源块**（`renderer.js` line 2）固定以 `Token <总数>` 开头，总数为
  当前 `inTokens + outTokens`；括号内保留 `in` / `out` 拆分，避免裸数字不清楚
  单位。它与上下文进度同样使用 `current_usage`，不是会话累计。
- **变更摘要**（line 3）以 Unicode `Δ` 开头；ASCII fallback 为 `[D]`。`+` 仍为
  绿色新增，`-` 仍为红色删除。
- **Credits 是整个 transcript 会话的实际累计消费，不是模型倍率**：
  `getSessionUsageMetrics()` 按偏移增量聚合所有 `providerData.rawUsage.credit`，状态
  保存在 `~/.codebuddy/codebuddy-hud-usage-state/` 下按 transcript 隔离的状态文件。缓存损坏、transcript 截断或
  轮换时自动从头重建。没有 transcript credit 时才用 payload 明示的 `cost.credits`；
  未知消费省略此段，绝不使用 `local_storage` 模型费率或伪造 `0.00x credits`。

### 其他

- **上下文进度条的分子**（`renderer.js` line 2）：用 `inTokens`（current_usage）
  而非 `totalInput`（会话累计），与 `used_percentage` 同基底；
  防止出现 `1.1M/1M=6%` 这种内部不一致。
- **`permission_mode` 截断**（`renderer.js` line 1）：22 字符上限，足够装
  `bypassPermissions`（17）。

## 已知遗留（有意未修）

- `--uninstall` 在 Linux 下会打印 "Removed Windows shim: ...codebuddy-hud.cmd"，
  即使该 shim 从未存在；仅文案误导，行为正确。
- **transcript 回扫 256KB 上限**：若当前轮里出现单条 >256KB 的巨型条目，
  比它更旧的 usage/工具活动不可见（badge 回落 payload 兜底）。无法靠截断 carry
  修复——截头后的 JSON 无法解析；属优雅降级，实测 20MB 单行 18ms、堆增量 2.5MB。
- **滑窗起点落在多字节 UTF-8 中间时**会产生一个 U+FFFD：实测 6/6 跨界用例
  JSON 仍解析成功（replacement char 落在字符串值内是合法 JSON），仅 detail 文本
  可能有一个乱码字符，无数据丢失，不改。
- **git 单调用解析**（`git status --porcelain -b`）：分支名理论上可含 " ("
  （极罕见）；detached 时才补一次 `rev-parse --short` 保住短哈希显示；
  空仓库（零提交）头部 `## No commits yet on master` 会解析出 unborn 分支名。
- **`.cmd` shim 中 node 路径里的 `%` 会被批量转义成 `%%`**（cmd 解析时还原为
  字面 `%`）——极端目录名（含 `%`）下 shim 依然可用；`%` 变体（如 `%PATH%`
  展开）不适用，属批处理固有语义。
- **项目配置里的 `__proto__` 键被 `deepMerge` 跳过**（防 [[Prototype]] 篡改）；
  合并深度上限 64，超过即取源子树整体替换（防爆栈）。
- `runtime/codebuddy-hud.config.json` 与 `DEFAULT_CONFIG` 逐字节相同（纯模板冗余），
  保留是因为改动收益低于噪音。

## 风格

- 提交前先跑 `node --test "tests/unit/*.test.mjs"`；254 个用例应全绿
- 函数 / 文件改动若偏离上述任一硬约束，必须在 PR 描述里点名并给出依据
