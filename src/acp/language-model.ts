import { AGY_PROVIDER_ID } from "../constants";
import type { AgySessionManager } from "./sessions";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
  SharedV3ProviderMetadata,
  SharedV3Warning,
} from "./types";

export class AgyAcpLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = AGY_PROVIDER_ID;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  constructor(
    readonly modelId: string,
    private readonly sessions: AgySessionManager,
  ) {}

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const stream = this.sessions.createStream(this.modelId, options);
    return {
      stream,
    };
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const { stream } = await this.doStream(options);
    const reader = stream.getReader();

    const content: LanguageModelV3Content[] = [];
    const warnings: SharedV3Warning[] = [];
    const reasoningBuffers = new Map<string, string>();
    const textBuffers = new Map<string, string>();

    let responseMeta: { id?: string; timestamp?: Date; modelId?: string } | undefined;
    let finishReason: LanguageModelV3FinishReason = {
      unified: "stop",
      raw: "end_turn",
    };
    let usage: LanguageModelV3Usage = {
      inputTokens: {
        total: 0,
        noCache: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: {
        total: 0,
        text: 0,
        reasoning: 0,
      },
    };
    let providerMetadata: SharedV3ProviderMetadata | undefined;

    let streamCompleted = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          streamCompleted = true;
          break;
        }

        switch (value.type) {
          case "stream-start":
            warnings.push(...value.warnings);
            break;

          case "response-metadata":
            responseMeta = {
              ...(value.id ? { id: value.id } : {}),
              ...(value.timestamp ? { timestamp: value.timestamp } : {}),
              ...(value.modelId ? { modelId: value.modelId } : {}),
            };
            break;

          case "reasoning-start":
            reasoningBuffers.set(value.id, "");
            break;

          case "reasoning-delta":
            reasoningBuffers.set(
              value.id,
              (reasoningBuffers.get(value.id) ?? "") + value.delta,
            );
            break;

          case "reasoning-end": {
            const text = reasoningBuffers.get(value.id) ?? "";
            reasoningBuffers.delete(value.id);
            if (text) {
              content.push({
                type: "reasoning",
                text,
                ...(value.providerMetadata ? { providerMetadata: value.providerMetadata } : {}),
              });
            }
            break;
          }

          case "text-start":
            textBuffers.set(value.id, "");
            break;

          case "text-delta":
            textBuffers.set(
              value.id,
              (textBuffers.get(value.id) ?? "") + value.delta,
            );
            break;

          case "text-end": {
            const text = textBuffers.get(value.id) ?? "";
            textBuffers.delete(value.id);
            if (text) {
              content.push({
                type: "text",
                text,
                ...(value.providerMetadata ? { providerMetadata: value.providerMetadata } : {}),
              });
            }
            break;
          }

          case "tool-call":
            content.push({
              type: "tool-call",
              toolCallId: value.toolCallId,
              toolName: value.toolName,
              input: value.input,
              ...(value.providerExecuted !== undefined
                ? { providerExecuted: value.providerExecuted }
                : {}),
              ...(value.dynamic !== undefined ? { dynamic: value.dynamic } : {}),
              ...(value.providerMetadata ? { providerMetadata: value.providerMetadata } : {}),
            });
            break;

          case "tool-result":
            content.push({
              type: "tool-result",
              toolCallId: value.toolCallId,
              toolName: value.toolName,
              result: value.result,
              ...(value.isError !== undefined ? { isError: value.isError } : {}),
              ...(value.preliminary !== undefined ? { preliminary: value.preliminary } : {}),
              ...(value.dynamic !== undefined ? { dynamic: value.dynamic } : {}),
              ...(value.providerMetadata ? { providerMetadata: value.providerMetadata } : {}),
            });
            break;

          case "finish":
            finishReason = value.finishReason;
            usage = value.usage;
            if (value.providerMetadata) {
              providerMetadata = value.providerMetadata;
            }
            break;

          case "error":
            throw value.error instanceof Error
              ? value.error
              : new Error(String(value.error));

          default:
            break;
        }
      }
    } finally {
      if (!streamCompleted) {
        await reader.cancel().catch(() => {});
      }
      reader.releaseLock();
    }

    for (const leftover of reasoningBuffers.values()) {
      if (leftover) content.push({ type: "reasoning", text: leftover });
    }
    for (const leftover of textBuffers.values()) {
      if (leftover) content.push({ type: "text", text: leftover });
    }

    return {
      content,
      finishReason,
      usage,
      ...(providerMetadata ? { providerMetadata } : {}),
      ...(responseMeta ? { response: responseMeta } : {}),
      warnings,
    };
  }
}

export function createAgyAcpSdk(sessions: AgySessionManager): {
  languageModel: (modelId: string) => LanguageModelV3;
} {
  return {
    languageModel(modelId: string): LanguageModelV3 {
      return new AgyAcpLanguageModel(modelId, sessions);
    },
  };
}
