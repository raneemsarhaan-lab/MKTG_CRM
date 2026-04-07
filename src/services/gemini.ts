import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { AppState, Task, TaskStatus } from "../types";

const createTaskSchema: FunctionDeclaration = {
  name: "create_task",
  description: "Create a new marketing task",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "The name of the task" },
      type: { type: Type.STRING, description: "The type of task (e.g. LinkedIn post, Email campaign)" },
      owner: { type: Type.STRING, description: "The owner of the task" },
      stakeholders: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of stakeholders" },
      start_date: { type: Type.STRING, description: "Start date in YYYY-MM-DD format" },
      publishing_date: { type: Type.STRING, description: "Optional publishing date in YYYY-MM-DD format" },
      notes: { type: Type.STRING, description: "Optional notes" },
    },
    required: ["name", "type", "owner", "start_date"],
  },
};

const updateTaskStatusSchema: FunctionDeclaration = {
  name: "update_task_status",
  description: "Update the status of an existing task",
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.NUMBER, description: "The ID of the task" },
      status: { type: Type.STRING, enum: ["Not started", "In progress", "Overdue", "Done"], description: "The new status" },
    },
    required: ["id", "status"],
  },
};

const listTasksSchema: FunctionDeclaration = {
  name: "list_tasks",
  description: "List all tasks or filter by status/owner",
  parameters: {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, description: "Filter by status" },
      owner: { type: Type.STRING, description: "Filter by owner" },
    },
  },
};

export const getGeminiResponse = async (
  prompt: string,
  state: AppState,
  onFunctionCall: (name: string, args: any) => Promise<any>
) => {
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const model = "gemini-3.1-pro-preview";

  const chat = genAI.chats.create({
    model,
    config: {
      systemInstruction: `You are Marketing Ops Assistant. You help manage marketing tasks, SLAs, and notifications.
      Current State:
      - Team Members: ${JSON.stringify(state.teamMembers)}
      - Task Types: ${JSON.stringify(state.taskTypes)}
      - Tasks: ${JSON.stringify(state.tasks)}
      - Notification Rules: ${JSON.stringify(state.notificationRules)}
      
      When a user asks to create a task, use the create_task tool.
      When a user asks to update a task, use the update_task_status tool.
      When a user asks for status or briefing, use the list_tasks tool or just answer based on the provided state.
      Always format notifications in the exact blocks specified in the system instructions.
      If a publishing date is provided that is before the SLA due date, warn the user.`,
      tools: [{ functionDeclarations: [createTaskSchema, updateTaskStatusSchema, listTasksSchema] }],
    },
  });

  const result = await chat.sendMessage({ message: prompt });
  const response = result;

  if (response.functionCalls) {
    const results = [];
    for (const call of response.functionCalls) {
      const toolResult = await onFunctionCall(call.name, call.args);
      results.push({
        name: call.name,
        response: toolResult,
      });
    }

    // Send the tool results back to the model
    const finalResult = await chat.sendMessage({
      message: "Here are the results of the tool calls: " + JSON.stringify(results),
    });
    return finalResult.text;
  }

  return response.text;
};
