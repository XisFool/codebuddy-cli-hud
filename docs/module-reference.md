# CodeBuddy HUD 模块 API 参考手册 (Module Reference)

本文档系统梳理 `runtime/` 目录下的所有核心模块接口、职责划分、参数规范与设计边界。

---

## 1. `runtime/parser.js`

负责从宿主传入的原始 stdin JSON payload 中安全提取各类统计数据。

- `parseCodeBuddyInput(rawStdin: string): object | null`
  - 安全解析 JSON 输入，失败返回 `null`。
- `extractTokenData(cbData: object): { inTokens, outTokens, ctxSize, ctxPercent } | null`
  - 提取当前输入、输出 token 与上下文窗口大小及用量比例。
- `extractDiffStats(cbData: object): { added: number, removed: number }`
  - 提取代码增删行数。
- `extractCostData(cbData: object): { credits: number, totalDurationMs: number, apiDurationMs: number } | null`
  - 提取消费与耗时数据。
- `extractAgentData(cbData: object): { activeAgents, runningTasks, completedTasks, queuedTasks }`
  - 提取子代理与后台任务列表。

---

## 2. `runtime/config.js`

负责多层级配置合并与主题系统调色板解析。

- `loadConfig(cwd?: string): object`
  - 按优先级合并默认配置、内置配置、用户全局配置（`~/.codebuddy/codebuddy-hud.config.json`）与项目局部配置（`./codebuddy-hud.config.json`）。
- `deepMerge(target: object, source: object, depth?: number): object`
  - 深度不可变合并，自动忽略 `__proto__` 键，深度上限 64。
- `resolveTheme(config: object): object`
  - 解析主题调色板，支持深色（dark）与浅色（light）模式自适应。
- `detectThemeMode(config: object): 'dark' | 'light'`
  - 根据配置或终端环境变量 `COLORFGBG` 判定明暗色调。

---

## 3. `runtime/renderer.js`

HUD 看板 4 行组装与渲染核心。

- `renderHUD(cbData: object, config: object): string`
  - 综合调用子渲染模块，输出最终 $\le 4$ 行 ANSI 字符串。

### 子渲染器 (`runtime/renderer/`)
- `format.js`:
  - `formatTokens(num: number): string`：格式化 token 数量（如 `1.5k`, `2.1M`）。
  - `createProgressBar(pct: number, width: number, thresholds: object, glyphs: object): string`：生成彩色用量进度条。
  - `calculateTurnCacheMetrics(...)` / `formatTurnCacheBadge(...)`：Prompt Cache 命中率徽标生成。
- `diff-render.js`:
  - `renderDiffSegment(diffStats, costData, config, glyphs, creditSpend): string | null`：渲染 Line 3 变更与花费行。
- `agents-render.js`:
  - `renderAgentLine(...)` / `renderToolActivity(...)`：渲染 Line 4 代理与工具调用状态。
- `lang.js`:
  - `getI18n(config: object): { lang, t(key, fallback), dict }`：多语言字典查询与翻译辅助。

---

## 4. `runtime/transcript.js`

负责 `transcript.jsonl` 日志的逆向滑窗扫描与增量统计。

- `getTurnUsageMetrics(transcriptPath: string, opts?: object): { hitTokens, promptTokens, credits } | null`
  - 从 EOF 回扫当前轮次（至上一次 `role: 'user'`）的所有 API 调用 usage。
- `getSessionUsageMetrics(transcriptPath: string, opts?: object): { credits: number } | null`
  - 基于 SHA-256 Checkpoint 机制的增量 Credits 累计。
- `getTurnToolActivity(transcriptPath: string, opts?: object): object | null`
  - 提取当前轮次正在执行的活跃工具与已完成工具频次聚合。

---

## 5. `runtime/session-stats.js`

管理会话重置与指标差值逻辑。

- `getLogicalSessionCostData(cbData: object, rawStats: object, opts?: object): object`
  - 识别 `/clear` 场景，记录状态基线并返回相对于基线的实际会话增量。

---

## 6. `runtime/git.js`

Git 仓库状态快速探测。

- `getGitStatus(cwd: string, timeoutMs?: number): { branch: string, dirty: boolean } | null`
  - 单次 `git status --porcelain -b` 探测分支与脏状态，超时保底 200ms。

---

## 7. `runtime/encoding.js`

终端字符集与字体图标适配。

- `supportsUnicode(): boolean`
  - 检测终端是否支持 Unicode（Windows 通过 `chcp.com` 探测并缓存）。
- `selectGlyphs(useNerdFonts: boolean, unicodeSupported: boolean): object`
  - 根据环境选取 Nerd Fonts、Unicode 或纯 ASCII 符号集。

---

## 8. `runtime/sanitize.js`

终端文本安全防御。

- `sanitizeTerminalText(text: string, maxLen?: number): string`
  - 剔除 ANSI 转义字符、OSC 序列、C0/C1 控制符与 Bidi 伪装字符，并进行长度截断。

---

## 9. `runtime/statusline-installer.js` 与 `scripts/bootstrap.js`

一键安装与配置引导器。

- `setup(options?: object)`:
  - 写入 `settings.json` 并生成 Windows `.cmd` shim。
- `uninstall(options?: object)`:
  - 恢复 `settings.json` 备份并清理 shim、缓存与状态文件。

---

## 10. `runtime/doctor.js`

环境诊断与排障工具。

- `runDoctor(options?: object): { timestamp, status, ok, checks }`
  - 采集 Node、CodeBuddy 配置、终端编码、Git 与 Transcript 状态报告。
- `printDoctorReport(report: object, isJson: boolean)`
  - 格式化输出终端彩色清单或标准 JSON。

---

## 11. `runtime/update-checker.js`

后台无感异步版本更新检测。

- `checkForUpdates(options?: object): Promise<object>`
  - 检查远端版本并更新 `codebuddy-hud-update-status.json`。
- `spawnBackgroundUpdateCheck()`
  - 派生独立后台进程执行检查，主进程零等待。
