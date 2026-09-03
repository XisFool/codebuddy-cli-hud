# codebuddy-hud 深度审查与演进报告（交接与执行进度版）

> 本文档为一次 **4 维度并行 Subagent 深度审计** 的完整结论与后续执行追踪。
> - **审查对象仓库：** `D:\code_sum\Github\codebuddy-cli-hud`（`XisFool/codebuddy-hud`，`v0.1.0`，master）
> - **审计日期：** 2026-09-02 | **执行更新：** 2026-09-03
> - **执行状态：** **第一优先（最小充分集）已全部修复完成并通过独立 Subagent 复核**；第二、三、四优先待推进。

---

## 0. 实测基线（最新实测，全部命令通过）

运行环境：Windows 11 / Node `v24.13.0` / git `2.52.0.windows.1` / cmd.exe 可用。

| 命令 | 原始审计基线 | 当前最新结果（第一优先修复后） | 状态 |
|---|---|---|:---:|
| `npm test` | 313 tests，312 通过，1 失败 (F14) | **316 tests，316 全部通过，0 失败** | ✔ 全绿 |
| `npm run verify` | 6/6 通过 | **6/6 全部通过**（75ms~198ms，远优于 1500ms） | ✔ 全绿 |
| `node runtime/bin/codebuddy-hud.js --doctor` | 全部检查 ✔ | **全部检查 ✔**（Node 24、CODEBUDDY_HOME、settings 等） | ✔ 全绿 |
| `node runtime/bin/codebuddy-hud.js --status` | 渲染 4 行，exit 0 (含后台派生) | **渲染标准看板，exit 0，纯本地无子进程** | ✔ 全绿 |

复跑命令：
```bash
cd "D:/code_sum/Github/codebuddy-cli-hud"
npm test
npm run verify
node runtime/bin/codebuddy-hud.js --doctor
node runtime/bin/codebuddy-hud.js --status; echo "exit=$?"
```

---

## 1. 审计方法概述

- **32 个并行 Subagent**（5 缺陷查找域 + 逐条对抗验证 + 3 文档对齐域 + 2 基准对比 + 2 测试/实测 + 1 完备性检视），约 198 万 subagent token、703 次工具调用、全部成功（0 错误 0 空结果）。
- **主 Agent 一手复核**（独立验证了以下关键声明，供交叉印证）：
  - **shim 失败用例真相**（见 §2 F14）：`buildCmdShimContent` 本身正确——用**完整路径**调用 `"<path>\shim.cmd" "two words"` 成功返回 `ARGV=["two words"]`；失败根因是**测试用裸相对 `.cmd` 名 + node `execSync` 的 `/s /c` 引号纠缠**导致 cmd 报 `not recognized`。**`&` 字符是误导性诊断。**
  - **4 行上限确有强制**：`runtime/renderer.js:191-192` `return lines.slice(0, maxLines).join('\n')`，`maxLines = config.display.maxLines || 4`。
  - **sanitize 字节级验证**：对 OSC-8 超链接、CSI、C0/C1、DEL、Bidi（U+202E/202A-E/2066-F）均正确剥离（实测 `evil2` 全清为 `"normal "`，危险字节检测全 false）。**当前无 CVE**。
  - **update-checker 防惊群锁有效、子进程不递归派生**（无泄漏）；仅存极窄的读写 TOCTOU（见 §2 F16，P2）。
  - **架构本质**：零进程内并发（单线程同步执行 + 每次刷新全新进程），并发风险集中在**跨进程状态文件竞态**。

---

## 2. 综合评分与定性评级

| 维度 | 得分 | 要点 |
|---|---|---|
| 架构 (25%) | **88** | 20 个单一职责模块解耦清晰；宿主契约（恒 exit 0、≤4 行、≤1500ms、800ms stdin 兜底、EPIPE 吞停、自然 drain 替 `process.exit`）设计成熟。但「每刷新全新进程 + 同步执行」限制吞吐，跨进程状态文件存在竞态面。 |
| 代码/健壮性 (35%) | **78** | 无 P0；1 个 P1（raw-mode 中断泄漏）；若干 P2 正确性/延迟/健壮性；sanitize 覆盖全面但漏 U+2028/29 与零宽字符、截断可切多字节。 |
| 测试 (20%) | **84** | 313 用例 / 3201 行，近乎 1:1 runtime（3753 行），focused 且多走真实 fs/paths；但 1 失败用例为测试本身缺陷，且 shim/`--theme`/`--doctor` 集成、bootstrap、sanitize 零宽族未真正覆盖。 |
| 文档 (20%) | **70** | 体系完整可读、算法描述大体准确；但存在**显著 vs 代码漂移**，含 1 处**虚假隐私声明**与 1 处**伪造的十六进制主题色**。 |

**加权综合：** `78×.35 + 88×.25 + 84×.20 + 70×.20 = 80.1 / 100`
**定性评级：** **B+（良好偏优）** — 生产就绪级专用工具：契约守得好、测试扎实、无高危注入；主要拖分项是文档漂移、1 个 P1 终端状态泄漏与少数 P2 健壮性项。

---

## 3. 缺陷清单（Bug List）

> 对抗验证结论：✅ CONFIRMED（真实缺陷） / ⚠️ PARTIAL（观察属实但严重度/成因需修正，列为低优先级容错） / ❌ REFUTED（已排除，非缺陷）。

### P0（Critical）— 无
未发现可利用的 CVE/注入、未发现 exit≠0 或悬挂、未发现无限子进程泄漏。live-probe 独立确认：「每一条契约维度均成立，无 CVE」。

### P1（High）— 1 个（已修复 100%）

**F11 【已修复 DONE】✅ 主题交互选择器泄漏 raw-mode（终端失活）**
- **场景：** 用户运行交互式 `--theme` 选择器后，进程收到真实中断（SIGTERM/SIGHUP/超时 kill/Ctrl+C 走信号而非按键）。
- **根因：** `runtime/theme-selector.js:129` 仅 `process.stdin.setRawMode(true)`；raw-mode 恢复只挂在按键分支的 `cleanup()`（136-145 行），**没有任何 `process.on('SIGINT'/'SIGTERM'/'exit')` 兜底**；且 `once('exit')` 里只调 `setRawMode(false)` 并不完整恢复。
- **修复：** 已注册 `SIGINT/SIGTERM/SIGHUP/exit` 信号处理与防重入 `cleanup()`，恢复光标、rawMode 及输入流。

### P2（Medium）— 已完成 8 个，待推进 9 个

**F5 【已修复 DONE】✅ 显示用 `used_percentage` 未钳制（与已钳制的进度条矛盾）**
- **场景：** `used_percentage=500` 或 `-10` → 渲染 `[##########] 500%` / `[----------] -10%`。
- **修复：** `runtime/renderer.js` 已将 `clampedPct` 钳制在 `[0, 100]`，百分比与警告色计算均基于钳制值。

**F6 【已修复 DONE】✅ `formatTokens` 的 `'1000'→'1M'` 守卫是不可达死代码**
- **修复：** 已从 `runtime/renderer/format.js` 中彻底删除该无用分支。

**F7 【已修复 DONE】✅ `renderHUD` 在 config 缺 `display`/`theme` 子对象时崩溃**
- **修复：** `runtime/renderer.js` 已做 `disp = config.display || {}; theme = config.theme || {};` 归一化。

**F13 【已修复 DONE】✅ `git.js` 未设 `maxBuffer`，>1MB porcelain 输出被静默丢弃**
- **修复：** `runtime/git.js` 的 `execOpts` 已显式增加 `maxBuffer: 4 * 1024 * 1024`。

**F17 【已修复 DONE】✅ `parseSemver/compareVersions` 丢弃 prerelease 与第 4 分量**
- **修复：** `runtime/update-checker.js` 已完整实现符合 SemVer 2.0.0 的 prerelease 比较逻辑。

**F18 【已修复 DONE】✅ `--status` 探测会派生 detached 网络子进程（并不轻量）**
- **修复：** `runtime/bin/codebuddy-hud.js` 已从 `--status` 移除 `spawnBackgroundUpdateCheck()`，纯本地轻量运行。

**F3 【已修复 DONE】✅ 非字符串 `cwd` 字段使 `loadConfig` 抛错 → 静默空 HUD**
- **修复：** `runtime/config.js` 已添加 `typeof cwd === 'string' && cwd` 守卫。

**F14 【已修复 DONE】✅ Windows shim 测试引号纠缠导致误报失败**
- **修复：** `tests/unit/statusline-installer.test.mjs` 改用与宿主一致的绝对双引号路径调用，测试恢复绿灯。

---

#### 待推进的 P2 缺陷清单（TODO）

**F9 【待推进 TODO】✅ `getSessionUsageMetrics` 前向扫描无总字节上限（可阻塞事件循环 >1500ms）**
- 场景：每次刷新（~300ms）都调用；首次/缓存失效/轮转时 `offset=0`，`transcript.js:522-555` `while(cursor<size)` 同步读完整追加增量。
- 根因：每块 64KB 有界，但总扫描字节无界，仅峰值内存受限。
- 修复方案：
```js
const CAP = 256 * 1024;   // 或 512KB
let scanned = 0;
while (cursor < size && scanned < CAP) { ... scanned += readLen; ... }
// 若因 cap 提前退出，持久化本次已扫描的 offset，下次续读（收敛而非停摆）
```

**F16 【待推进 TODO】✅ 更新检查占位锁「先读后写」(TOCTOU) — 两个并发进程都会派生子进程**
- 场景：`paths.js:39-41` 明确多工作区并存；`spawnBackgroundUpdateCheck()`（`update-checker.js:133-157`）读门(135)→写锁(142)→派生(148)，`fs.writeFileSync` 非排他、无 CAS。
- 修复方案（排他锁 + finally 释放）：
```js
const lockPath = getUpdateStatusPath() + '.lock';
try {
  const fd = fs.openSync(lockPath, 'wx');   // EEXIST 即已有人建锁
  try { /* check gate + write update status */ } finally { fs.closeSync(fd); fs.rmSync(lockPath, { force: true }); }
} catch (e) { if (e.code !== 'EEXIST') throw; /* 竞争 → 放弃派生 */ }
```

**F2 【待推进 TODO】⚠️ `sanitizeTerminalText` 未剥离 U+2028/2029（LS/PS 行/段落分隔符）**
- 场景：外部串含 U+2028 `evil MIRROR` —— `JSON.stringify` 不转义、筛除类也不含；`sanitizeTerminalText('a b')` 原样返回。终端/下游按行切分者会重流成多行。
- 修复方案（`runtime/sanitize.js:18`）：
```js
.replace(/[\x00-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029\u200b-\u200d\u2060\u061c]/g, '')
```

**F4 【待推进 TODO】⚠️ 同步 `chcp.com` 探测（最高 2000ms）落在时序敏感的渲染路径**
- 场景：Win32 缺失/损坏/不可读 unicode 缓存时，`supportsUnicode()` 在 `renderHUD` 内同步 `execSync('chcp.com',{timeout:2000})`，单次可超 1500ms 预算。
- 修复方案：探测 timeout 压到剩余预算之下（如 ≤500ms），且**不要把超时/错误派生的 `false` 持久化**。

**F1 【待推进 TODO】✅ `renderToolActivity` 未做本地 sanitize 兜底（纵深防御契约缺口）**
- 场景：外部工具名/详情含 ANSI/OSC/Bidi。公开导出的 `renderToolActivity` 内部应做好本地防御。

**F10 【待推进 TODO】✅ 大转录（>256KB）同尺寸原地重写无法察觉**
- 场景：>256KB 转录被同路径/同尺寸原地重写，需增加保守的抽样重扫复核。

**F12 【待推进 TODO】✅ 非-65001 代码页结果重探测机制**
- 注意：既有单元测试依赖 `resetCache()` 作为仅内存清理的测试夹具；若增加磁盘文件清理，建议暴露独立函数 `resetCacheStateFile()` 或在 `--uninstall`/`--setup` 时统一清理，避免打破单测契约。

**F19 【待推进 TODO】⚠️ `doctor.js` 无逐项检查 try/catch 隔离**
- 场景：`runDoctor` 裸调用各 check，任一将来 check 抛错即整体崩溃。包 try/catch 隔离加固。

### 已排除（❌ REFUTED，非缺陷，勿再修）
- **F8**「Line 3 渲染为孤立 `0.00 credits`」→ 验证为**刻意且已被测试固化**的行为（`tests/unit/renderer.diff.test.mjs:61-64`），非缺陷。
- **F15**「uninstall 删除环境派生/递归路径而不验证是 HUD 产物」→ 复现证明：把 `CODEBUDDY_HOME` 指向塞满无关数据的目录后运行 `uninstall()`，**所有无关文件存活**，仅删除精确保留名 `codebuddy-hud-usage-state/...`，安全。

### 关于「已知失败」shim 测试（F14）
- 主 Agent 与对抗验证一致：`buildCmdShimContent` **本身正确**（完整路径调用 `"<path>\shim.cmd" "two words"` → `ARGV=["two words"]`）。
- 失败根因：**测试用裸相对 `.cmd` 名 + node `execSync` 的 `/s /c` 引号纠缠**导致 cmd 报 `not recognized`。**`&` 字符是误导性诊断**。
- 修复（`tests/unit/statusline-installer.test.mjs:242-245`）：改为按宿主方式用**完整引号路径**调用：
```js
const stdout = execSync(
  '"' + shimPath + '" "two words"',           // 完整绝对路径，而非裸相对 basename
  { shell: process.env.ComSpec || 'cmd.exe', encoding: 'utf8', windowsHide: true },
);
assert.equal(stdout, 'two words');
```
- 盲区附注：sanitize 对 **U+200B/200D/200E 零宽、`\x1b[31` 截断残留**（→ `[31` 字面量）不处理——均为低危外观问题，live-probe 同步确认「当前无 CVE」。

---

## 4. 文档与代码差异清单（38 项，列高/权威值项）

**⚠️ HIGH — 实质性错误或与代码相悖：**
1. **README.md:9/321「不发送网络请求」与实际相悖（真伪声明）** — HUD 确实发起 HTTPS（`update-checker.js:11` 拉 `raw.githubusercontent.com/.../package.json` + 24h 后台子进程），且安装脚本本身用 curl/irm。
2. **module-reference §3 THEME_PRESETS 伪造十六进制色** — 文档给 `ocean #00b4d8+#90e0ef, emerald #2ec4b6+#a7c957, cyberpunk #ff007f+#00f0ff…`；代码 `config.js:8-137` **只有 ANSI 颜色名**（`cyan/gray/blue`…），无任何 hex。
3. **module-reference §4 `renderHUD` 声称第 3 个 `overrides?` 参数** — 代码 `renderer.js:16` 只有 `(cbData, config)` 两参；turnCache/toolActivity/sessionCost 均为内部计算，非注入参数。
4. **module-reference §18 `printThemeList` 导出** — `theme-selector.js` 导出的是 `printThemesList`（无参），**没有 `printThemeList`**。
5. **module-reference §20 bootstrap.js 导出** — 文档列 `bootstrap/copyLocalRuntime/downloadRemoteRuntime`；代码 `scripts/bootstrap.js:198` 导出 `{ install, getTargetDir, checkNodeVersion }`（STALE）。
6. **AGENTS.md:20 入口树漏 `--doctor`** — bin 实际支持 `--doctor`/`-d`（`codebuddy-hud.js:132`）。

**MEDIUM — 算法机理与真实不符：**
7. **architecture §5.1 逆向滑窗「16KB~64KB 递增块」** — 代码 `transcript.js:9 DEFAULT_TAIL_BYTES=16384`，块尺寸**固定 16KB 从不增长**；窗口上限 256KB 正确。
8. **architecture §5.1 Prompt-Cache 字段优先级** — 第 3 回退 `cache_read_input_tokens` 从未读到（`transcript.js:171-180`）。
9. **architecture §5.2 `/clear` 状态机「input 掉到初值 1%」** — 代码 `session-stats.js:125-130` 用**绝对阈值** `contextReturnedToInitial`，无 1% 比例判定。
10. **architecture §5.3 checkpoint 状态 schema** — 真实对象（`transcript.js:580-594`）远超 `{offset,credits,inode,size}`：含 `{version:5, path, identity:{dev,ino,birthtimeMs}, …}`。
11. **architecture §5.5 层叠优先级** — 文档 4 层；代码 `config.js:280-302` 合并 **5 层**，缺一层。
12. **module-reference §11 `getGitStatus` 返回值含 `durationMs`** — 代码只返回 `{branch, dirty}`（`git.js:43/82`），从未测量或返回 `durationMs`。
13. **module-reference §2 `extractCostData` 返回 `credits` 字段** — 代码只回 `{totalCostUsd,totalDurationMs,apiDurationMs}`（`parser.js:57-61`），无 `credits`。
14. **module-reference §1 `MAX_STDIN_SIZE` 列为模块级常量** — 实为 `codebuddy-hud.js:166` **stdin `else` 分支内的局部 const**。
15. **README 配置表漏 `language` 实键 / 记死键 `icons`** — `config.js:170` 有真实默认 `language:'en'`；`icons:{}` 为死键（现已从 `runtime/config.js` 及默认配置中彻底清理删除）。

**LOW — 次要遗漏/注释性：** `format.js` 变参签名（§5 计算/徽标参数错位）、`getTurnUsageMetrics/getTurnToolActivity/getSessionUsageMetrics` 的 opts 与返回值（`tailBytes` vs `maxScanBytes`、多返回 field 未记、`selectThemeInteractive` 返回 string 而非 `Promise<void>`）、`lang.js` 零测试、module 索引漏 `model-info.js`、paths 漏 `getCacheStatePath/getCreditStatePath/resolveCodeBuddyPath`、架构双语文档 §7/§9 漂移（中文版 0o600 权限从未实现）、`--theme/-d` 缺测等。

---

## 5. 基准对比分析（源自 agy-hud 的经验辨析与排除）

经过实机与宿主契约深度复核，原审计报告中从 `agy-hud` 机械映射的部分功能在 CodeBuddy 环境下属于**伪需求或过度设计**，现已明确边界并彻底排除：

### ❌ 已排除的非适用项（勿投入开发）
1. **5 小时 / 每周配额限流 SWR 子系统**：CodeBuddy 采用会话 Credits 计费模型，**根本不存在** Claude/Antigravity 的双窗口滚动限额，坚决不引入无关抽象。
2. **HTTP 429 图像配额与深度受限 deepFind 倒计时**：这是 Claude 图像 API 专有结构，CodeBuddy 无此类数据，排除此项复杂扫描。
3. **HUD 自身 `--update` 联网自升级**：HUD 作为宿主管道调用的极简 CLI（≤300ms 退出），不应承担自下载、覆盖本地文件及重建 Windows shim 的高危操作；升级统一走 `git pull` 或官方安装脚本。
4. **多根路径探测 (XDG/AppData) 与原子 0600 权限**：CodeBuddy 官方宿主严格约定使用 `~/.codebuddy` 或环境变量 `CODEBUDDY_HOME`，Windows 下无需复杂的 XDG 规范，杜绝多根探测的过度设计。

### ✔ 保留的唯一有价值工程建议
- **升级 CI 为真实宿主契约门禁与夜间 Canary**：在 GitHub Actions 中增加对 Windows/macOS/Linux 的端到端真实测试（隔离 `CODEBUDDY_HOME`、运行 `--setup`、通过生成的命令实启验证），保障长期跨版本兼容性。

---

## 6. 测试盲区与完备性缺口（审计最后发现，尚未覆盖）

- **盲区（12 项）**：`runtime/lang.js` 零测试；`model-info.getSettingsReasoningEffort` 的 settings.json 分支；entry `--theme`（4 分支全未测）；entry `--doctor/-d` 及其 catch；entry stdin `error` 处理器；stdout **stderr-EPIPE** 守卫（`:25`，注册但从不被触及）；timer-vs-end `handled` 竞态守卫；>1MB stdin 上限分支；真实 fs **TOCTOU / 文件中途被改**（transcript/session-stats 的 fstat+positional readSync）；sanitize 零宽/标签字符；sanitize **C1-CSI/截断残留**；update-checker 并发（一次单 spawn + `--run-check` 测试，未测多进程竞争）。
- **风险（5 项）**：Windows shim 在含 `&` 路径丢参（环境条件性）；**零宽字符可绕过整条 sanitize 管线**；C1-CSI/截断残留留作字面量；入口命令面集成级欠门禁；共享 update-status 文件可被并发 check 子进程覆盖。
- **完备性缺口（10 项，详见 `scripts` 讨论）**：`scripts/bootstrap.js install()` 未审计（原子改名、远端 RUNTIME_FILES 下载、rename-fallback 到 rmSync+copy、tmpDir 失败清理）；`module-reference §3` hex 色伪造致文档漂移未标记；README 隐私声明未调和；**大转录截断上限**（`MAX_TURN_SCAN_LINES=200`/`MAX_TOTAL_BYTES=256KB`/`stopOnUserTurn`）导致长轮次静默少计 cache 徽标、无测试；**非英文 locale 是死代码**（`loadConfig` 硬编码 `DEFAULT_CONFIG.language='en'`，`getI18n` 的 env 探测 zh 永不触发 → 中文系统上 setup/doctor/theme 也渲染英文）；`module-reference §9` 把 `tailBytes` 误记为 `maxScanBytes`；doctor `checkCodeBuddyConfig` 只解析首个带空格 token 使 PATH 相对/未引用的 `node /path` 被误报 invalid；verify-display 从不跑 `--status`/`--doctor`/`--doctor --json`/`>1MB`/非 ASCII，且只断言退出码与行数；0 长度/不关闭 stdin 与 >1MB 溢出走 `handleRender('')` 只在 verify 空 stdin 检查退出码；`Plan.md`/`skills/hud-config/SKILL.md`/`.codebuddy-plugin/plugin.json` 在审计集之外。

---

## 7. 后续行动路线图（Action Plan）

**第一优先（已全部完成 100% DONE · 2026-09-03）**
- [x] **F11**：`runtime/theme-selector.js` 补齐 SIGINT/SIGTERM/SIGHUP 信号处理与 exit 防重入 cleanup，彻底消除 raw-mode 泄漏（P1）。
- [x] **F5**：`runtime/renderer.js` 上下文百分比钳制在 [0, 100]。
- [x] **F6**：`runtime/renderer/format.js` 删除 `str === '1000'` 死代码。
- [x] **F7**：`runtime/renderer.js` 归一化缺失的 display/theme 对象。
- [x] **F13**：`runtime/git.js` 补充 `maxBuffer: 4MB`。
- [x] **F17**：`runtime/update-checker.js` 补齐 SemVer 2.0.0 prerelease 版本解析与比较。
- [x] **F18**：`runtime/bin/codebuddy-hud.js` `--status` 分支移除后台网络派生，纯本地执行。
- [x] **F3**：`runtime/config.js` 补齐 `typeof cwd === 'string'` 守卫。
- [x] **F14**：`tests/unit/statusline-installer.test.mjs` 改用绝对引号路径调用 shim，测试 100% 全绿。
- [x] **补齐单元测试**：`tests/unit/config.test.mjs`、`renderer.layout.test.mjs`、`update-checker.test.mjs`（用例增至 316 个）。
- [x] **独立 Subagent 复核**：派驻独立 Reviewer 复核代码无副作用，通过 316/316 单元测试与 6/6 E2E 校验。

**第二优先（当前最高优先级 · 健壮性与时序防御 · 待推进 TODO）**
- [ ] **F9**（前向扫描预算化 + offset 落盘）：`getSessionUsageMetrics` 设单次扫描 CAP (256KB/512KB)，根治超大 transcript 初次加载延迟。
- [ ] **F16**（更新锁排他化）：`update-checker.js` 改用 `fs.openSync(lockPath, 'wx')`，消除多进程并发写锁 TOCTOU。
- [ ] **F2 + sanitize 零宽字符过滤**：`sanitizeTerminalText` 正则补 `\u2028/29` 行分隔符与零宽族（`\u200b-\u200d\u2060`）；截断改按码点（code points）。
- [ ] **F4**（chcp 探测超时压缩）：压至 ≤500ms 且禁止把超时/失败派生的 `false` 持久化写入磁盘缓存。
- [ ] **F1**（renderToolActivity 本地兜底 sanitize）：为公开导出增加参数防御。
- [ ] **F10**（大文件原地改写保守复核）：同路径、同尺寸、同 mtime 下增设保守抽样复核。
- [ ] **F12**（状态文件清理）：提供独立接口或在 setup/uninstall 中清理缓存，保留既有内存 reset 契约。
- [ ] **F19**（doctor 逐项 try/catch 隔离）：加固每个 check 的异常捕获。

**第三优先（文档与代码真实性对齐 + 测试补盲 · 待推进 TODO）**
- [ ] **README.md 真实性修正**：修正第 9、321 行“不发送网络请求”为“仅发起匿名轻量版本更新检查（24h/次，后台静默），不收集或上传任何代码或会话数据”；补充 `language`，删除无用配置键 `icons`。
- [ ] **module-reference.md 修正**：§3 删伪造 hex 色改真 ANSI 名；§4 改为 2 参 `renderHUD(cbData, config)`；§18 改为 `printThemesList`；§20 改为真实导出 `{ install, getTargetDir, checkNodeVersion }`；§11 删 `durationMs`；§2 删 `credits`；§1 标注 `MAX_STDIN_SIZE` 为局部常量。
- [ ] **architecture.md 修正**：§5.1 改为固定 16KB 块；§5.2 改为绝对阈值；§5.3/5.5 更新 schema 与 5 层层叠。
- [ ] **AGENTS.md 修正**：入口命令树补全 `--doctor/-d`。
- [ ] **测试补盲**：`runtime/lang.js` 补测试；`model-info` settings.json 分支补测；CLI 入口参数异常分支测试；`bootstrap.js install` 测试；多字节 Emoji 截断测试。

**第四优先（工程演进与自动化门禁 · 待推进 TODO）**
- [ ] **【P1】契约门禁 CI 与夜间 Canary**：升级 `verify-display` 为真实安装验证 + GitHub Actions 定时/多平台 E2E 测试。

---

## 8. 交接与当前状态备忘

1. **当前状态**：第一优先（最小充分集）已 100% 修复完毕，`npm test` 316/316 全绿，`npm run verify` 6/6 全绿，`--doctor` 与 `--status` 正常。
2. **独立 Reviewer Subagent 验收结论（2026-09-03）**：
   - 经逐行静态分析与实机推演，本次 7 个核心源码文件与 4 个测试文件的改动精准解决根因，无过度设计与多余抽象（符合 Surgical Changes 与 Simplicity First）。
   - 零 npm 依赖、防 EPIPE/崩溃、纯 CommonJS、<=4 行输出保护、终端防污染等硬约束全部合规，评级为**高质量、可安全合并**。
3. **下阶段核心聚焦建议（Subagent 独立建议，按优先级排序）**：
   - **【P2·高吞吐保障】F9 扫描字节上限控制**：`getSessionUsageMetrics` 设置 256KB/512KB 单次扫描上限，持久化已扫描 offset 分步递增收敛，彻底根治大 transcript 初次加载延迟。
   - **【P2·并发安全】F16 更新检查占位锁排他化**：`update-checker.js` 改用 `fs.openSync(lockPath, 'wx')` 实现原子排他文件锁，消除多进程并发写锁时的 TOCTOU 竞争。
   - **【P2·终端安全】F2 过滤行分隔符与零宽字符**：`sanitizeTerminalText` 正则补齐 `\u2028/29`（行/段落分隔符）与零宽字符族（`\u200b-\u200d\u2060`），防止破坏 <=4 行布局；截断改按码点（code points）以防切断代理对。
   - **【文档真实性】修正 README 网络声明**：明确说明为“仅发起匿名轻量版本更新检查（24h/次，后台静默），不收集或上传任何代码或会话数据”，消除发布事故隐患。
4. **下一步切入点**：按路线图继续推进**第二优先（上述健壮性加固）**与**第三优先（文档真实性对齐）**。
5. **外部写入限制**：自升级（`--update`）涉及网络下载与文件覆盖，属于不可逆外部写入，实施前需与用户明确确认。


