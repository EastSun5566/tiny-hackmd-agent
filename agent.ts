import { assert } from "@std/assert";
import { Anthropic } from "npm:@anthropic-ai/sdk";
import { API } from "npm:@hackmd/api";

interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: unknown | null;
    required?: Array<string> | null;
  };
  call(input: unknown): Promise<string>;
}
function createTools(apiToken: string): Tool[] {
  const api = new API(apiToken);
  return [
    {
      name: "list_notes",
      description: "List all notes",
      input_schema: {
        type: "object",
        properties: {},
      },
      async call() {
        const notes = await api.getNoteList();
        return JSON.stringify(notes);
      },
    },
    {
      name: "get_note",
      description: "Get a note content by ID",
      input_schema: {
        type: "object",
        properties: {
          noteId: {
            type: "string",
            description: "The ID of the note",
          },
        },
        required: ["noteId"],
      },
      async call({ noteId }) {
        const note = await api.getNote(noteId);
        return JSON.stringify(note);
      },
    },
    {
      name: "create_note",
      description: "Create a new note",
      input_schema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the new note",
          },
          content: {
            type: "string",
            description: "The markdown content of the note",
          },
        },
        required: ["title", "content"],
      },
      call: async (options: { title: string; content: string }) => {
        await api.createNote(options);
        return "ok";
      },
    },
    {
      name: "update_note",
      description: "Update an existing note",
      input_schema: {
        type: "object",
        properties: {
          noteId: {
            type: "string",
            description: "The ID of the note to update",
          },
          content: {
            type: "string",
            description: "New markdown content for the note",
          },
        },
        required: ["noteId"],
      },
      async call({ noteId, content }: { noteId: string; content: string }) {
        await api.updateNote(noteId, { content });
        return "ok";
      },
    },
    {
      name: "delete_note",
      description: "Delete a note",
      input_schema: {
        type: "object",
        properties: {
          noteId: {
            type: "string",
            description: "The ID of the note to delete",
          },
        },
        required: ["noteId"],
      },
      async call({ noteId }: { noteId: string }) {
        await api.deleteNote(noteId);
        return "ok";
      },
    },
  ];
}

async function runAgent(ai: Anthropic, tools: Tool[] = []) {
  const conversation: Anthropic.MessageParam[] = [];
  console.log("Chat with HackMD Agent (ctrl-c to quit)");

  let readInput = true;
  while (true) {
    if (readInput) {
      const input = prompt("😂: ");
      if (!input) break;

      conversation.push({ role: "user", content: input });
    }

    const message = await ai.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      messages: conversation,
      tools,
    });
    conversation.push({ role: "assistant", content: message.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const content of message.content) {
      if (content.type === "text") {
        console.log(`🤖: ${content.text}`);
      }

      if (content.type === "tool_use") {
        const tool = tools.find(({ name }) => name === content.name);
        console.log(`🔧 Using: ${content.name}`);

        const result = tool
          ? await tool.call(content.input).catch(console.error)
          : "tool not found";
        toolResults.push({
          type: "tool_result",
          tool_use_id: content.id,
          content: result || "error",
          is_error: !result,
        });

        console.log(`🔧 Result: ${result}`);
      }
    }

    if (toolResults.length === 0) {
      readInput = true;
      continue;
    }

    conversation.push({ role: "user", content: toolResults });
    readInput = false;
  }
}

async function main() {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const apiToken = Deno.env.get("HACKMD_API_TOKEN");

  assert(apiKey, "ANTHROPIC_API_KEY is required");
  assert(apiToken, "HACKMD_API_TOKEN is required");

  const ai = new Anthropic({ apiKey });
  const tools = createTools(apiToken);
  await runAgent(ai, tools);
}

if (import.meta.main) {
  main().catch(console.error);
}
