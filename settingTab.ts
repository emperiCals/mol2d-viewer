import { App, PluginSettingTab, Setting } from "obsidian";
import RDKitPlugin from "./main";
import { t, type TranslationKey } from "./i18n";

export class RDKitSettingTab extends PluginSettingTab {
    plugin: RDKitPlugin;

    constructor(app: App, plugin: RDKitPlugin) { 
        super(app, plugin); 
        this.plugin = plugin; 
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: t("settings.title") });

        new Setting(containerEl)
            .setName(t("settings.containerWidth.name"))
            .setDesc(t("settings.containerWidth.desc"))
            .addText(t => t.setValue(this.plugin.settings.containerWidth).onChange(async v => {
                this.plugin.settings.containerWidth = v;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName(t("settings.imageWidth.name"))
            .addText(t => t.setValue(this.plugin.settings.imageWidth).onChange(async v => {
                this.plugin.settings.imageWidth = v;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName(t("settings.legendColor.name"))
            .setDesc(t("settings.legendColor.desc"))
            .addColorPicker(cp => cp.setValue(this.plugin.settings.legendColor).onChange(async v => {
                this.plugin.settings.legendColor = v;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName(t("settings.cardBackground.name"))
            .addColorPicker(cp => cp.setValue(this.plugin.settings.backgroundColor).onChange(async v => {
                this.plugin.settings.backgroundColor = v;
                await this.plugin.saveSettings();
            }));
            
        new Setting(containerEl)
            .setName(t("settings.imageBackground.name"))
            .addColorPicker(cp => cp.setValue(this.plugin.settings.imageBackgroundColor).onChange(async v => {
                this.plugin.settings.imageBackgroundColor = v;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName(t("settings.borderColor.name"))
            .addColorPicker(cp => cp.setValue(this.plugin.settings.borderColor).onChange(async v => {
                this.plugin.settings.borderColor = v;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName(t("settings.borderWidth.name"))
            .addText(t => t.setValue(this.plugin.settings.borderWidth).onChange(async v => {
                this.plugin.settings.borderWidth = v;
                await this.plugin.saveSettings();
            }));
            
        new Setting(containerEl)
            .setName(t("settings.detailsPosition.name"))
            .addDropdown(d => d
                .addOption("bottom", t("settings.detailsPosition.options.bottom"))
                .addOption("side", t("settings.detailsPosition.options.side"))
                .setValue(this.plugin.settings.detailsPosition)
                .onChange(async v => {
                    this.plugin.settings.detailsPosition = v;
                    await this.plugin.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName(t("settings.theme.name"))
            .addDropdown(d => d
                .addOption("standard", t("settings.theme.options.standard"))
                .addOption("dark", t("settings.theme.options.dark"))
                .addOption("academic", t("settings.theme.options.academic"))
                .addOption("vivid", t("settings.theme.options.vivid"))
                .setValue(this.plugin.settings.theme)
                .onChange(async v => {
                    this.plugin.settings.theme = v;
                    await this.plugin.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName(t("settings.showDetails.name"))
            .addToggle(t => t.setValue(this.plugin.settings.showDetails).onChange(async v => {
                this.plugin.settings.showDetails = v;
                await this.plugin.saveSettings();
            }));
        
        // --- 帮助表格区域 ---
        containerEl.createEl("h3", { text: t("settings.help.heading"), style: "margin-top: 30px;" });
        const helpDiv = containerEl.createDiv({ cls: "rdkit-settings-help" });

        // [关键词, 类型, 文案 key]；说明文字统一抽取至 i18n/locales
        const sections: Array<{ key: TranslationKey; rows: Array<[string, string, TranslationKey]> }> = [
            { key: "settings.help.sections.structure", rows: [
                ["title / header", "string", "settings.help.rows.title"],
                ["legend", "string", "settings.help.rows.legend"],
                ["text", "string", "settings.help.rows.text"],
                ["width", "num", "settings.help.rows.width"],
                ["height", "num", "settings.help.rows.height"],
            ]},
            { key: "settings.help.sections.drawing", rows: [
                ["bondLineWidth", "num", "settings.help.rows.bondLineWidth"],
                ["scaleBondWidth", "bool", "settings.help.rows.scaleBondWidth"],
                ["highlightBondWidthMultiplier", "num", "settings.help.rows.highlightBondWidthMultiplier"],
                ["fixedBondLength", "num", "settings.help.rows.fixedBondLength"],
                ["multipleBondOffset", "num", "settings.help.rows.multipleBondOffset"],
                ["padding", "num", "settings.help.rows.padding"],
                ["rotate", "num", "settings.help.rows.rotate"],
                ["addStereoAnnotation", "bool", "settings.help.rows.addStereoAnnotation"],
                ["atomLabelDeuteriumTritium", "bool", "settings.help.rows.atomLabelDeuteriumTritium"],
            ]},
            { key: "settings.help.sections.colors", rows: [
                ["backgroundColour", "color", "settings.help.rows.backgroundColour"],
                ["highlightColour", "color", "settings.help.rows.highlightColour"],
                ["symbolColour", "color", "settings.help.rows.symbolColour"],
                ["legendColour", "color", "settings.help.rows.legendColour"],
                ["clearBackground", "bool", "settings.help.rows.clearBackground"],
            ]},
            { key: "settings.help.sections.highlights", rows: [
                ["atoms / highlight", "list", "settings.help.rows.atoms"],
                ["bonds", "list", "settings.help.rows.bonds"],
                ["atomLabels", "json", "settings.help.rows.atomLabels"],
                ["addAtomIndices", "bool", "settings.help.rows.addAtomIndices"],
                ["addBondIndices", "bool", "settings.help.rows.addBondIndices"],
                ["fillHighlights", "bool", "settings.help.rows.fillHighlights"],
                ["atomHighlightsAreCircles", "bool", "settings.help.rows.atomHighlightsAreCircles"],
            ]},
            { key: "settings.help.sections.fonts", rows: [
                ["annotationFontScale", "num", "settings.help.rows.annotationFontScale"],
                ["legendFontSize", "num", "settings.help.rows.legendFontSize"],
                ["minFontSize", "num", "settings.help.rows.minFontSize"],
                ["maxFontSize", "num", "settings.help.rows.maxFontSize"],
                ["fontFile", "string", "settings.help.rows.fontFile"],
            ]},
            { key: "settings.help.sections.preprocessing", rows: [
                ["prepareMolsBeforeDrawing", "bool", "settings.help.rows.prepareMolsBeforeDrawing"],
                ["centreMoleculesBeforeDrawing", "bool", "settings.help.rows.centreMoleculesBeforeDrawing"],
                ["explicitMethyl", "bool", "settings.help.rows.explicitMethyl"],
                ["includeRadicals", "bool", "settings.help.rows.includeRadicals"],
                ["dummiesAreAttachments", "bool", "settings.help.rows.dummiesAreAttachments"],
            ]},
            { key: "settings.help.sections.pluginSpecific", rows: [
                ["details", "bool", "settings.help.rows.details"],
            ]},
        ];

        let tableHtml = `
        <table class="rdkit-help-table">
            <thead>
                <tr>
                    <th>${t("settings.help.colKeyword")}</th>
                    <th>${t("settings.help.colType")}</th>
                    <th>${t("settings.help.colDesc")}</th>
                </tr>
            </thead>
            <tbody>`;
        for (const section of sections) {
            tableHtml += `\n                <tr class="section-header"><td colspan="3">${t(section.key)}</td></tr>`;
            for (const [keyword, type, rowKey] of section.rows) {
                tableHtml += `\n                <tr><td>${keyword}</td><td>${type}</td><td>${t(rowKey)}</td></tr>`;
            }
        }
        tableHtml += `
            </tbody>
        </table>
        `;
        
        helpDiv.innerHTML = tableHtml;
    }
}
