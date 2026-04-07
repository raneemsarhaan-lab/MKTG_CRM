# Marketing Ops Assistant - Tool Logic & Architecture

This document outlines the technical logic, architecture, and business rules powering the Marketing Ops Assistant.

---

## 1. Core Architecture
The application is a full-stack React project built for high performance and real-time feel:
*   **Frontend**: React 19 with Vite.
*   **State Management**: **Zustand** (hook-based state manager).
*   **Styling**: **Tailwind CSS 4.0**.
*   **AI Engine**: **Gemini 3.1 Pro** via the `@google/genai` SDK.
*   **Date Logic**: `date-fns`.

---

## 2. Data Models
The system is built around four strictly typed TypeScript interfaces:
*   **Task**: Contains metadata like `id`, `name`, `type`, `owner`, `stakeholders`, and critical dates (`start_date`, `due_date`, `publishing_date`).
*   **TaskType**: The "Blueprint" for tasks. Defines the **SLA (days)**, **Default Owner**, and **Reminder Settings**.
*   **TeamMember**: Directory of users with roles, emails, and Google Chat IDs.
*   **NotificationRules**: Boolean flags controlling which automated alerts are active.

---

## 3. Centralized State Logic
The `useStore` hook is the single source of truth. It handles:
*   **Persistence**: Every state change is automatically mirrored to `localStorage`.
*   **SLA Calculation**: When a task is added, the system calculates the `due_date` using `addDays(startDate, slaDays)`.
*   **Intelligent Queries**:
    *   `getOverdueTasks()`: Filters tasks where `status !== 'Done'` and `due_date < today`.
    *   `getTasksDueSoon()`: Identifies tasks due within the next 48 hours.

---

## 4. "Publishing Risk" Engine
This identifies conflicts between internal production speed (SLA) and external deadlines (Publishing Date):
*   **Logic**: If `due_date > publishing_date`, the task is flagged as **"At Risk"**.
*   **Visual Cue**: A red alert icon appears in the Task List and Calendar.

---

## 5. AI Assistant & Function Calling
The AI uses **Gemini's Function Calling** to bridge natural language and code:

**The Tools (Functions):**
1.  **create_task**: Adds a task to the store.
2.  **update_task_status**: Moves tasks through the workflow.
3.  **list_tasks**: Allows Gemini to query the current state.

**The System Prompt**:
Defines the professional strategy consulting persona and exact notification templates for GChat and Email.

---

## 6. Notification Generation Logic
1.  **User Request**: Natural language command.
2.  **Gemini Processing**: Identifies parameters and task context.
3.  **Template Application**: Applies Markdown/Structured text templates.
4.  **Output**: Formatted text for copy-pasting.

---

## 7. Security & Environment
*   **API Keys**: Managed via environment variables (`VITE_GEMINI_API_KEY`).
*   **Validation**: Strict validation for SLAs (positive integers) and required fields.
