import { 
    Plugin, 
    normalizePath, 
    MarkdownPostProcessorContext
} from "obsidian";
import { RDKitPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { RDKitSettingTab } from "./settingTab";
import { RDKitRenderChild } from "./renderChild";

declare global {
    interface Window {
        initRDKitModule?: (opts?: any) => Promise<any>;
        RDKit?: any;
    }
}

export default class RDKitPlugin extends Plugin {
    settings: RDKitPluginSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new RDKitSettingTab(this.app, this));
        
        try {
            const pluginDir = this.manifest.dir;
            const adapter = this.app.vault.adapter;

            const injectRDKit = (fileName: string) => {
                return new Promise((resolve) => {
                    if (window.initRDKitModule) return resolve(window.initRDKitModule);
                    const resourcePath = adapter.getResourcePath(normalizePath(pluginDir + "/" + fileName));
                    const script = document.createElement("script");
                    script.src = resourcePath;
                    script.type = "text/javascript";
                    script.onload = () => resolve(window.initRDKitModule);
                    script.onerror = () => resolve(null);
                    document.head.appendChild(script);
                });
            };

            await injectRDKit("RDKit_minimal.js");

            if (window.initRDKitModule) {
                window.RDKit = await window.initRDKitModule({
                    locateFile: (path: string) => {
                        const wasmPath = normalizePath(pluginDir + "/" + path);
                        return adapter.getResourcePath(wasmPath);
                    }
                });
            }

            // 原有的 smiles 代码块
            this.registerMarkdownCodeBlockProcessor("smiles", (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
                const child = new RDKitRenderChild(el, source, this, ctx.sourcePath, "smiles");
                ctx.addChild(child);
            });

            // 新增的 reaction 代码块
            this.registerMarkdownCodeBlockProcessor("reaction", (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
                const child = new RDKitRenderChild(el, source, this, ctx.sourcePath, "reaction");
                ctx.addChild(child);
            });

            this.registerEvent(this.app.workspace.on("rdkit:update", () => {
                this.app.workspace.trigger("rdkit:refresh-renders");
            }));

        } catch (e) { 
            console.error("RDKit Offline Initialization Failed", e); 
        }
    }

    async loadSettings() { 
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); 
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.app.workspace.trigger("rdkit:update"); 
    }
}