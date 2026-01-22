import { createZhipu } from "zhipu-ai-provider";
import { generateText } from "ai";
import { captureException } from "@auxbot/sentry";
import { env } from "../env.js";

const zhipu = createZhipu({
  baseURL: "https://api.z.ai/api/paas/v4",
  apiKey: env.ZHIPU_API_KEY,
});

export async function generateSummary(messages: string): Promise<string> {
  const systemPrompt =
    "You are a helpful assistant that summarizes Discord conversations. Provide a concise, well-structured summary that captures the main topics, decisions, and action items. Use bullet points for clarity.";

  const userPrompt = `Summarize the following Discord messages:

${messages}`;

  try {
    const result = (await Promise.race([
      generateText({
        model: zhipu("glm-4.7-flash"),
        system: systemPrompt,
        prompt: userPrompt,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AI request timeout")), 30000),
      ),
    ])) as Awaited<ReturnType<typeof generateText>>;

    return result.text;
  } catch (error: any) {
    captureException(error, {
      tags: {
        service: "ai",
        function: "generateSummary",
      },
      extra: {
        messageCount: messages.split("\n").length,
      },
    });
    throw error;
  }
}
