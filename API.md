# Mol2D Viewer — API 文档

## 插件概述

Mol2D Viewer 是一个 Obsidian 插件，基于 RDKit.js（`RDKit_minimal.js` + WebAssembly，全部本地离线加载）在笔记中渲染 SMILES 分子 2D 结构式与化学反应式，并计算/展示分子描述符（分子量、TPSA、LogP 等约 45 项属性）。

manifest.json 信息：

- `id`: `mol2d-viewer`
- `name`: `Mol2D Viewer`
- `version`: `1.0.0`
- `minAppVersion`: `0.15.0`
- `description`: 使用 RDKit.js 渲染 SMILES 分子式并计算分子属性
- `author`: `yzh-362`
- `isDesktopOnly`: `false`（桌面/移动端均可用）
- `main`: `main.js`

## 主插件类生命周期

`RDKitPlugin`（`main.ts`，继承 `Plugin`）：

### `onload()`

1. `loadSettings()` 加载设置，注册 `RDKitSettingTab` 设置页。
2. 通过动态 `<script>` 标签从插件目录注入 `RDKit_minimal.js`（若 `window.initRDKitModule` 已存在则复用），随后调用 `window.initRDKitModule({ locateFile })` 初始化 WASM，结果存入 `window.RDKit`。`locateFile` 通过 vault adapter 的 `getResourcePath` 解析插件目录内的 `.wasm` 文件。
3. 注册两个 Markdown 代码块处理器：
   - `smiles`：渲染单分子、分子列表或反应式（三种模式自动判别）。
   - `reaction`：反应式专用模式，支持 `@keyword=` 全局配置行与 `->` 箭头行。
   每个处理器创建 `RDKitRenderChild` 并通过 `ctx.addChild()` 托管生命周期。
4. 监听 workspace 事件 `rdkit:update`，转发为 `rdkit:refresh-renders`，通知所有渲染实例重绘。

插件不注册命令（command）和自定义视图（view），仅注册上述代码块处理器与设置页。未显式实现 `onunload()`，依赖 Obsidian 自动清理已注册资源。

### `loadSettings(): Promise<void>`

`this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())`。

### `saveSettings(): Promise<void>`

`saveData(this.settings)` 后触发 `rdkit:update` 事件，使全部已渲染代码块即时刷新。

### 公开属性

- `settings: RDKitPluginSettings` — 当前设置。

### 全局类型扩展（`main.ts` / `renderChild.ts`）

```ts
interface Window {
    initRDKitModule?: (opts?: any) => Promise<any>;
    RDKit?: any;
}
```

## RDKitRenderChild（`renderChild.ts`）

继承 `MarkdownRenderChild`，负责单个代码块的解析与渲染。

### 构造与属性

```ts
constructor(container: HTMLElement, source: string, plugin: RDKitPlugin, sourcePath: string, mode: string = "smiles")
```

- `source: string` — 代码块内容（已 `trim()`）。
- `plugin: RDKitPlugin` — 插件实例引用。
- `sourcePath: string` — 所在笔记路径（用于 `MarkdownRenderer.render`）。
- `mode: string` — `"smiles"` 或 `"reaction"`。

### 生命周期

- `onload()`：调用 `render()`，并监听 `rdkit:refresh-renders` 事件以重绘。

### 解析工具方法

- `findConfigSeparator(line: string): number` — 在忽略方括号/圆括号嵌套的前提下，返回第一个顶层逗号的索引（用于分割 SMILES 与配置串）；无则返回 `-1`。
- `splitByPlus(str: string): string[]` — 按顶层 `+` 分割分子串，忽略 `[Na+]` 等括号内的加号。
- `parseSimpleConfig(configText: string): Record<string, any>` — 解析 `key=value, ...` 形式的配置串（支持引号、行尾 JSON 对象合并），按内置 `typeMap`（bool/num/string/color/list/json）转换类型；特殊键：`details` → `showDetailsOverride`，`highlight` → `atoms`。
- `hexToRgb(hex: string): number[]` — `#RGB`/`#RRGGBB` 转 `[r, g, b, 1]`（0–1 浮点）。
- `toSubscript(numStr: string): string` — 数字转 Unicode 下标字符（修复 SVG 中 `:2` 之类的电荷/同位素标注显示）。

### 渲染方法

- `getThemeOptions(): any` — 依据 `settings.theme`（standard/dark/academic/vivid）与 Obsidian 明暗模式生成 RDKit 绘图基础选项。
- `getMolData(smiles: string, themeOpts: any, drawOpts: any): any` — 生成单分子 SVG（去除固定宽高与白色背景矩形、修复下标）与描述符 JSON；返回 `{ smiles, svg, descriptors }` 或 `null`。
- `mergeSequence(items: any[], defaultLegendColor: string): string` — 将多个分子 SVG 与 `+` / `>>` / `->` 操作符水平合并为一张 SVG，自动布局、垂直居中，支持每个分子下方的 legend 文字。
- `render(): Promise<void>` — 入口。`reaction` 模式走 `renderReactionBlockMode`；`smiles` 模式检测是否存在独立 `+`/`>>` 行，分别走 `renderMultiLineMode` 或 `renderStandardMode`。
- `renderReactionBlockMode(lines: string[]): Promise<void>` — reaction 模式：首行可为 `@keyword=`/`@keywords=` 全局配置；其余行中 `+`、`->`、`>>` 为操作符，其他为 `SMILES, 局部配置`。
- `renderMultiLineMode(lines: string[]): Promise<void>` — smiles 多行模式：首行可为全局配置，其余同上。
- `renderStandardMode(lines: string[]): Promise<void>` — smiles 标准模式：每行一个分子（或含 `>>` 的单行反应式），各自独立成卡片。
- `renderReactionSequence(wrapper: HTMLElement, sequence: any[], globalOpts: any): Promise<void>` — 反应序列核心渲染流：三段式卡片（标题栏 / 合并 SVG / 可折叠详情面板），收集箭头前后分子的描述符分别归入反应物/产物。
- `renderSingleMolecule(wrapper: HTMLElement, smilesStr: string, drawOpts: any, isMultiMol: boolean): Promise<void>` — 单分子卡片渲染流：三段式（标题 / SVG / 属性详情），支持 `detailsPosition` 侧栏布局与移动端自适应。
- `createDetailsPanel(wrapper: HTMLElement, customText: string, rData: any[], pData: any[]): void` — 生成 "Show/Hide Reaction Details" 折叠面板；`customText` 以 Markdown 渲染。
- `renderDescriptorsFromObj(container: HTMLElement, descriptors: any, title: string): void` — 将 RDKit 描述符按六个分类（基础属性、药效/亲脂性、氢键、计数、环系统、立体拓扑）渲染为可折叠属性列表。

## RDKitSettingTab（`settingTab.ts`）

继承 `PluginSettingTab`。

- `plugin: RDKitPlugin` — 插件实例。
- `display(): void` — 构建设置界面：容器宽度、图片宽度、标题文字颜色、卡片背景、图片背景、边框颜色/宽度、详情位置（bottom/side）、主题（standard/dark/academic/vivid）、是否显示详情；并在底部输出完整的代码块关键词参考表（`rdkit-help-table`）。

## 设置项（`settings.ts`）

`RDKitPluginSettings` 及 `DEFAULT_SETTINGS` 默认值：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `bondColor` | `string` | `"#ffffff"` | 键颜色（预留） |
| `containerWidth` | `string` | `"fit-content"` | 单分子卡片容器宽度 |
| `reactionContainerWidth` | `string` | `"100%"` | 反应式卡片容器宽度 |
| `imageWidth` | `string` | `"300px"` | 图片容器宽度 |
| `imageHeight` | `string` | `"auto"` | SVG 高度 |
| `showDetails` | `boolean` | `true` | 默认是否显示属性详情 |
| `detailsPosition` | `string` | `"bottom"` | 详情位置：`bottom` / `side` |
| `useLocalResourceOnly` | `boolean` | `true` | 仅使用本地资源（预留） |
| `theme` | `string` | `"standard"` | 绘图主题：`standard` / `dark` / `academic` / `vivid` |
| `borderColor` | `string` | `"#cccccc"` | 卡片边框颜色 |
| `borderWidth` | `string` | `"1px"` | 卡片边框宽度 |
| `backgroundColor` | `string` | `"transparent"` | 卡片背景色 |
| `imageBackgroundColor` | `string` | `"transparent"` | 图片区域背景色 |
| `legendColor` | `string` | `"var(--text-normal)"` | 图例/标题文字颜色 |
| `generate3D` | `boolean` | `false` | 3D 生成开关（预留） |
| `reactionImageWidth?` 等可选字段 | — | — | 预留扩展字段 |

## 用户侧用法

### `smiles` 代码块

单分子（逗号后为局部配置）：

````markdown
```smiles
CC(=O)Oc1ccccc1C(=O)O, legend="Aspirin", width=300
```
````

多行列表：每行一个分子，各自成卡片。

多行反应式（独立的 `+`、`>>` 行；首行可为全局配置）：

````markdown
```smiles
width=400, title="Esterification"
CC(=O)O
+
CCO
>>
CC(=O)OCC, legend="Ethyl acetate"
```
````

单行反应式：`CC(=O)O+CCO>>CC(=O)OCC, legend="Reaction"`（括号内 `+` 如 `[Na+]` 会被正确忽略）。

### `reaction` 代码块

首行可用 `@keyword=` 或 `@keywords=` 声明全局配置，`->` 表示箭头：

````markdown
```reaction
@keyword=width=500, text="详见 **实验记录**"
CC(=O)O
+
CCO, legend="EtOH"
->
CC(=O)OCC
```
````

### 配置关键词

支持 RDKit 绘图选项（bool/num/string/color/list/json 自动类型转换），常用：`title`/`header`（顶部标题）、`legend`（图例）、`text`（详情面板 Markdown 文本）、`width`/`height`、`bondLineWidth`、`rotate`、`backgroundColour`/`highlightColour`/`symbolColour`/`legendColour`（`#hex` 或 `[r,g,b,a]`）、`atoms`/`highlight`/`bonds`（高亮索引列表）、`atomLabels`（JSON）、`addAtomIndices`、`addStereoAnnotation`、`details`（插件专用：覆盖详情面板开关）等。完整列表见设置页底部的关键词参考表。
