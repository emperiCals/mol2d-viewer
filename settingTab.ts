import { App, PluginSettingTab, Setting } from "obsidian";
import RDKitPlugin from "./main";

export class RDKitSettingTab extends PluginSettingTab {
    plugin: RDKitPlugin;

    constructor(app: App, plugin: RDKitPlugin) { 
        super(app, plugin); 
        this.plugin = plugin; 
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "RDKit Render Settings" });

        new Setting(containerEl)
            .setName("Container Layout Width")
            .setDesc("Use 'fit-content' or fixed px/% value. / 边框包裹宽度设置。")
            .addText(t => t.setValue(this.plugin.settings.containerWidth).onChange(async v => {
                this.plugin.settings.containerWidth = v;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName("Image Width / 图片宽度")
            .addText(t => t.setValue(this.plugin.settings.imageWidth).onChange(async v => {
                this.plugin.settings.imageWidth = v;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName("Title (Legend) Color / 标题文字颜色")
            .setDesc("Color for the legend text. / 独立设置图片下方标题文字颜色。")
            .addColorPicker(cp => cp.setValue(this.plugin.settings.legendColor).onChange(async v => {
                this.plugin.settings.legendColor = v;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName("Card Background / 卡片背景")
            .addColorPicker(cp => cp.setValue(this.plugin.settings.backgroundColor).onChange(async v => {
                this.plugin.settings.backgroundColor = v;
                await this.plugin.saveSettings();
            }));
            
        new Setting(containerEl)
            .setName("Image Background / 图片背景")
            .addColorPicker(cp => cp.setValue(this.plugin.settings.imageBackgroundColor).onChange(async v => {
                this.plugin.settings.imageBackgroundColor = v;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName("Border Color")
            .addColorPicker(cp => cp.setValue(this.plugin.settings.borderColor).onChange(async v => {
                this.plugin.settings.borderColor = v;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName("Border Width")
            .addText(t => t.setValue(this.plugin.settings.borderWidth).onChange(async v => {
                this.plugin.settings.borderWidth = v;
                await this.plugin.saveSettings();
            }));
            
        new Setting(containerEl)
            .setName("Details Position")
            .addDropdown(d => d
                .addOption("bottom", "Bottom")
                .addOption("side", "Side (Right)")
                .setValue(this.plugin.settings.detailsPosition)
                .onChange(async v => {
                    this.plugin.settings.detailsPosition = v;
                    await this.plugin.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName("Theme")
            .addDropdown(d => d
                .addOption("standard", "Standard")
                .addOption("dark", "Dark")
                .addOption("academic", "Academic")
                .addOption("vivid", "Vivid")
                .setValue(this.plugin.settings.theme)
                .onChange(async v => {
                    this.plugin.settings.theme = v;
                    await this.plugin.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName("Show Details")
            .addToggle(t => t.setValue(this.plugin.settings.showDetails).onChange(async v => {
                this.plugin.settings.showDetails = v;
                await this.plugin.saveSettings();
            }));
        
        // --- 帮助表格区域 ---
        containerEl.createEl("h3", { text: "Keyword Reference Table / 关键词参考表", style: "margin-top: 30px;" });
        const helpDiv = containerEl.createDiv({ cls: "rdkit-settings-help" });
        
        const tableHtml = `
        <table class="rdkit-help-table">
            <thead>
                <tr>
                    <th>Keyword (关键词)</th>
                    <th>Type (类型)</th>
                    <th>Description (说明) / Example</th>
                </tr>
            </thead>
            <tbody>
                <!-- 基础配置 -->
                <tr class="section-header"><td colspan="3">Structure & Text (结构与文本)</td></tr>
                <tr><td>title / header</td><td>string</td><td>(New!) 顶部标题栏文字。title="Reaction SMIRKS"</td></tr>
                <tr><td>legend</td><td>string</td><td>图片下方的标题文字。legend="Aspirin"</td></tr>
                <tr><td>text</td><td>string</td><td>详情面板中显示的 Markdown 文本。text="This is **aspirin**"</td></tr>
                <tr><td>width</td><td>num</td><td>生成图片的宽度 (px)。width=300</td></tr>
                <tr><td>height</td><td>num</td><td>生成图片的高度 (px)。height=200</td></tr>
                
                <!-- 绘图样式 -->
                <tr class="section-header"><td colspan="3">Drawing Style (绘图样式)</td></tr>
                <tr><td>bondLineWidth</td><td>num</td><td>化学键线条粗细。bondLineWidth=2</td></tr>
                <tr><td>scaleBondWidth</td><td>bool</td><td>是否缩放键宽。scaleBondWidth=true</td></tr>
                <tr><td>highlightBondWidthMultiplier</td><td>num</td><td>高亮键的粗细倍率。highlightBondWidthMultiplier=12</td></tr>
                <tr><td>fixedBondLength</td><td>num</td><td>固定键长。fixedBondLength=30</td></tr>
                <tr><td>multipleBondOffset</td><td>num</td><td>多重键的偏移量。multipleBondOffset=0.15</td></tr>
                <tr><td>padding</td><td>num</td><td>图片边缘留白。padding=0.05</td></tr>
                <tr><td>rotate</td><td>num</td><td>旋转分子角度。rotate=45</td></tr>
                <tr><td>addStereoAnnotation</td><td>bool</td><td>显示立体化学标记 (R/S, E/Z)。addStereoAnnotation=true</td></tr>
                <tr><td>atomLabelDeuteriumTritium</td><td>bool</td><td>显示氘/氚同位素标签。</td></tr>
                
                <!-- 颜色控制 -->
                <tr class="section-header"><td colspan="3">Colors (颜色)</td></tr>
                <tr><td>backgroundColour</td><td>color</td><td>背景颜色。backgroundColour="#FFFFFF" or [1,1,1,1]</td></tr>
                <tr><td>highlightColour</td><td>color</td><td>高亮颜色。highlightColour="#FF0000"</td></tr>
                <tr><td>symbolColour</td><td>color</td><td>元素符号颜色。symbolColour="#000000"</td></tr>
                <tr><td>legendColour</td><td>color</td><td>图例文字颜色。legendColour="#333333"</td></tr>
                <tr><td>clearBackground</td><td>bool</td><td>是否清除背景(透明)。clearBackground=true</td></tr>

                <!-- 高亮与原子 -->
                <tr class="section-header"><td colspan="3">Highlights & Indices (高亮与索引)</td></tr>
                <tr><td>atoms / highlight</td><td>list</td><td>高亮的原子索引列表。atoms=[0, 1, 5]</td></tr>
                <tr><td>bonds</td><td>list</td><td>高亮的化学键索引列表。bonds=[2, 4]</td></tr>
                <tr><td>atomLabels</td><td>json</td><td>自定义原子标签。atomLabels={"0": "C1"}</td></tr>
                <tr><td>addAtomIndices</td><td>bool</td><td>显示所有原子索引编号。addAtomIndices=true</td></tr>
                <tr><td>addBondIndices</td><td>bool</td><td>显示所有化学键索引编号。addBondIndices=true</td></tr>
                <tr><td>fillHighlights</td><td>bool</td><td>是否填充高亮区域。fillHighlights=true</td></tr>
                <tr><td>atomHighlightsAreCircles</td><td>bool</td><td>高亮是否为圆形。atomHighlightsAreCircles=true</td></tr>
                
                <!-- 字体与缩放 -->
                <tr class="section-header"><td colspan="3">Fonts & Scales (字体与缩放)</td></tr>
                <tr><td>annotationFontScale</td><td>num</td><td>注释字体缩放。annotationFontScale=0.7</td></tr>
                <tr><td>legendFontSize</td><td>num</td><td>图例字体大小。legendFontSize=20</td></tr>
                <tr><td>minFontSize</td><td>num</td><td>最小字体大小。minFontSize=12</td></tr>
                <tr><td>maxFontSize</td><td>num</td><td>最大字体大小。maxFontSize=30</td></tr>
                <tr><td>fontFile</td><td>string</td><td>字体文件路径 (本地)。</td></tr>
                
                <!-- 预处理 -->
                <tr class="section-header"><td colspan="3">Preprocessing (预处理)</td></tr>
                <tr><td>prepareMolsBeforeDrawing</td><td>bool</td><td>绘图前是否预处理分子(Kekulize等)。</td></tr>
                <tr><td>centreMoleculesBeforeDrawing</td><td>bool</td><td>绘图前是否居中分子。</td></tr>
                <tr><td>explicitMethyl</td><td>bool</td><td>显式画出甲基末端。explicitMethyl=true</td></tr>
                <tr><td>includeRadicals</td><td>bool</td><td>包含自由基。</td></tr>
                <tr><td>dummiesAreAttachments</td><td>bool</td><td>虚原子作为连接点。</td></tr>

                <!-- 特殊功能 -->
                <tr class="section-header"><td colspan="3">Plugin Specific (插件专用)</td></tr>
                <tr><td>details</td><td>bool</td><td>(插件专用) 是否显示属性详情面板。details=false</td></tr>
            </tbody>
        </table>
        `;
        
        helpDiv.innerHTML = tableHtml;
    }
}