# CodeBuddy HUD 维护者文档索引 (Documentation Hub)

> 本目录包含面向开发者、维护者与 AI 智能体的核心技术知识库，与 `codebuddy-hud` 代码库规范及运行时实现严格对齐。

---

## 📚 一、文档体系矩阵 (Documentation Matrix)

| 核心文档 | 内容概要 | 适用场景 |
| :--- | :--- | :--- |
| [**`README.md`**](README.md) | 维护者文档总览、场景化索引、关键不变量与代码映射表 | 文档导航、维护规则速查 |
| [**`architecture.md`**](architecture.md) | 系统架构全景：两层设计、执行流时序、逆向滑窗遥测、/clear 基线、安全防御 | 架构理解、系统级改动、性能调优 |
| [**`architecture_zh.md`**](architecture_zh.md) | 中文版架构全景设计文档（与英文版完全同步对照） | 中文开发者与维护者阅读 |
| [**`module-reference.md`**](module-reference.md) | 运行时全模块 API 手册：接口签名、数据结构 Shape、参数规范与设计边界 (Why) | 模块开发、接口变更、Bug 修复 |

---

## 🧭 二、场景化快速导航 (Quick Navigation by Task)

### 💡 我想了解整体系统架构与数据流
👉 查看 [**`architecture.md#2-two-layer-physical-design`**](architecture.md#2-two-layer-physical-design) 与 [**`architecture.md#4-execution-flow-per-agent-step`**](architecture.md#4-execution-flow-per-agent-step)。

### 💻 我需要修改或新增某个功能模块（查 API 签名与数据结构）
👉 查看 [**`module-reference.md`**](module-reference.md)，按模块目录索引查阅参数与返回值契约。

### ⚡ 遇到高频触发下的并发与子进程问题
👉 查看 [**`architecture.md#54-background-update-stampede-prevention-pre-locking`**](architecture.md#54-background-update-stampede-prevention-pre-locking) 了解预占位锁机制。

### 🔄 会话 `/clear` 后指标未重置或 Token 统计异常
👉 查看 [**`architecture.md#52-session-baseline-tracking--clear-detection`**](architecture.md#52-session-baseline-tracking--clear-detection) 与 [**`module-reference.md#10-runtimesession-statsjs`**](module-reference.md#10-runtimesession-statsjs)。

### 📊 Prompt Cache 命中率或实际 Credits 消费显示偏差
👉 查看 [**`architecture.md#51-reverse-sliding-window-transcript-scanning`**](architecture.md#51-reverse-sliding-window-transcript-scanning) 与 [**`module-reference.md#9-runtimetranscriptjs`**](module-reference.md#9-runtimetranscriptjs)。

### 🖥️ Windows 终端出现乱码、路径找不到或 `.cmd` 执行失败
👉 查看 [**`architecture.md#8-cross-platform--zero-dependency-guarantees`**](architecture.md#8-cross-platform--zero-dependency-guarantees) 与 [**`module-reference.md#14-runtimestatusline-installerjs`**](module-reference.md#14-runtimestatusline-installerjs)。

### 🛡️ 终端出现异常字符或格式错乱
👉 查看 [**`architecture.md#6-security-threat-model--terminal-defense`**](architecture.md#6-security-threat-model--terminal-defense) 与 [**`module-reference.md#13-runtimesanitizejs`**](module-reference.md#13-runtimesanitizejs)。

---

## 🚨 三、不可动摇的核心工程不变量 (Key Invariants)

在进行任何代码修改或功能扩展时，必须严格遵守以下 **7 项核心红线约束**：

1. **绝对零 npm 依赖 (Zero npm dependencies)**：
   - 必须纯基于 Node.js 18+ 原生标准库（`fs`, `path`, `os`, `crypto`, `child_process`, `readline`, `https` 等）。
   - 禁止在 `package.json` 添加任何外部 `dependencies`。
2. **状态栏热路径恒 `process.exitCode = 0`**：
   - 状态栏属于被动高频调用组件。任何未捕获异常必须记录至 `codebuddy-hud-error.log`（上限 1MB 自动轮转），**绝不能抛出非零 Exit Code**，防止终端闪烁或主会话异常。
3. **单次执行硬超时 $\le 1500\text{ms}$（Stdin 超时保底 $800\text{ms}$）**：
   - Stdin 管道未结束时必须在 $800\text{ms}$ 强行断开并执行渲染；总执行耗时不得超过 $1500\text{ms}$。
4. **后台异步任务必须执行“预占位打标（Pre-locking）”**：
   - 凡在被动触发的链路中派生后台异步进程（如版本检查），必须在 `spawn` 之前**先行落盘写入时间戳**，彻底阻断 300ms 高频触发下的惊群风暴与进程炸弹。
5. **数据真实性契约 (Truthful Telemetry)**：
   - Prompt Cache 命中率与 Credits 必须取自 transcript 的真实遥测数据，缺失时优雅降级（如 `cache --`），**绝对禁止硬编码假数据**。
6. **全量外部输入必须防御 ANSI/OSC/Bidi 注入**：
   - 所有外部传入的字符串（Git 分支、模型名称、工具详情、用户路径）在渲染前必须经过 `sanitizeTerminalText()` 清洗。
7. **输出行数严格限制 $\le 4$ 行**：
   - 结构上限 4 行，空数据行智能裁剪，禁止超出视口高度破坏终端滚动缓冲区。

---

## 🗺️ 四、源文件与文档章节 1:1 映射表 (Source-to-Doc Traceability)

| 源代码路径 | 核心职责 | 对应架构文档 | 对应模块手册 |
| :--- | :--- | :--- | :--- |
| `runtime/bin/codebuddy-hud.js` | CLI 入口、参数解析、管道超时与生命周期排空 | [architecture.md §4](architecture.md#4-execution-flow-per-agent-step) | [module-reference.md §1](module-reference.md#1-runtimebincodebuddy-hudjs--cli-entrypoint) |
| `runtime/parser.js` | 宿主 Stdin JSON 提取与边界容错 | [architecture.md §4](architecture.md#4-execution-flow-per-agent-step) | [module-reference.md §2](module-reference.md#2-runtimeparserjs--payload-parser) |
| `runtime/config.js` | 多层级配置合并与主题调色板解析 | [architecture.md §5.5](architecture.md#55-multi-layer-configuration--theme-palette-engine) | [module-reference.md §3](module-reference.md#3-runtimeconfigjs--configuration--theme-engine) |
| `runtime/renderer.js` | 4 行状态栏看板排版与组装编排 | [architecture.md §5.6](architecture.md#56-4-line-adaptive-layout--terminal-safe-rendering) | [module-reference.md §4](module-reference.md#4-runtimerendererjs--hud-layout-orchestrator) |
| `runtime/renderer/format.js` | Token 格式化、进度条、Cache 命中率徽标生成 | [architecture.md §5.6](architecture.md#56-4-line-adaptive-layout--terminal-safe-rendering) | [module-reference.md §5](module-reference.md#5-runtimerendererformatjs--formatting-helpers) |
| `runtime/renderer/diff-render.js` | Line 3 代码增删、Credits 与耗时渲染 | [architecture.md §5.6](architecture.md#56-4-line-adaptive-layout--terminal-safe-rendering) | [module-reference.md §6](module-reference.md#6-runtimerendererdiff-renderjs--diff--cost-segment) |
| `runtime/renderer/agents-render.js`| Line 4 子代理状态与工具调用频次聚合 | [architecture.md §5.6](architecture.md#56-4-line-adaptive-layout--terminal-safe-rendering) | [module-reference.md §7](module-reference.md#7-runtimerendereragents-renderjs--agent--tool-segment) |
| `runtime/renderer/lang.js` | 中英双语国际化字典与语言探测 | [architecture.md §7](architecture.md#7-internationalization-i18n-subsystem) | [module-reference.md §8](module-reference.md#8-runtimerendererlangjs--i18n-dictionary) |
| `runtime/transcript.js` | 逆向滑窗遥测、跨块拼装与增量 Checkpoint | [architecture.md §5.1, §5.3](architecture.md#51-reverse-sliding-window-transcript-scanning) | [module-reference.md §9](module-reference.md#9-runtimetranscriptjs--telemetry-scanner) |
| `runtime/session-stats.js` | `/clear` 会话基线捕获与指标差值管理 | [architecture.md §5.2](architecture.md#52-session-baseline-tracking--clear-detection) | [module-reference.md §10](module-reference.md#10-runtimesession-statsjs--session-baseline-tracker) |
| `runtime/git.js` | Git 分支与脏状态非阻塞探测 | [architecture.md §8](architecture.md#8-cross-platform--zero-dependency-guarantees) | [module-reference.md §11](module-reference.md#11-runtimegitjs--git-environment-probe) |
| `runtime/encoding.js` | Unicode/ASCII/NerdFonts 探测与 Windows 缓存 | [architecture.md §8](architecture.md#8-cross-platform--zero-dependency-guarantees) | [module-reference.md §12](module-reference.md#12-runtimeencodingjs--terminal-charset-probe) |
| `runtime/sanitize.js` | 终端文本 ANSI CSI/OSC/Bidi 注入拦截 | [architecture.md §6](architecture.md#6-security-threat-model--terminal-defense) | [module-reference.md §13](module-reference.md#13-runtimesanitizejs--terminal-security-filter) |
| `runtime/statusline-installer.js` | `settings.json` 配置与 Windows `.cmd` 绝对路径烘焙 | [architecture.md §8](architecture.md#8-cross-platform--zero-dependency-guarantees) | [module-reference.md §14](module-reference.md#14-runtimestatusline-installerjs--installer) |
| `runtime/doctor.js` | `--doctor` 5 维度环境体检与物理路径强校验 | [architecture.md §7](architecture.md#7-diagnostic-and-troubleshooting-system) | [module-reference.md §15](module-reference.md#15-runtimedoctorjs--environment-doctor) |
| `runtime/update-checker.js` | 24h 异步版本检查与防惊群预占位锁 | [architecture.md §5.4](architecture.md#54-background-update-stampede-prevention-pre-locking) | [module-reference.md §16](module-reference.md#16-runtimeupdate-checkerjs--update-checker) |
| `runtime/uninstall.js` | 状态栏恢复、Shim 移除与持久化状态深度清理 | [architecture.md §8](architecture.md#8-cross-platform--zero-dependency-guarantees) | [module-reference.md §17](module-reference.md#17-runtimeuninstalljs--cleaner) |
| `scripts/bootstrap.js` | 远程/本地安装器、临时目录原子替换 | [architecture.md §2](architecture.md#2-two-layer-physical-design) | [module-reference.md §18](module-reference.md#18-scriptsbootstrapjs--atomic-installer) |
| `scripts/verify-display.js` | 端到端 E2E 渲染校验与 4 行/超时守卫 | [architecture.md §9](architecture.md#9-quality-assurance--testing-matrix) | [module-reference.md §19](module-reference.md#19-scriptsverify-displayjs--e2e-verifier) |
| `skills/hud-config/SKILL.md` | AI Agent 交互式主题与配置技能 | [architecture.md §2](architecture.md#2-two-layer-physical-design) | [module-reference.md §20](module-reference.md#20-skillshud-configskillmd--ai-agent-skill) |
