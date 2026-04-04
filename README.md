Molecule 2D Viewer for Obsidian

中文说明

Molecule 2D Viewer 是一款专为 Obsidian 打造的化学信息学插件。它允许用户在 Markdown 笔记中通过简单的 SMILES 字符串直接渲染高质量的二维化学分子结构图，并实时提供详尽的分子理化性质分析。

核心功能

高性能渲染引擎：集成 RDKit.js 核心库，支持 SMILES 字符串到 SVG 矢量图形的本地快速转换。

物理化学性质计算：自动生成包括精确分子量、TPSA、LogP、氢键供体/受体数、环系统信息等在内的多种分子描述符。

属性分类展示：描述符按基础属性、药效学相关、氢键、环系统等逻辑分类存放，支持折叠与展开。

高度外观定制：

<img width="761" height="1215" alt="image" src="https://github.com/user-attachments/assets/d2108120-fd1b-4dd2-84ad-6100e7fa239e" />


提供标准、深色、学术、鲜艳四种渲染主题。

支持自定义容器的边框颜色、边框宽度以及背景颜色。

支持属性面板相对于分子图的布局位置选择（下方或侧边）。

原生主题适配：完美兼容 Obsidian 的浅色和深色模式，分子图中的原子标签颜色会随主题自动调整。

多分子批量渲染：支持在单个代码块中输入多行 SMILES，自动实现网格化布局展示。

安装步骤

进入 Obsidian 的插件目录：.obsidian/plugins/。

创建名为 mol2d-viewer 的文件夹。

将以下三个核心文件放入该文件夹中：

main.js (插件逻辑)

manifest.json (插件配置)

RDKit_minimal.js (RDKit 引擎库)

在 Obsidian 的“设置 -> 第三方插件”中手动开启插件。

使用指南

在 Markdown 笔记中使用 smiles 代码块标识符。

基础示例

CC(=O)OC1=CC=CC=C1C(=O)O

<img width="528" height="416" alt="image" src="https://github.com/user-attachments/assets/3027f3b4-a19f-4044-9457-ae830855a7e8" />



带参数的高级示例

支持在 SMILES 后添加逗号并跟随配置参数：

``` smiles
CC(=O)Oc1ccccc1C(=O)O,highlight= [0, 1, 10],explicitMethyl,addAtomIndices,legend=aspirin,details=false
```

<img width="592" height="473" alt="image" src="https://github.com/user-attachments/assets/cc5a7b20-2c75-42b2-a08a-544b85383812" />
本协议根据GNU协议进行开源，请按照协议对代码进行使用
English Version

Molecule 2D Viewer is a chemoinformatics plugin developed for Obsidian. It enables users to render high-quality 2D chemical structures directly from SMILES strings and provides comprehensive molecular property analysis within Markdown notes.

Core Features

High-Performance Rendering: Integrates the RDKit.js library for fast, local conversion of SMILES strings to SVG vector graphics.

Physicochemical Property Calculation: Automatically calculates molecular descriptors including Exact Molecular Weight, TPSA, LogP, HBD/HBA counts, 和 ring system information.

Categorized Descriptors: Descriptors are organized into logical categories (Basic, Drug-like, H-Bonds, Rings, etc.) with support for collapsible sections.

Extensive Visual Customization:

Offers four rendering themes: Standard, Dark, Academic, 和 Vivid.

Allows customization of container border color, border width, 和 background color.

Adjustable layout position for the property panel (Bottom or Side).

Native Theme Integration: Fully compatible with Obsidian's light and dark modes. Atom label colors adjust automatically based on the active theme.

Batch Rendering: Supports multiple SMILES strings in a single code block with automatic grid layout.

安装

Locate your Obsidian plugins folder: .obsidian/plugins/.

Create a folder named mol2d-viewer.

Place the following core files into the folder:

main.js

manifest.json

RDKit_minimal.js

Enable the plugin via "Settings -> Community Plugins" in Obsidian.

Usage

Use the smiles code block identifier in your Markdown notes.

Basic Example

CC(=O)OC1=CC=CC=C1C(=O)O

<img width="528" height="416" alt="image" src="https://github.com/user-attachments/assets/3027f3b4-a19f-4044-9457-ae830855a7e8" />

Advanced Example with Parameters

``` smiles
CC(=O)Oc1ccccc1C(=O)O,highlight= [0, 1, 10],explicitMethyl,addAtomIndices,legend=aspirin,details=false
```

<img width="592" height="473" alt="image" src="https://github.com/user-attachments/assets/cc5a7b20-2c75-42b2-a08a-544b85383812" />
