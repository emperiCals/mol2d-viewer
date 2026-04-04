export interface RDKitPluginSettings {
    bondColor: string;
    containerWidth: string;
    reactionContainerWidth: string;
    imageWidth: string;
    imageHeight: string;
    showDetails: boolean;
    detailsPosition: string;
    useLocalResourceOnly: boolean;
    theme: string;
    borderColor: string;
    borderWidth: string;
    backgroundColor: string;
    imageBackgroundColor: string;
    legendColor: string;
    generate3D: boolean;
    reactionImageWidth?: string;
    reactionBondLineWidth?: number;
    reactionBackgroundColor?: string;
    width?: string;
    height?: string;
}

export const DEFAULT_SETTINGS: RDKitPluginSettings = {
    bondColor: "#ffffff",
    containerWidth: "fit-content", 
    reactionContainerWidth: "100%", 
    imageWidth: "300px",          
    imageHeight: "auto",          
    showDetails: true,
    detailsPosition: "bottom",
    useLocalResourceOnly: true,
    theme: "standard", 
    borderColor: "#cccccc", 
    borderWidth: "1px", 
    backgroundColor: "transparent", 
    imageBackgroundColor: "transparent", 
    legendColor: "var(--text-normal)", 
    generate3D: false             
};