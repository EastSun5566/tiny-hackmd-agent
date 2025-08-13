import { assertEquals } from "@std/assert";
import { runAgent } from "./agent.ts";
import type { Anthropic } from "npm:@anthropic-ai/sdk";

class MockAi {
  messages = {
    create(params: { messages: Array<{ content: string }> }) {
      const lastMessage = params.messages[params.messages.length - 1];
      const userInput = lastMessage.content;

      if (typeof userInput === "string" && userInput.includes("list")) {
        return {
          content: [{
            type: "tool_use",
            id: "tool_123",
            name: "list_notes",
            input: {},
          }],
        };
      }
      if (typeof userInput === "string" && userInput.includes("create")) {
        return {
          content: [{
            type: "tool_use",
            id: "tool_456",
            name: "create_note",
            input: { title: "New Note", content: "# New Content" },
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: "I can help you with HackMD notes.",
        }],
      };
    },
  };
}

Deno.test("runAgent should handle tool execution", async () => {
  const mockAI = new MockAi() as unknown as Anthropic;
  const testTools = [
    {
      name: "list_notes",
      description: "List notes",
      input_schema: { type: "object" as const, properties: {} },
      call() {
        return Promise.resolve("- Test Note 1\n- Test Note 2");
      },
    },
  ];

  // mock prompt
  let promptCallCount = 0;
  const originalPrompt = globalThis.prompt;
  globalThis.prompt = (_message?: string) => {
    promptCallCount++;
    if (promptCallCount === 1) {
      return "list my notes";
    }
    return null;
  };

  // mock console.log
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.join(" "));
  };

  try {
    await runAgent(mockAI, testTools);

    assertEquals(promptCallCount, 2); // one input + one exit

    const toolUsageLogs = logs.filter((log) => log.includes("🔧 Using:"));
    assertEquals(toolUsageLogs.length, 1);
    assertEquals(toolUsageLogs[0], "🔧 Using: list_notes...");
  } finally {
    globalThis.prompt = originalPrompt;
    console.log = originalLog;
  }
});

Deno.test("runAgent should handle text responses", async () => {
  const mockAI = new MockAi() as unknown as Anthropic;

  let promptCallCount = 0;
  const originalPrompt = globalThis.prompt;
  globalThis.prompt = (_message?: string) => {
    promptCallCount++;
    if (promptCallCount === 1) {
      return "hello";
    }
    return null;
  };

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.join(" "));
  };

  try {
    await runAgent(mockAI, []);

    const textLogs = logs.filter((log) => log.includes("🤖:"));
    assertEquals(textLogs.length, 1);
    assertEquals(textLogs[0], "🤖: I can help you with HackMD notes.");
  } finally {
    globalThis.prompt = originalPrompt;
    console.log = originalLog;
  }
});
