import type { AgySessionManager } from "./sessions";
import type { LanguageModelV3, LanguageModelV3CallOptions, LanguageModelV3GenerateResult, LanguageModelV3StreamResult } from "./types";
export declare class AgyAcpLanguageModel implements LanguageModelV3 {
    readonly modelId: string;
    private readonly sessions;
    readonly specificationVersion: "v3";
    readonly provider = "google-agy";
    readonly supportedUrls: Record<string, RegExp[]>;
    constructor(modelId: string, sessions: AgySessionManager);
    doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult>;
    doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult>;
}
export declare function createAgyAcpSdk(sessions: AgySessionManager): {
    languageModel: (modelId: string) => LanguageModelV3;
};
