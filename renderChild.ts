import { MarkdownRenderChild, MarkdownRenderer } from "obsidian";
import RDKitPlugin from "./main";
import { t, type TranslationKey } from "./i18n";

declare global {
    interface Window {
        initRDKitModule?: (opts?: any) => Promise<any>;
        RDKit?: any;
    }
}

export class RDKitRenderChild extends MarkdownRenderChild {
    source: string;
    plugin: RDKitPlugin;
    sourcePath: string;
    mode: string;

    constructor(container: HTMLElement, source: string, plugin: RDKitPlugin, sourcePath: string, mode: string = "smiles") {
        super(container);
        this.source = source.trim();
        this.plugin = plugin;
        this.sourcePath = sourcePath;
        this.mode = mode; // 记录渲染模式: 'smiles' 或 'reaction'
    }

    async onload() {
        await this.render();
        this.registerEvent(this.plugin.app.workspace.on("rdkit:refresh-renders", () => this.render()));

        // 面板宽度变化时重新渲染，使 side/bottom 布局随宽度自适应（防抖 + 仅响应宽度变化）
        if (typeof ResizeObserver !== "undefined") {
            let resizeTimer: number | null = null;
            let lastWidth = this.containerEl.clientWidth;
            const resizeObserver = new ResizeObserver(() => {
                const w = this.containerEl.clientWidth;
                if (Math.abs(w - lastWidth) < 8) return;
                lastWidth = w;
                if (resizeTimer !== null) window.clearTimeout(resizeTimer);
                resizeTimer = window.setTimeout(() => {
                    resizeTimer = null;
                    if (this.containerEl.isConnected) this.render();
                }, 150);
            });
            resizeObserver.observe(this.containerEl);
            this.register(() => {
                resizeObserver.disconnect();
                if (resizeTimer !== null) window.clearTimeout(resizeTimer);
            });
        }
    }

    // 智能分割 Config 与 SMILES
    findConfigSeparator(line: string): number {
        let bracketLevel = 0; 
        let parenLevel = 0;   
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '[') bracketLevel++;
            else if (char === ']') bracketLevel--;
            else if (char === '(') parenLevel++;
            else if (char === ')') parenLevel--;
            else if (char === ',' && bracketLevel === 0 && parenLevel === 0) {
                return i;
            }
        }
        return -1;
    }

    // 智能分割分子字符串，识别 '+' 但忽略 [Na+] 这种情况
    splitByPlus(str: string): string[] {
        const parts: string[] = [];
        let bracketLevel = 0;
        let lastIdx = 0;
        for (let i = 0; i < str.length; i++) {
            const c = str[i];
            if (c === '[') bracketLevel++;
            else if (c === ']') bracketLevel--;
            else if (c === '+' && bracketLevel === 0) {
                parts.push(str.substring(lastIdx, i).trim());
                lastIdx = i + 1;
            }
        }
        parts.push(str.substring(lastIdx).trim());
        return parts.filter(p => p);
    }

    parseSimpleConfig(configText: string): Record<string, any> {
        const opts: Record<string, any> = {};
        if (!configText) return opts;
        
        let strToParse = configText;
        // 尝试解析行尾 JSON
        try {
            const jsonStart = configText.indexOf('{');
            if (jsonStart !== -1) {
                const jsonPart = configText.substring(jsonStart);
                const extra = JSON.parse(jsonPart);
                if (typeof extra === 'object' && !Array.isArray(extra)) {
                        Object.assign(opts, extra);
                        strToParse = configText.substring(0, jsonStart).trim();
                }
            }
        } catch(e) {}

        const typeMap: Record<string, string> = {
            "addAtomIndices": "bool", "addBondIndices": "bool", "addStereoAnnotation": "bool",
            "atomHighlightsAreCircles": "bool", "atomLabelDeuteriumTritium": "bool",
            "centreMoleculesBeforeDrawing": "bool", "circleAtoms": "bool", "clearBackground": "bool",
            "continuousHighlight": "bool", "dummiesAreAttachments": "bool", "explicitMethyl": "bool",
            "fillHighlights": "bool", "includeAtomTags": "bool", "includeMetadata": "bool",
            "includeRadicals": "bool", "prepareMolsBeforeDrawing": "bool", "scaleBondWidth": "bool", 
            "scaleHighlightBondWidth": "bool",
            "rotate": "num", "additionalAtomLabelPadding": "num", "annotationFontScale": "num", 
            "bondLineWidth": "num", "fixedBondLength": "num", "fixedScale": "num", 
            "flagCloseContactsDist": "num", "highlightBondWidthMultiplier": "num", 
            "highlightRadius": "num", "legendFontSize": "num", "maxFontSize": "num", 
            "minFontSize": "num", "multipleBondOffset": "num", "padding": "num",
            "width": "num", "height": "num", "offsetx": "num", "offsety": "num",
            "title": "string", "header": "string", "legend": "string", "fontFile": "string", "text": "string", 
            "backgroundColour": "color", "highlightColour": "color", 
            "legendColour": "color", "symbolColour": "color",
            "atoms": "list", "bonds": "list", "highlight": "list", "atomLabels": "json"
        };

        const args: string[] = [];
        let buffer = "";
        let inQuote: string | null = null;
        let bracketDepth = 0;
        
        for (let i = 0; i < strToParse.length; i++) {
            const char = strToParse[i];
            if (inQuote) {
                if (char === inQuote) inQuote = null;
                buffer += char;
            } else {
                if (char === '"' || char === "'") {
                    inQuote = char;
                    buffer += char;
                } else if (char === '[' || char === '{' || char === '(') {
                    bracketDepth++;
                    buffer += char;
                } else if (char === ']' || char === '}' || char === ')') {
                    bracketDepth--;
                    buffer += char;
                } else if (char === ',' && bracketDepth === 0) {
                    args.push(buffer.trim());
                    buffer = "";
                } else {
                    buffer += char;
                }
            }
        }
        if (buffer.trim()) args.push(buffer.trim());

        for (const arg of args) {
            if (!arg) continue;
            const eqIdx = arg.indexOf('=');
            let key: string, val: string;
            if (eqIdx !== -1) {
                key = arg.substring(0, eqIdx).trim();
                val = arg.substring(eqIdx + 1).trim();
            } else {
                key = arg.trim();
                val = "true";
            }
            if (key === "details") { opts.showDetailsOverride = (val.toLowerCase() === "true"); continue; }
            if (key === "highlight") key = "atoms";
            key = key.replace(/^["']|["']$/g, "");
            const type = typeMap[key];
            
            if (type === "bool") opts[key] = (val.toLowerCase() === "true");
            else if (type === "num") { const n = parseFloat(val); if (!isNaN(n)) opts[key] = n; }
            else if (type === "string") opts[key] = val.replace(/^["']|["']$/g, "");
            else if (type === "color") {
                let cVal = val.replace(/^["']|["']$/g, "");
                if (cVal.startsWith('#')) opts[key] = this.hexToRgb(cVal);
                else { try { if (cVal.startsWith('[')) opts[key] = JSON.parse(cVal); } catch(e) {} }
            } else if (type === "list") {
                try { opts[key] = JSON.parse(val); } catch(e) {
                    const content = val.replace(/^\[|\]$/g, "");
                    if (content.trim() === "") opts[key] = [];
                    else opts[key] = content.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
                }
            } else if (type === "json") { try { opts[key] = JSON.parse(val); } catch(e) {} }
            else {
                if (!isNaN(parseFloat(val)) && isFinite(Number(val))) opts[key] = parseFloat(val);
                else if (val.startsWith('[') || val.startsWith('{')) { try { opts[key] = JSON.parse(val); } catch(e) { opts[key] = val; } }
                else if (val.toLowerCase() === "true" || val.toLowerCase() === "false") opts[key] = (val.toLowerCase() === "true");
                else opts[key] = val.replace(/^["']|["']$/g, "");
            }
        }
        return opts;
    }

    hexToRgb(hex: string): number[] {
        let s = hex.replace('#', '');
        if (s.length === 3) s = s.split('').map(c => c + c).join('');
        const r = parseInt(s.substring(0, 2), 16) / 255;
        const g = parseInt(s.substring(2, 4), 16) / 255;
        const b = parseInt(s.substring(4, 6), 16) / 255;
        return [r, g, b, 1];
    }

    toSubscript(numStr: string): string {
        const subMap: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
        return numStr.split('').map(c => subMap[c] || c).join('');
    }

    getThemeOptions(): any {
        const theme = this.plugin.settings.theme;
        const isDarkMode = document.body.classList.contains("theme-dark");
        const textColor = isDarkMode ? [0.9, 0.9, 0.9, 1] : [0.1, 0.1, 0.1, 1];
        
        let customLegendColor: number[] = textColor as number[];
        if (this.plugin.settings.legendColor.startsWith('#')) {
            customLegendColor = this.hexToRgb(this.plugin.settings.legendColor);
        }

        const base = {
            width: -1,
            height: -1,
            bondLineWidth: 2,
            symbolColour: textColor,
            legendColour: customLegendColor
        };

        switch (theme) {
            case "dark":
                return { ...base, backgroundColour: [0.1, 0.1, 0.1, 1], symbolColour: [1, 1, 1, 1] };
            case "academic":
                return { ...base, bondLineWidth: 1.5, atomLabelFontFace: "serif" };
            case "vivid":
                return { ...base, bondLineWidth: 3, prepareMolsBeforeDrawing: true };
            case "standard":
            default:
                return base;
        }
    }

    // 生成单分子数据
    getMolData(smiles: string, themeOpts: any, drawOpts: any): any {
        const mol = window.RDKit.get_mol(smiles);
        if (!mol) return null;
        try {
            // 合并全局样式和局部样式
            const subOpts = { ...themeOpts, ...drawOpts };
            delete subOpts.legend; // 移除内部图例，由外部控制
            
            let svgHtml = mol.get_svg_with_highlights(JSON.stringify(subOpts));
            
            // 移除固定尺寸，便于合并
            svgHtml = svgHtml.replace(/width=["']\d+(?:\.\d+)?(?:px)?["']/i, "");
            svgHtml = svgHtml.replace(/height=["']\d+(?:\.\d+)?(?:px)?["']/i, "");
            svgHtml = svgHtml.replace(/<rect[^>]*fill:#FFFFFF[^>]*><\/rect>/gi, "");
            
            // 下标修复
            svgHtml = svgHtml.replace(/>([^<]+)</g, (match: string, content: string) => {
                const mappingRegex = /:(\d+)(\s*)$/;
                const parts = content.match(mappingRegex);
                if (parts) {
                    const num = parts[1];
                    const space = parts[2] || "";
                    return `>${content.replace(mappingRegex, this.toSubscript(num) + space)}<`;
                }
                return match;
            });

            const descriptors = mol.get_descriptors();
            return {
                smiles: smiles,
                svg: svgHtml,
                descriptors: descriptors ? JSON.parse(descriptors) : null
            };
        } catch(e) {
            return null;
        } finally {
            mol.delete();
        }
    }

    // 解析操作符行：+ 、 -> 、 >> ，箭头支持 [上方标注][下方标注]（参考 chemfig/alchemist 的箭头条件写法）
    // 标注内允许嵌套方括号（如 SMILES 里的 [Cr]、[Na+]）：->[mol:O=[Cr](=O)(=O)O][加热]
    parseOperatorLine(line: string): { char: string, above?: string, below?: string } | null {
        const m = line.match(/^(\+|->|>>)(.*)$/);
        if (!m) return null;
        const rest = m[2];
        // 其余部分必须全是至多两个 [...] 标注（方括号按嵌套深度配对），否则不是操作符行
        const labels: string[] = [];
        let i = 0;
        while (i < rest.length) {
            if (/\s/.test(rest[i])) { i++; continue; }
            if (rest[i] !== '[') return null;
            let depth = 0, j = i;
            for (; j < rest.length; j++) {
                if (rest[j] === '[') depth++;
                else if (rest[j] === ']' && --depth === 0) { j++; break; }
            }
            if (depth !== 0) return null;
            labels.push(rest.slice(i + 1, j - 1).trim());
            if (labels.length > 2) return null;
            i = j;
        }
        const char = m[1] === '->' ? '>>' : m[1]; // -> 内部统一为 >>
        if (char === '+') return labels.length === 0 ? { char } : null;
        return { char, above: labels[0] || undefined, below: labels[1] || undefined };
    }

    // 标注文本轻量排版：分子式下标（H2SO4 → H₂SO₄）、^ 上标（如 SO4^2- 电荷）、
    // **粗体**、*斜体*、`代码`；整段被 $...$ 包裹时走 LaTeX（MathJax SVG 输出，保持矢量）
    parseLabelRuns(text: string): Array<{ text: string; bold?: boolean; italic?: boolean; code?: boolean; shift?: "sub" | "sup" }> {
        const runs: Array<any> = [];
        // 化学排版：^xxx → 上标；字母/括号后的数字 → 下标
        const pushChem = (chunk: string, style: any) => {
            const chemRegex = /\^([-+0-9A-Za-z.]+)|([A-Za-z)\]])(\d+(?:\.\d+)?)/g;
            let l = 0;
            let m: RegExpExecArray | null;
            while ((m = chemRegex.exec(chunk)) !== null) {
                if (m.index > l) runs.push({ ...style, text: chunk.slice(l, m.index) });
                if (m[1] !== undefined) {
                    runs.push({ ...style, text: m[1], shift: "sup" });
                } else {
                    runs.push({ ...style, text: m[2] });
                    runs.push({ ...style, text: m[3], shift: "sub" });
                }
                l = m.index + m[0].length;
            }
            if (l < chunk.length) runs.push({ ...style, text: chunk.slice(l) });
        };
        const mdRegex = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
        let last = 0;
        let m: RegExpExecArray | null;
        while ((m = mdRegex.exec(text)) !== null) {
            if (m.index > last) pushChem(text.slice(last, m.index), {});
            if (m[1] !== undefined) pushChem(m[1], { bold: true });
            else if (m[2] !== undefined) pushChem(m[2], { italic: true });
            else pushChem(m[3], { code: true });
            last = m.index + m[0].length;
        }
        if (last < text.length) pushChem(text.slice(last), {});
        return runs;
    }

    // 内置 mini-TeX 子集排版：$...$ 标注不依赖 MathJax 也能正确渲染。
    // 支持希腊字母（\Delta→Δ）、\mathrm/\text/\mathbf/\mathit 分组、^/_ 上下标（含 {} 分组）、
    // 常用符号（\circ→°、\times、\to 等）与间距命令（\, \; \:）。反应条件标注（温度、催化剂、Δ）全覆盖。
    parseTexRuns(tex: string): Array<{ text: string; bold?: boolean; italic?: boolean; shift?: "sub" | "sup" }> {
        const GREEK: Record<string, string> = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω" };
        const SYMBOLS: Record<string, string> = { circ: "°", times: "×", cdot: "·", pm: "±", to: "→", rightarrow: "→", leftarrow: "←", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", approx: "≈", infty: "∞", ",": " ", ";": " ", ":": " ", "!": "", " ": " " };
        const runs: Array<any> = [];
        let i = 0;
        const n = tex.length;
        let style: any = {};
        const push = (text: string, extra: any = {}) => { if (text) runs.push({ ...style, ...extra, text }); };
        const readAtom = (): void => {
            if (i >= n) return;
            const c = tex[i];
            if (c === "{") { i++; parseUntil("}"); return; }
            if (c === "\\") { readCommand(); return; }
            push(c); i++;
        };
        const readCommand = (): void => {
            i++; // 跳过 '\'
            let name = "";
            while (i < n && /[A-Za-z]/.test(tex[i])) name += tex[i++];
            if (!name && i < n) { // \+单字符：\, \{ \_ 等
                const ch = tex[i++];
                push(ch in SYMBOLS ? SYMBOLS[ch] : ch);
                return;
            }
            if (name in GREEK) { push(GREEK[name]); return; }
            if (name in SYMBOLS) { push(SYMBOLS[name]); return; }
            if (["mathrm", "text", "mathbf", "mathit", "bf", "it", "rm"].includes(name)) {
                const prev = style;
                if (name === "mathbf" || name === "bf") style = { ...style, bold: true };
                else if (name === "mathit" || name === "it") style = { ...style, italic: true };
                if (i < n && tex[i] === "{") { i++; parseUntil("}"); }
                else readAtom();
                style = prev;
                return;
            }
            // 未识别命令：忽略命令本身，后续内容照常排版
        };
        const parseUntil = (end?: string): void => {
            while (i < n) {
                const c = tex[i];
                if (end && c === end) { i++; return; }
                if (c === "^" || c === "_") {
                    const shift = c === "^" ? "sup" : "sub";
                    i++;
                    const before = runs.length;
                    readAtom();
                    for (let k = before; k < runs.length; k++) runs[k] = { ...runs[k], shift };
                    continue;
                }
                if (c === "\\") { readCommand(); continue; }
                if (c === "{") { i++; parseUntil("}"); continue; }
                if (c === "}") { i++; return; }
                if (/\s/.test(c)) { push(" "); i++; continue; }
                push(c); i++;
            }
        };
        parseUntil();
        // 合并相邻同属性 run，避免 tspan 碎片
        const merged: Array<any> = [];
        for (const r of runs) {
            const lastR = merged[merged.length - 1];
            if (lastR && lastR.bold === r.bold && lastR.italic === r.italic && lastR.shift === r.shift) lastR.text += r.text;
            else merged.push(r);
        }
        return merged;
    }

    // 合并 SVG 序列 [ {svg:...}, {type:'operator', char:'+'} ...]
    async mergeSequence(items: any[], defaultLegendColor: string): Promise<string> {
        const parser = new DOMParser();
        const serializer = new XMLSerializer();
        
        // 全局显示缩放：分子、间距、字号同步放大，版面比例不变，反应式不再"字超级小"
        const S = 1.6;

        // RDKit 面板常带大片空白（分子居中、四周留白）：把 viewBox 收紧到内容真实边界，
        // 否则合并后的反应式被空白稀释，分子看起来"几乎是不可见"。返回收紧后的原始宽高。
        const trimSvgDoc = (doc: Document): { w: number, h: number } => {
            try {
                const host = document.createElement("div");
                host.style.cssText = "position:absolute;visibility:hidden;left:-99999px;top:-99999px;";
                document.body.appendChild(host);
                const liveSvg = host.appendChild(doc.documentElement.cloneNode(true)) as SVGSVGElement;
                // 测量克隆里移除背景 rect（RDKit 会画全覆盖面板的底色矩形，会把 getBBox 撑回整个面板）
                liveSvg.querySelectorAll("rect").forEach(r => r.remove());
                if (typeof liveSvg.getBBox === "function") {
                    const bb = liveSvg.getBBox();
                    const m = 4; // 边界外扩，避免笔画贴边
                    if (bb.width > 0 && bb.height > 0) {
                        doc.documentElement.setAttribute("viewBox", `${bb.x - m} ${bb.y - m} ${bb.width + 2 * m} ${bb.height + 2 * m}`);
                        host.remove();
                        return { w: bb.width + 2 * m, h: bb.height + 2 * m };
                    }
                }
                host.remove();
            } catch { /* jsdom 等无布局环境：回退到原始 viewBox */ }
            const vb = doc.documentElement.getAttribute("viewBox");
            if (vb) { const v = vb.split(/[\s,]+/).map(parseFloat); return { w: v[2], h: v[3] }; }
            return { w: 0, h: 0 };
        };

        // 预解析所有 SVG 并计算尺寸（无效分子的 svg 为空，尺寸记 0 兜底，避免 NaN viewBox）
        // 注意：w/h 一律乘以 S 变为显示坐标；分子内容在绘制时用 scale(S) 跟上
        const parsedItems = items.map(item => {
            if (item.type === 'svg') {
                if (!item.svg) return { ...item, doc: null, w: 0, h: 0 };
                const doc = parser.parseFromString(item.svg, "image/svg+xml");
                const { w, h } = trimSvgDoc(doc);
                return { ...item, doc, w: w * S, h: h * S };
            }
            return item; 
        });

        // 布局参数（间距按 S 放大）
        const plusWidth = 30 * S;
        const arrowWidth = 60 * S;
        const gap = 10 * S;
        const legendPadding = 10 * S; // 文字与分子之间的间距

        // 第一遍扫描：分子最大高度（已含 S 缩放）——提前到这里，条件字号由它动态推导
        let maxMolHeight = 40 * S;
        parsedItems.forEach(item => {
            if (item.type === 'svg' && item.h > maxMolHeight) maxMolHeight = item.h;
        });

        // 条件/标注字号不定死：随分子高度动态确定（分子越大标注越大，比例 ~0.28，钳制在 16~30）
        // 小分子反应（如 NaCl 沉淀）标注不再喧宾夺主，大分子反应标注也不会小到看不清
        const arrowLabelFontSize = Math.round(Math.min(30, Math.max(16, maxMolHeight * 0.28)));
        const arrowLabelPad = Math.round(arrowLabelFontSize * 1.5); // 有箭头标注时预留的垂直空间
        // 图例字号同样动态且更收敛（比例 0.2，钳制 13~26）：图例是辅助信息，不应和分子抢视觉权重
        const legendFontSize = Math.round(Math.min(26, Math.max(13, maxMolHeight * 0.2)));

        // 按字符类型估算文本宽度（CJK 全宽、大写/数字 ~0.68em、小写 ~0.55em）
        const estTextWidth = (s: string, fs: number): number => {
            let w = 0;
            for (const ch of s) w += (ch.codePointAt(0) || 0) > 0x2e7f ? fs : /[A-Z0-9]/.test(ch) ? fs * 0.68 : fs * 0.55;
            return w;
        };

        // 估算标注排版后的宽度（CJK 按全宽计，上下标按 0.7 倍字号计）
        const estRunsWidth = (runs: Array<any>): number => {
            let w = 0;
            for (const run of runs) {
                const fs = run.shift ? arrowLabelFontSize * 0.7 : arrowLabelFontSize;
                for (const ch of run.text as string) w += (ch.codePointAt(0) || 0) > 0x2e7f ? fs : fs * 0.55;
            }
            return w;
        };

        // 预处理箭头标注：mol:SMILES 渲染结构式；$...$ 优先 MathJax（tex2svg 矢量，环境可用时），
        // 否则走内置 mini-TeX 子集排版（parseTexRuns，不依赖运行时加载）；其余走 parseLabelRuns 轻量排版
        const pxPerEx = arrowLabelFontSize * 0.5; // MathJax SVG 宽高单位为 ex
        const rxnDrawOpts = { ...this.getThemeOptions(), fixedBondLength: 30 };
        for (const item of parsedItems) {
            if (item.type !== 'operator') continue;
            for (const key of ["above", "below"] as const) {
                const label: string | undefined = item[key];
                if (!label) continue;
                const trimmed = label.trim();
                const molMatch = trimmed.match(/^mol:(.+)$/);
                if (molMatch) {
                    // 箭头上下渲染结构式（chemfig 的试剂排版），同样收紧面板空白
                    const data = this.getMolData(molMatch[1].trim(), rxnDrawOpts, {});
                    if (data && data.svg) {
                        const doc = parser.parseFromString(data.svg, "image/svg+xml");
                        const { w, h } = trimSvgDoc(doc);
                        if (w > 0 && h > 0) {
                            item[key + "Mol"] = { doc, w: w * S, h: h * S };
                            continue;
                        }
                    }
                    item[key] = molMatch[1].trim(); // 渲染失败退化为文字
                    continue;
                }
                const m = trimmed.match(/^\$([\s\S]+)\$$/);
                if (!m) continue;
                const tex = m[1];
                let done = false;
                // 环境里已有可用 MathJax 就用矢量输出；不主动加载（Obsidian 的懒加载形态不稳定，见历史问题）
                const mjNow = (window as any).MathJax;
                if (mjNow && typeof mjNow.tex2svgPromise === "function") {
                    try {
                        const container = await mjNow.tex2svgPromise(tex, { display: false });
                        const svgNode: SVGSVGElement | null = container.querySelector ? container.querySelector("svg") : (container.firstElementChild?.tagName === "svg" ? container.firstElementChild : null);
                        if (svgNode) {
                            const exW = parseFloat(svgNode.getAttribute("width") || "0");
                            const exH = parseFloat(svgNode.getAttribute("height") || "1");
                            item[key + "Latex"] = { node: svgNode, w: exW * pxPerEx, h: exH * pxPerEx };
                            done = true;
                        }
                    } catch (e) { console.warn("[mol2d] tex2svg 失败，转 mini-TeX:", tex, e); }
                }
                if (!done) {
                    const runs = this.parseTexRuns(tex);
                    if (runs.length > 0) {
                        item[key + "Runs"] = runs;
                        done = true;
                    }
                }
                if (!done) item[key] = tex;
            }
        }

        const labelWidthOf = (item: any, key: "above" | "below"): number => {
            const mol = item[key + "Mol"];
            if (mol) return mol.w;
            const lat = item[key + "Latex"];
            if (lat) return lat.w;
            const runs = item[key + "Runs"];
            if (runs) return estRunsWidth(runs);
            return item[key] ? estRunsWidth(this.parseLabelRuns(item[key])) : 0;
        };

        // 统一键长由 fixedBondLength 保证（chemfig/alchemist 观感），
        // H2O 这类小分子本来就应该比大分子小；显示尺寸由 S 统一放大
        let hasLegend = false;
        parsedItems.forEach(item => {
            if (item.type === 'svg') {
                item.effW = item.w;
                item.effH = item.h;
                if (item.legend) hasLegend = true;
            } else if (item.type === 'operator') {
                if (item.char === '>>' || item.char === '->') {
                    // 箭头宽度随标注内容伸长
                    const labelW = Math.max(labelWidthOf(item, "above"), labelWidthOf(item, "below"));
                    item.width = Math.max(arrowWidth, labelW + 16);
                } else {
                    item.width = plusWidth;
                }
            }
        });

        // 上下预留空间随标注实际高度（LaTeX 公式、结构式标注可能更高）
        const labelSpaceOf = (key: "above" | "below"): number => Math.max(0, ...parsedItems
            .filter(i => i.type === 'operator')
            .map(i => {
                if (i[key + "Mol"]) return i[key + "Mol"].h + 8;
                if (i[key + "Latex"]) return i[key + "Latex"].h + 8;
                return (i[key + "Runs"] || i[key]) ? arrowLabelPad : 0;
            }));
        const topPad = labelSpaceOf("above");
        const bottomPad = labelSpaceOf("below");
        const legendArea = hasLegend ? (legendFontSize + legendPadding) : 0;
        const totalHeight = topPad + maxMolHeight + bottomPad + legendArea;

        // 第二遍扫描：总宽
        let totalWidth = 0;
        parsedItems.forEach((item, idx) => {
            if (idx > 0) totalWidth += gap;
            totalWidth += item.type === 'svg' ? item.effW : item.width;
        });

        const masterDoc = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
        const svgRoot = masterDoc.documentElement;
        svgRoot.setAttribute("viewBox", `0 0 ${totalWidth} ${totalHeight}`);
        svgRoot.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        
        let currentX = 0;
        const midY = topPad + maxMolHeight / 2; // 分子垂直居中基准线（箭头、加号对齐到这里）
        const pendingLegends: Array<{ text: string, cx: number, color: string }> = [];

        parsedItems.forEach(item => {
            if (item.type === 'svg' && item.doc) {
                // 1. 绘制分子 SVG（w/h 已是显示坐标，内容用 scale(S) 跟上；统一键长由 fixedBondLength 保证）
                const g = masterDoc.createElementNS("http://www.w3.org/2000/svg", "g");
                const yOff = topPad + (maxMolHeight - item.effH) / 2;
                g.setAttribute("transform", `translate(${currentX}, ${yOff}) scale(${S})`);
                Array.from(item.doc.documentElement.childNodes).forEach(n => g.appendChild(masterDoc.importNode(n, true)));
                svgRoot.appendChild(g);

                // 2. Legend 先收集不绘制：统一在序列绘制完成后做防重叠排布（见 forEach 之后）
                if (item.legend) {
                    pendingLegends.push({
                        text: String(item.legend),
                        cx: currentX + item.effW / 2,
                        color: item.legendColor || defaultLegendColor,
                    });
                }

                currentX += item.effW;
            } else if (item.type === 'operator') {
                const width = item.width;
                const gOp = masterDoc.createElementNS("http://www.w3.org/2000/svg", "g");
                
                const path = masterDoc.createElementNS("http://www.w3.org/2000/svg", "path");
                path.setAttribute("stroke", item.legendColor || defaultLegendColor); // 使用默认颜色或继承
                path.setAttribute("stroke-width", "2");
                path.setAttribute("fill", "none");

                if (item.char === '+') {
                    const size = 8;
                    const cx = currentX + width/2;
                    path.setAttribute("d", `M ${cx} ${midY-size} L ${cx} ${midY+size} M ${cx-size} ${midY} L ${cx+size} ${midY}`);
                } else { // arrow ('>>' or '->')
                    const startX = currentX;
                    const endX = currentX + width;
                    const arrHead = 5;
                    path.setAttribute("d", `M ${startX} ${midY} L ${endX} ${midY} M ${endX - arrHead} ${midY - arrHead} L ${endX} ${midY} L ${endX - arrHead} ${midY + arrHead}`);
                }
                gOp.appendChild(path);

                // 箭头上下标注（反应条件/试剂/溶剂等）：mol: 结构式 > LaTeX(SVG) > mini-TeX runs > 轻量排版文字
                const labelColor = item.legendColor || defaultLegendColor;
                const drawMolLabel = (mol: { doc: Document, w: number, h: number }, y: number) => {
                    // mol.w/h 已含 S 缩放，内容用 scale(S) 跟上
                    const g = masterDoc.createElementNS("http://www.w3.org/2000/svg", "g");
                    g.setAttribute("transform", `translate(${currentX + width / 2 - mol.w / 2}, ${y}) scale(${S})`);
                    Array.from(mol.doc.documentElement.childNodes).forEach(n => g.appendChild(masterDoc.importNode(n, true)));
                    gOp.appendChild(g);
                };
                const drawLatexLabel = (lat: { node: SVGSVGElement, w: number, h: number }, y: number) => {
                    const node = masterDoc.importNode(lat.node, true) as SVGSVGElement;
                    node.setAttribute("x", String(currentX + width / 2 - lat.w / 2));
                    node.setAttribute("y", String(y));
                    node.setAttribute("width", String(lat.w));
                    node.setAttribute("height", String(lat.h));
                    // MathJax 输出用 currentColor 填充
                    node.setAttribute("style", `color: ${labelColor}`);
                    gOp.appendChild(node);
                };
                const drawRunsLabel = (runs: Array<any>, y: number) => {
                    const text = masterDoc.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute("x", String(currentX + width / 2));
                    text.setAttribute("y", String(y));
                    text.setAttribute("text-anchor", "middle");
                    text.setAttribute("font-size", `${arrowLabelFontSize}px`);
                    text.setAttribute("font-family", "sans-serif");
                    text.setAttribute("fill", labelColor);
                    for (const run of runs) {
                        const tspan = masterDoc.createElementNS("http://www.w3.org/2000/svg", "tspan");
                        tspan.textContent = run.text;
                        if (run.bold) tspan.setAttribute("font-weight", "bold");
                        if (run.italic) tspan.setAttribute("font-style", "italic");
                        if (run.code) tspan.setAttribute("font-family", "monospace");
                        if (run.shift) {
                            tspan.setAttribute("baseline-shift", run.shift);
                            tspan.setAttribute("font-size", `${Math.round(arrowLabelFontSize * 0.7)}px`);
                        }
                        text.appendChild(tspan);
                    }
                    gOp.appendChild(text);
                };
                // 上下标（baseline-shift）会超出文本基线：上方标注基线上移 0.7em，下方下移额外的 8px，
                // 保证下标不压箭头线、上标不顶箭头线（垂直空间由 topPad/bottomPad 覆盖，余量足够）
                const aboveTextY = midY - Math.round(arrowLabelFontSize * 0.7);
                const belowTextY = midY + arrowLabelFontSize + 14;
                if (item.aboveMol) drawMolLabel(item.aboveMol, midY - 8 - item.aboveMol.h);
                else if (item.aboveLatex) drawLatexLabel(item.aboveLatex, midY - 8 - item.aboveLatex.h);
                else if (item.aboveRuns) drawRunsLabel(item.aboveRuns, aboveTextY);
                else if (item.above) drawRunsLabel(this.parseLabelRuns(item.above), aboveTextY);
                if (item.belowMol) drawMolLabel(item.belowMol, midY + 6);
                else if (item.belowLatex) drawLatexLabel(item.belowLatex, midY + 6);
                else if (item.belowRuns) drawRunsLabel(item.belowRuns, belowTextY);
                else if (item.below) drawRunsLabel(this.parseLabelRuns(item.below), belowTextY);

                svgRoot.appendChild(gOp);
                currentX += width;
            }
            currentX += gap;
        });

        // Legend 防重叠排布：先钳制到画布内，再多轮分离（相邻图例保持最小间距），最后统一绘制
        if (pendingLegends.length > 0) {
            const minGap = 8;
            const legendY = topPad + maxMolHeight + legendPadding + legendFontSize / 2;
            const entries = pendingLegends.map(l => {
                const w = estTextWidth(l.text, legendFontSize);
                const half = w / 2 + 6; // 6px 安全边距，避免贴画布边缘
                const cx = Math.min(Math.max(l.cx, half), Math.max(half, totalWidth - half));
                return { ...l, half, cx };
            }).sort((a, b) => a.cx - b.cx);
            for (let pass = 0; pass < 4; pass++) {
                for (let i = 1; i < entries.length; i++) {
                    const prev = entries[i - 1], cur = entries[i];
                    const minDist = prev.half + cur.half + minGap;
                    if (cur.cx - prev.cx < minDist) {
                        const mid = (prev.cx + cur.cx) / 2;
                        prev.cx = mid - minDist / 2;
                        cur.cx = mid + minDist / 2;
                    }
                }
                // 分离后重新钳制（可能把图例推回重叠，故多轮迭代）
                for (const e of entries) e.cx = Math.min(Math.max(e.cx, e.half), Math.max(e.half, totalWidth - e.half));
            }
            for (const e of entries) {
                const text = masterDoc.createElementNS("http://www.w3.org/2000/svg", "text");
                text.textContent = e.text;
                text.setAttribute("x", String(e.cx));
                text.setAttribute("y", String(legendY));
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("dominant-baseline", "middle");
                text.setAttribute("font-size", `${legendFontSize}px`);
                text.setAttribute("font-family", "sans-serif");
                text.setAttribute("fill", e.color);
                svgRoot.appendChild(text);
            }
        }

        return serializer.serializeToString(masterDoc);
    }

    async render() {
        this.containerEl.empty();
        this.containerEl.classList.add("rdkit-outer-container");
        
        const lines = this.source.split('\n').filter(line => line.trim() !== "");

        // 优先判断是否为 reaction 专用模式
        if (this.mode === "reaction") {
            await this.renderReactionBlockMode(lines);
        } else {
            // 兼容旧的 smiles 模式
            // 检测是否为多行反应式模式 (包含 + 、 -> 或 >> 独立行，箭头可带 [上][下] 标注)
            const isMultiLineRxn = lines.some(l => this.parseOperatorLine(l.trim()) !== null);
            
            if (isMultiLineRxn) {
                await this.renderMultiLineMode(lines);
            } else {
                await this.renderStandardMode(lines);
            }
        }
    }

    // 模式3：Reaction 专用模式（支持 @keyword= 或 @keywords=, -> 多重箭头）
    async renderReactionBlockMode(lines: string[]) {
        const wrapper = this.containerEl.createDiv({ cls: "rdkit-wrapper" });
        
        let globalOpts: Record<string, any> = {};
        let sequence: any[] = [];
        let startIndex = 0;

        // 1. 检查第一行是否为 @keyword= 或 @keywords=
        if (lines.length > 0) {
            const firstLine = lines[0].trim();
            // 支持单数和复数，兼容性更强
            if (firstLine.startsWith("@keyword=") || firstLine.startsWith("@keywords=")) {
                const eqIdx = firstLine.indexOf('=');
                if (eqIdx !== -1) {
                    const configStr = firstLine.substring(eqIdx + 1).trim();
                    globalOpts = this.parseSimpleConfig(configStr);
                    startIndex = 1; // 跳过配置行
                }
            }
        }

        // 2. 解析剩余行
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            const op = this.parseOperatorLine(line);
            if (op) {
                // 独立的操作符行：+ 或箭头（箭头可带 [上方][下方] 条件标注）
                sequence.push({ type: 'operator', char: op.char, above: op.above, below: op.below });
            } else {
                // 分子行：SMILES, local_opts
                const sepIdx = this.findConfigSeparator(line);
                let smiles, localOptsStr;
                if (sepIdx !== -1) {
                    smiles = line.substring(0, sepIdx).trim();
                    localOptsStr = line.substring(sepIdx + 1).trim();
                } else {
                    smiles = line;
                    localOptsStr = "";
                }
                const localOpts = this.parseSimpleConfig(localOptsStr);
                sequence.push({ type: 'mol', smiles, opts: localOpts });
            }
        }

        await this.renderReactionSequence(wrapper, sequence, globalOpts);
    }

    // 模式1：多行输入模式（支持全局/局部参数）- 兼容旧 smiles 块
    async renderMultiLineMode(lines: string[]) {
        const wrapper = this.containerEl.createDiv({ cls: "rdkit-wrapper" });
        
        let globalOpts: Record<string, any> = {};
        const sequence: any[] = []; 
        
        let startIndex = 0;
        const firstLine = lines[0];
        if (!firstLine.includes('>>') && !firstLine.includes('+') && firstLine.includes('=')) {
            const sepIdx = this.findConfigSeparator(firstLine);
            globalOpts = this.parseSimpleConfig(firstLine);
            if (Object.keys(globalOpts).length > 0) {
                startIndex = 1;
            }
        }

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            const op = this.parseOperatorLine(line);
            if (op) {
                sequence.push({ type: 'operator', char: op.char, above: op.above, below: op.below });
            } else {
                const sepIdx = this.findConfigSeparator(line);
                let smiles, localOptsStr;
                if (sepIdx !== -1) {
                    smiles = line.substring(0, sepIdx).trim();
                    localOptsStr = line.substring(sepIdx + 1).trim();
                } else {
                    smiles = line;
                    localOptsStr = "";
                }
                const localOpts = this.parseSimpleConfig(localOptsStr);
                sequence.push({ type: 'mol', smiles, opts: localOpts });
            }
        }

        await this.renderReactionSequence(wrapper, sequence, globalOpts);
    }

    // 模式2：标准模式（列表或单行反应式）
    async renderStandardMode(lines: string[]) {
        const isMultiMol = lines.length > 1;
        
        for (const line of lines) {
            const wrapper = this.containerEl.createDiv({ cls: "rdkit-wrapper" });
            const sepIdx = this.findConfigSeparator(line);
            let smilesStr, configStr;
            if (sepIdx !== -1) {
                smilesStr = line.substring(0, sepIdx).trim();
                configStr = line.substring(sepIdx + 1).trim();
            } else {
                smilesStr = line.trim();
                configStr = "";
            }
            const drawOpts = this.parseSimpleConfig(configStr); // 这里视为全局配置
            
            if (smilesStr.includes(">>")) {
                const parts = smilesStr.split(">>");
                const lhs = parts[0];
                const rhs = parts[1];
                
                const sequence: any[] = [];
                const rParts = this.splitByPlus(lhs);
                const pParts = this.splitByPlus(rhs);
                
                rParts.forEach((s, i) => {
                    if (i > 0) sequence.push({ type: 'operator', char: '+' });
                    sequence.push({ type: 'mol', smiles: s, opts: {} });
                });
                
                sequence.push({ type: 'operator', char: '>>' });
                
                pParts.forEach((s, i) => {
                    if (i > 0) sequence.push({ type: 'operator', char: '+' });
                    sequence.push({ type: 'mol', smiles: s, opts: {} });
                });
                
                await this.renderReactionSequence(wrapper, sequence, drawOpts);
                
            } else {
                await this.renderSingleMolecule(wrapper, smilesStr, drawOpts, isMultiMol);
            }
        }
    }

    // 核心渲染流：反应式序列
    async renderReactionSequence(wrapper: HTMLElement, sequence: any[], globalOpts: any) {
        if (!window.RDKit) {
            wrapper.createEl("div", { text: t("render.loading"), cls: "rdkit-loading" });
            return;
        }

        // 反应式内所有分子统一键长（chemfig/alchemist 观感），分子大小随真实尺度；
        // 键长 45：在典型卡片宽度下分子本体足够大（30 时反应式整体偏小、观感"超级小"）
        const themeOpts = { ...this.getThemeOptions(), fixedBondLength: 45 };
        
        const parentWidth = this.containerEl.clientWidth > 0 ? this.containerEl.clientWidth : (this.containerEl.parentElement?.clientWidth || 800);
        const isMobile = parentWidth < 500;

        wrapper.classList.toggle("is-mobile", isMobile);
        wrapper.style.setProperty("--rdkit-border", `${this.plugin.settings.borderWidth} solid ${this.plugin.settings.borderColor}`);
        // 背景为空或 transparent 时不设置变量，走 CSS 里的 --background-secondary 兜底
        const cardBg = this.plugin.settings.backgroundColor;
        if (cardBg && cardBg !== "transparent") wrapper.style.setProperty("--rdkit-bg", cardBg);
        
        // 修复：使用独立的 Reaction Container Width 设置
        if (!isMobile) {
            wrapper.style.width = this.plugin.settings.reactionContainerWidth;
        } else {
            wrapper.style.width = "100%";
        }

        // --- 三段式第一段：Title ---
        const headerText = globalOpts.title || globalOpts.header;
        if (headerText) {
            const headerEl = wrapper.createDiv({ cls: "rdkit-card-header" });
            headerEl.innerText = headerText;
        }
        // ---------------------------

        // --- 三段式第二段：Image ---
        const svgContainer = wrapper.createDiv({ cls: "rdkit-img-container" });
        svgContainer.style.setProperty("--rdkit-img-bg", this.plugin.settings.imageBackgroundColor);
        // 反应式填满卡片宽度：viewBox 内部已固定比例（统一键长 + S 缩放 + 动态字号），
        // 显示层整体等比缩放即可，卡片宽则大、窄则小，不滚动不裁切
        svgContainer.style.width = "100%";

        const renderItems: any[] = [];
        const reactantsData: any[] = [];
        const productsData: any[] = [];
        
        let hasArrow = false;

        for (const item of sequence) {
            if (item.type === 'operator') {
                // 如果是 reaction 模式下的 -> (映射为 >>), 或者原本的 >>
                if (item.char === '>>' || item.char === '->') hasArrow = true;
                renderItems.push(item);
            } else {
                // 合并配置：Global < Local
                const mergedOpts = { ...globalOpts, ...item.opts };
                // legend 特殊处理：全局 legend 只渲染一次（SVG 下方的图例盒），
                // 分子的下方图例必须显式写在该分子行上，避免全局 legend 被每个分子重复绘制
                if (item.opts.legend === undefined) delete mergedOpts.legend;
                // 反应式内禁用固定面板宽高：尺寸由统一键长（fixedBondLength）决定，
                // 否则 width=600 这类参数会把每个分子画进 600px 大面板，整个反应式被空白稀释
                delete mergedOpts.width;
                delete mergedOpts.height;
                const data = this.getMolData(item.smiles, themeOpts, mergedOpts);
                
                // 将局部配置的 legend 和 color 传递给 renderItems，供 mergeSequence 使用
                renderItems.push({ 
                    type: 'svg', 
                    svg: data?.svg, 
                    w: 0, h: 0, 
                    legend: mergedOpts.legend,
                    legendColor: mergedOpts.legendColor || mergedOpts.symbolColour || this.plugin.settings.legendColor
                }); 
                
                if (data && data.descriptors) {
                    if (hasArrow) productsData.push({ desc: data.descriptors, label: item.smiles });
                    else reactantsData.push({ desc: data.descriptors, label: item.smiles });
                }
            }
        }

        const mergedSvg = await this.mergeSequence(renderItems, this.plugin.settings.legendColor);
        svgContainer.innerHTML = mergedSvg;

        // SVG 填满容器宽度，viewBox 保持纵横比（height:auto）
        const schemeSvg = svgContainer.querySelector("svg");
        if (schemeSvg) {
            schemeSvg.style.width = "100%";
            schemeSvg.style.height = "auto";
            schemeSvg.style.display = "block";
        }

        if (globalOpts.legend) {
            const legendEl = wrapper.createDiv({ cls: "rdkit-legend-box" });
            legendEl.innerText = globalOpts.legend;
            legendEl.style.color = this.plugin.settings.legendColor;
            legendEl.style.textAlign = "center";
            legendEl.style.marginTop = "8px";
            legendEl.style.fontWeight = "600";
        }
        // ---------------------------

        // --- 三段式第三段：Details Bar ---
        if (globalOpts.text || reactantsData.length > 0 || productsData.length > 0) {
            this.createDetailsPanel(wrapper, globalOpts.text, reactantsData, productsData);
        }
        // ---------------------------
    }

    // 核心渲染流：单分子
    async renderSingleMolecule(wrapper: HTMLElement, smilesStr: string, drawOpts: any, isMultiMol: boolean) {
        if (!window.RDKit) return;
        
        const themeOpts = this.getThemeOptions();
        const finalShowDetails = (drawOpts.showDetailsOverride !== undefined) 
                ? drawOpts.showDetailsOverride 
                : this.plugin.settings.showDetails;
        
        const settingsPos = this.plugin.settings.detailsPosition;
        const effectivePosition = (isMultiMol || finalShowDetails === false) ? "bottom" : settingsPos;
        const isSide = effectivePosition === "side";
        
        const parentWidth = this.containerEl.clientWidth > 0 ? this.containerEl.clientWidth : (this.containerEl.parentElement?.clientWidth || 800);
        const isMobile = parentWidth < 500;
        // side 布局实际放得下才用 side：图片宽度 + 详情最小宽度(200px) + 间距/内边距(~60px)
        const imgPx = parseInt(this.plugin.settings.imageWidth, 10) || 300;
        const sideFits = isSide && !isMobile && parentWidth >= imgPx + 260;

        wrapper.classList.toggle("is-side-layout", sideFits);
        wrapper.classList.toggle("is-mobile", isMobile);
        wrapper.style.setProperty("--rdkit-border", `${this.plugin.settings.borderWidth} solid ${this.plugin.settings.borderColor}`);
        // 背景为空或 transparent 时不设置变量，走 CSS 里的 --background-secondary 兜底
        const cardBg = this.plugin.settings.backgroundColor;
        if (cardBg && cardBg !== "transparent") wrapper.style.setProperty("--rdkit-bg", cardBg);
        if (!isMobile) wrapper.style.width = this.plugin.settings.containerWidth;

        // --- 三段式第一段：Title ---
        const headerText = drawOpts.title || drawOpts.header;
        if (headerText) {
            const headerEl = wrapper.createDiv({ cls: "rdkit-card-header" });
            headerEl.innerText = headerText;
        }
        // ---------------------------

        // --- 三段式第二段：Image ---
        const svgContainer = wrapper.createDiv({ cls: "rdkit-img-container" });
        svgContainer.style.setProperty("--rdkit-img-bg", this.plugin.settings.imageBackgroundColor);
        if (!isMobile) svgContainer.style.width = this.plugin.settings.imageWidth;

        const mol = window.RDKit.get_mol(smilesStr);
        if (mol) {
            try {
                const svgConfig = JSON.stringify({ ...themeOpts, ...drawOpts });
                let svgHtml = mol.get_svg_with_highlights(svgConfig);
                
                if (drawOpts.legend) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = svgHtml;
                    const texts = tempDiv.querySelectorAll('text');
                    texts.forEach(t => {
                        if(t.textContent && t.textContent.includes(drawOpts.legend)) {
                            (t as HTMLElement).style.fill = this.plugin.settings.legendColor;
                        }
                    });
                    svgHtml = tempDiv.innerHTML;
                }
                
                svgContainer.innerHTML = svgHtml;
                const svgEl = svgContainer.querySelector("svg");
                if (svgEl) {
                    svgEl.style.height = this.plugin.settings.imageHeight;
                    const bgRect = svgEl.querySelector('rect[style*="fill:#FFFFFF"]');
                    if (bgRect) { 
                        (bgRect as HTMLElement).style.fill = "transparent"; 
                        (bgRect as HTMLElement).style.fillOpacity = "0"; 
                    }
                }
                
                // ---------------------------

                // --- 三段式第三段：Details Bar ---
                if (finalShowDetails) {
                    const descStr = mol.get_descriptors();
                    const desc = descStr ? JSON.parse(descStr) : null;
                    if (desc) {
                        const detailsWrapper = wrapper.createDiv({ cls: "rdkit-details-wrapper" });
                        detailsWrapper.classList.toggle("details-side", sideFits);
                        if (sideFits) detailsWrapper.style.maxHeight = this.plugin.settings.imageHeight === "auto" ? "300px" : this.plugin.settings.imageHeight;
                        this.renderDescriptorsFromObj(detailsWrapper, desc, t("render.moleculeProperties"));
                    }
                }
                // ---------------------------
            } finally {
                mol.delete();
            }
        } else {
            wrapper.createEl("div", { text: t("render.invalidSmiles", { smiles: smilesStr }), cls: "rdkit-error" });
        }
    }

    createDetailsPanel(wrapper: HTMLElement, customText: string, rData: any[], pData: any[]) {
        const btn = wrapper.createEl("button", { text: t("render.showDetails"), cls: "rdkit-details-btn" });
        // 确保默认是 display:none
        const detailsDiv = wrapper.createDiv({ cls: "rdkit-reaction-details", style: "display:none;" });
        
        btn.onclick = () => {
            const isHidden = detailsDiv.style.display === "none";
            detailsDiv.style.display = isHidden ? "block" : "none";
            btn.innerText = isHidden ? t("render.hideDetails") : t("render.showDetails");
            // 移除了缩放逻辑: wrapper.classList.add("rdkit-is-expanded");
        };

        if (customText) {
            const textEl = detailsDiv.createDiv({ cls: "rdkit-custom-text" });
            MarkdownRenderer.render(this.plugin.app, customText, textEl, this.sourcePath, this);
        }

        const colsContainer = detailsDiv.createDiv({ cls: "rdkit-reaction-cols" });
        
        if (rData.length > 0) {
            const rCol = colsContainer.createDiv({ cls: "rdkit-reaction-col" });
            rCol.createEl("h4", { text: t("render.reactants"), style: "margin: 0 0 10px 0;" });
            rData.forEach((d, i) => {
                this.renderDescriptorsFromObj(rCol, d.desc, d.label || t("render.moleculeN", { index: i + 1 }));
            });
        }
        
        if (pData.length > 0) {
            const pCol = colsContainer.createDiv({ cls: "rdkit-reaction-col" });
            pCol.createEl("h4", { text: t("render.products"), style: "margin: 0 0 10px 0;" });
            pData.forEach((d, i) => {
                this.renderDescriptorsFromObj(pCol, d.desc, d.label || t("render.moleculeN", { index: i + 1 }));
            });
        }
    }

    renderDescriptorsFromObj(container: HTMLElement, descriptors: any, title: string) {
        // ... (保持原有的属性渲染逻辑不变)
        // 属性名与分类名走 i18n（值随界面语言切换）
        const keyMap: Record<string, TranslationKey> = {
            "amw": "descriptors.amw", "exactmw": "descriptors.exactmw", "formula": "descriptors.formula",
            "tpsa": "descriptors.tpsa", "mollogp": "descriptors.mollogp", "molmr": "descriptors.molmr",
            "labuteasa": "descriptors.labuteasa", "crippenclogp": "descriptors.crippenclogp",
            "crippenmr": "descriptors.crippenmr", "numrotatablebonds": "descriptors.numrotatablebonds",
            "numhbd": "descriptors.numhbd", "numhba": "descriptors.numhba", "lipinskihba": "descriptors.lipinskihba",
            "lipinskihbd": "descriptors.lipinskihbd", "numheavyatoms": "descriptors.numheavyatoms",
            "numatoms": "descriptors.numatoms", "numheteroatoms": "descriptors.numheteroatoms",
            "numamidebonds": "descriptors.numamidebonds", "fractioncsp3": "descriptors.fractioncsp3",
            "numrings": "descriptors.numrings", "numaromaticrings": "descriptors.numaromaticrings",
            "numaliphaticrings": "descriptors.numaliphaticrings", "numsaturatedrings": "descriptors.numsaturatedrings",
            "numheterocycles": "descriptors.numheterocycles", "numaromaticheterocycles": "descriptors.numaromaticheterocycles",
            "numsaturatedheterocycles": "descriptors.numsaturatedheterocycles", "numaliphaticheterocycles": "descriptors.numaliphaticheterocycles",
            "numspiroatoms": "descriptors.numspiroatoms", "numbridgeheadatoms": "descriptors.numbridgeheadatoms",
            "numatomstereocenters": "descriptors.numatomstereocenters", "numunspecifiedatomstereocenters": "descriptors.numunspecifiedatomstereocenters",
            "chi0v": "descriptors.chi0v", "chi1v": "descriptors.chi1v", "chi2v": "descriptors.chi2v",
            "chi3v": "descriptors.chi3v", "chi4v": "descriptors.chi4v", "chi0n": "descriptors.chi0n",
            "chi1n": "descriptors.chi1n", "chi2n": "descriptors.chi2n", "chi3n": "descriptors.chi3n",
            "chi4n": "descriptors.chi4n", "hallkieralpha": "descriptors.hallkieralpha",
            "kappa1": "descriptors.kappa1", "kappa2": "descriptors.kappa2", "kappa3": "descriptors.kappa3", "phi": "descriptors.phi"
        };

        const categories: Array<{ nameKey: TranslationKey; open?: boolean; keys: string[] }> = [
            { nameKey: "categories.basic", open: true, keys: ["amw", "exactmw", "formula", "tpsa", "labuteasa"] },
            { nameKey: "categories.drugLike", keys: ["mollogp", "molmr", "crippenclogp", "crippenmr", "fractioncsp3"] },
            { nameKey: "categories.hBonds", keys: ["numhbd", "numhba", "lipinskihba", "lipinskihbd", "numamidebonds"] },
            { nameKey: "categories.counts", keys: ["numatoms", "numheavyatoms", "numheteroatoms", "numspiroatoms", "numbridgeheadatoms"] },
            { nameKey: "categories.rings", keys: ["numrings", "numaromaticrings", "numaliphaticrings", "numsaturatedrings", "numheterocycles", "numaromaticheterocycles"] },
            { nameKey: "categories.topoStereo", keys: ["numatomstereocenters", "numunspecifiedatomstereocenters", "numrotatablebonds", "chi0v", "chi1v", "chi2v", "chi3v", "chi4v", "phi", "hallkieralpha", "kappa1", "kappa2", "kappa3"] }
        ];

        if (title) {
            const h5 = container.createEl("h5", { text: title });
            h5.style.marginTop = "10px";
            h5.style.marginBottom = "5px";
            h5.style.borderBottom = "1px solid var(--background-modifier-border)";
        }

        categories.forEach(cat => {
            const keys = cat.keys;
            let availableKeysInCat = keys.filter(k => descriptors.hasOwnProperty(Object.keys(descriptors).find(dk => dk.toLowerCase() === k.toLowerCase()) || ""));
            
            if (availableKeysInCat.length > 0) {
                const detailsEl = container.createEl("details", { cls: "rdkit-details-cat" });
                if (cat.open) detailsEl.setAttribute("open", "");
                detailsEl.createEl("summary", { text: t(cat.nameKey) });
                const listContainer = detailsEl.createDiv({ cls: "rdkit-prop-list" });
                
                availableKeysInCat.forEach(k => {
                    const realKey = Object.keys(descriptors).find(dk => dk.toLowerCase() === k.toLowerCase()) as string;
                    const val = descriptors[realKey];
                    const descKey = keyMap[k.toLowerCase()];
                    const displayName = descKey ? t(descKey) : realKey;
                    const item = listContainer.createDiv({ cls: "rdkit-prop-item" });
                    item.createEl("strong", { text: displayName });
                    item.createEl("span", { text: (typeof val === 'number') ? val.toFixed(2) : String(val) });
                });
            }
        });
    }
}