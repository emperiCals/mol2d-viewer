import { MarkdownRenderChild, MarkdownRenderer } from "obsidian";
import RDKitPlugin from "./main";

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

    // 合并 SVG 序列 [ {svg:...}, {type:'operator', char:'+'} ...]
    mergeSequence(items: any[], defaultLegendColor: string): string {
        const parser = new DOMParser();
        const serializer = new XMLSerializer();
        
        // 预解析所有 SVG 并计算尺寸
        const parsedItems = items.map(item => {
            if (item.type === 'svg' && item.svg) {
                const doc = parser.parseFromString(item.svg, "image/svg+xml");
                const vb = doc.documentElement.getAttribute("viewBox");
                let w = 0, h = 0;
                if(vb) { const v = vb.split(/[\s,]+/).map(parseFloat); w = v[2]; h = v[3]; }
                return { ...item, doc, w, h };
            }
            return item; 
        });

        // 布局参数
        const plusWidth = 30;
        const arrowWidth = 60;
        const gap = 10;
        const legendFontSize = 20; 
        const legendPadding = 10; // 文字与分子之间的间距

        let totalWidth = 0;
        let maxMolHeight = 40; // 仅分子的最大高度
        let hasLegend = false;

        // 第一遍扫描：计算总宽和最大分子高
        parsedItems.forEach((item, idx) => {
            if (idx > 0) totalWidth += gap; 
            if (item.type === 'svg') {
                totalWidth += item.w;
                if (item.h > maxMolHeight) maxMolHeight = item.h;
                if (item.legend) hasLegend = true;
            } else if (item.type === 'operator') {
                totalWidth += (item.char === '>>' || item.char === '->' ? arrowWidth : plusWidth);
            }
        });

        // 如果有 legend，增加总高度
        const totalHeight = maxMolHeight + (hasLegend ? (legendFontSize + legendPadding) : 0);

        const masterDoc = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
        const svgRoot = masterDoc.documentElement;
        svgRoot.setAttribute("viewBox", `0 0 ${totalWidth} ${totalHeight}`);
        svgRoot.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        
        let currentX = 0;
        const midY = maxMolHeight / 2; // 分子的垂直居中基准线

        parsedItems.forEach(item => {
            if (item.type === 'svg' && item.doc) {
                // 1. 绘制分子 SVG
                const g = masterDoc.createElementNS("http://www.w3.org/2000/svg", "g");
                const yOff = (maxMolHeight - item.h) / 2; // 在分子高度区域内垂直居中
                g.setAttribute("transform", `translate(${currentX}, ${yOff})`);
                Array.from(item.doc.documentElement.childNodes).forEach(n => g.appendChild(masterDoc.importNode(n, true)));
                svgRoot.appendChild(g);

                // 2. 绘制单一反应物 Legend
                if (item.legend) {
                    const text = masterDoc.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.textContent = item.legend;
                    text.setAttribute("x", String(currentX + item.w / 2)); // 水平居中于分子
                    text.setAttribute("y", String(maxMolHeight + legendPadding + legendFontSize/2)); // 放在分子下方
                    text.setAttribute("text-anchor", "middle");
                    text.setAttribute("dominant-baseline", "middle");
                    text.setAttribute("font-size", `${legendFontSize}px`);
                    text.setAttribute("font-family", "sans-serif");
                    text.setAttribute("fill", item.legendColor || defaultLegendColor);
                    svgRoot.appendChild(text);
                }

                currentX += item.w;
            } else if (item.type === 'operator') {
                const width = (item.char === '>>' || item.char === '->') ? arrowWidth : plusWidth;
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
                svgRoot.appendChild(gOp);
                currentX += width;
            }
            currentX += gap;
        });

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
            // 检测是否为多行反应式模式 (包含 + 或 >> 独立行)
            const isMultiLineRxn = lines.some(l => l.trim() === '+' || l.trim() === '>>');
            
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
            if (line === '->') {
                // 检测到独立的一行 ->，生成箭头
                // 内部使用 >> 符号兼容 mergeSequence 的箭头逻辑
                sequence.push({ type: 'operator', char: '>>' });
            } else if (line === '+') {
                sequence.push({ type: 'operator', char: '+' });
            } else if (line === '>>') {
                // 兼容旧习惯
                sequence.push({ type: 'operator', char: '>>' });
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
            if (line === '+' || line === '>>') {
                sequence.push({ type: 'operator', char: line });
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
            wrapper.createEl("div", { text: "Loading RDKit...", cls: "rdkit-loading" });
            return;
        }

        const themeOpts = this.getThemeOptions();
        
        const parentWidth = this.containerEl.clientWidth > 0 ? this.containerEl.clientWidth : (this.containerEl.parentElement?.clientWidth || 800);
        const isMobile = parentWidth < 500;

        wrapper.classList.toggle("is-mobile", isMobile);
        wrapper.style.setProperty("--rdkit-border", `${this.plugin.settings.borderWidth} solid ${this.plugin.settings.borderColor}`);
        wrapper.style.setProperty("--rdkit-bg", this.plugin.settings.backgroundColor);
        
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
        if (!isMobile) svgContainer.style.width = "100%"; 

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

        const mergedSvg = this.mergeSequence(renderItems, this.plugin.settings.legendColor);
        svgContainer.innerHTML = mergedSvg;

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

        wrapper.classList.toggle("is-side-layout", isSide);
        wrapper.classList.toggle("is-mobile", isMobile);
        wrapper.style.setProperty("--rdkit-border", `${this.plugin.settings.borderWidth} solid ${this.plugin.settings.borderColor}`);
        wrapper.style.setProperty("--rdkit-bg", this.plugin.settings.backgroundColor);
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
                        detailsWrapper.classList.toggle("details-side", isSide && !isMobile);
                        if (isSide && !isMobile) detailsWrapper.style.maxHeight = this.plugin.settings.imageHeight === "auto" ? "300px" : this.plugin.settings.imageHeight;
                        this.renderDescriptorsFromObj(detailsWrapper, desc, "Molecule Properties");
                    }
                }
                // ---------------------------
            } finally {
                mol.delete();
            }
        } else {
            wrapper.createEl("div", { text: `Invalid SMILES: ${smilesStr}`, cls: "rdkit-error" });
        }
    }

    createDetailsPanel(wrapper: HTMLElement, customText: string, rData: any[], pData: any[]) {
        const btn = wrapper.createEl("button", { text: "Show Reaction Details", cls: "rdkit-details-btn" });
        // 确保默认是 display:none
        const detailsDiv = wrapper.createDiv({ cls: "rdkit-reaction-details", style: "display:none;" });
        
        btn.onclick = () => {
            const isHidden = detailsDiv.style.display === "none";
            detailsDiv.style.display = isHidden ? "block" : "none";
            btn.innerText = isHidden ? "Hide Reaction Details" : "Show Reaction Details";
            // 移除了缩放逻辑: wrapper.classList.add("rdkit-is-expanded");
        };

        if (customText) {
            const textEl = detailsDiv.createDiv({ cls: "rdkit-custom-text" });
            MarkdownRenderer.render(this.plugin.app, customText, textEl, this.sourcePath, this);
        }

        const colsContainer = detailsDiv.createDiv({ cls: "rdkit-reaction-cols" });
        
        if (rData.length > 0) {
            const rCol = colsContainer.createDiv({ cls: "rdkit-reaction-col" });
            rCol.createEl("h4", { text: "Reactants / Start (起始)", style: "margin: 0 0 10px 0;" });
            rData.forEach((d, i) => {
                this.renderDescriptorsFromObj(rCol, d.desc, d.label || `Molecule ${i+1}`);
            });
        }
        
        if (pData.length > 0) {
            const pCol = colsContainer.createDiv({ cls: "rdkit-reaction-col" });
            pCol.createEl("h4", { text: "Products / End (产物)", style: "margin: 0 0 10px 0;" });
            pData.forEach((d, i) => {
                this.renderDescriptorsFromObj(pCol, d.desc, d.label || `Molecule ${i+1}`);
            });
        }
    }

    renderDescriptorsFromObj(container: HTMLElement, descriptors: any, title: string) {
        // ... (保持原有的属性渲染逻辑不变)
        const keyMap: Record<string, string> = {
            "amw": "平均分子量 (amw)", "exactmw": "精确分子量 (exactmw)", "formula": "分子式 (formula)",
            "tpsa": "拓扑极性表面积 (tpsa)", "mollogp": "脂水分配系数 (mollogp)", "molmr": "摩尔折射率 (molmr)",
            "labuteasa": "Labute 近似表面积 (labuteASA)", "crippenclogp": "Crippen ClogP (CrippenClogP)",
            "crippenmr": "Crippen 摩尔折射 (CrippenMR)", "numrotatablebonds": "可旋转键数 (NumRotatableBonds)",
            "numhbd": "氢键供体数 (NumHBD)", "numhba": "氢键受体数 (NumHBA)", "lipinskihba": "Lipinski 氢键受体 (lipinskiHBA)",
            "lipinskihbd": "Lipinski 氢键供体 (lipinskiHBD)", "numheavyatoms": "重原子数 (NumHeavyAtoms)",
            "numatoms": "总原子数 (NumAtoms)", "numheteroatoms": "杂原子数 (NumHeteroatoms)",
            "numamidebonds": "酰胺键数 (NumAmideBonds)", "fractioncsp3": "Csp3 分数 (FractionCSP3)",
            "numrings": "环数 (NumRings)", "numaromaticrings": "芳香环数 (NumAromaticRings)",
            "numaliphaticrings": "脂肪环数 (NumAliphaticRings)", "numsaturatedrings": "饱和环数 (NumSaturatedRings)",
            "numheterocycles": "杂环数 (NumHeterocycles)", "numaromaticheterocycles": "芳香杂环数 (NumAromaticHeterocycles)",
            "numsaturatedheterocycles": "饱和杂环数 (NumSaturatedHeterocycles)", "numaliphaticheterocycles": "脂肪杂环数 (NumAliphaticHeterocycles)",
            "numspiroatoms": "螺原子数 (NumSpiroAtoms)", "numbridgeheadatoms": "桥头原子数 (NumBridgeheadAtoms)",
            "numatomstereocenters": "原子立体中心数 (NumAtomStereoCenters)", "numunspecifiedatomstereocenters": "未指定立体中心数 (NumUnspecifiedAtomStereoCenters)",
            "chi0v": "原子价连接性指数 (chi0v)", "chi1v": "一阶价连接性指数 (chi1v)", "chi2v": "二阶价连接性指数 (chi2v)",
            "chi3v": "三阶价连接性指数 (chi3v)", "chi4v": "四阶价连接性指数 (chi4v)", "chi0n": "零阶连接性指数 (chi0n)",
            "chi1n": "一阶连接性指数 (chi1n)", "chi2n": "二阶连接性指数 (chi2n)", "chi3n": "三阶连接性指数 (chi3n)",
            "chi4n": "四阶连接性指数 (chi4n)", "hallkieralpha": "Hall-Kier Alpha 指数 (hallKierAlpha)",
            "kappa1": "Kappa1 指数 (kappa1)", "kappa2": "Kappa2 指数 (kappa2)", "kappa3": "Kappa3 指数 (kappa3)", "phi": "柔性指数 (Phi)"
        };

        const categories: Record<string, string[]> = {
            "基础属性 (Basic)": ["amw", "exactmw", "formula", "tpsa", "labuteasa"],
            "药效/亲脂性 (Drug-like)": ["mollogp", "molmr", "crippenclogp", "crippenmr", "fractioncsp3"],
            "氢键与酰胺键 (H-Bonds and Amide Bonds)": ["numhbd", "numhba", "lipinskihba", "lipinskihbd", "numamidebonds"],
            "计数属性 (Counts)": ["numatoms", "numheavyatoms", "numheteroatoms", "numspiroatoms", "numbridgeheadatoms"],
            "环系统 (Rings)": ["numrings", "numaromaticrings", "numaliphaticrings", "numsaturatedrings", "numheterocycles", "numaromaticheterocycles"],
            "立体与拓扑 (Topo/Stereo)": ["numatomstereocenters", "numunspecifiedatomstereocenters", "numrotatablebonds", "chi0v", "chi1v", "chi2v", "chi3v", "chi4v", "phi", "hallkieralpha", "kappa1", "kappa2", "kappa3"]
        };

        if (title) {
            const h5 = container.createEl("h5", { text: title });
            h5.style.marginTop = "10px";
            h5.style.marginBottom = "5px";
            h5.style.borderBottom = "1px solid var(--background-modifier-border)";
        }

        Object.keys(categories).forEach(catName => {
            const keys = categories[catName];
            let availableKeysInCat = keys.filter(k => descriptors.hasOwnProperty(Object.keys(descriptors).find(dk => dk.toLowerCase() === k.toLowerCase()) || ""));
            
            if (availableKeysInCat.length > 0) {
                const detailsEl = container.createEl("details", { cls: "rdkit-details-cat" });
                if (catName.includes("Basic")) detailsEl.setAttribute("open", "");
                detailsEl.createEl("summary", { text: catName });
                const listContainer = detailsEl.createDiv({ cls: "rdkit-prop-list" });
                
                availableKeysInCat.forEach(k => {
                    const realKey = Object.keys(descriptors).find(dk => dk.toLowerCase() === k.toLowerCase()) as string;
                    const val = descriptors[realKey];
                    const displayName = keyMap[k.toLowerCase()] || realKey;
                    const item = listContainer.createDiv({ cls: "rdkit-prop-item" });
                    item.createEl("strong", { text: displayName });
                    item.createEl("span", { text: (typeof val === 'number') ? val.toFixed(2) : String(val) });
                });
            }
        });
    }
}