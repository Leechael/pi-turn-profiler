import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface MockContext extends ExtensionContext {
  logs: string[];
  errors: string[];
  workingMessages: (string | undefined)[];
  selectCalls: string[];
}

export function createMockContext({
  hasUI = false,
  cwd = "/tmp/project",
  modelId,
}: {
  hasUI?: boolean;
  cwd?: string;
  modelId?: string;
} = {}): MockContext {
  const logs: string[] = [];
  const errors: string[] = [];
  const workingMessages: (string | undefined)[] = [];
  const selectCalls: string[] = [];

  return {
    hasUI,
    cwd,
    model: modelId ? { id: modelId } : undefined,
    ui: {
      theme: {
        bold: (value: string) => value,
        fg: (_color: string, value: string) => value,
        bg: (_color: string, value: string) => value,
      },
      notify: (message: string, _type?: string) => {
        logs.push(message);
      },
      setWorkingMessage: (message?: string) => {
        workingMessages.push(message);
      },
      select: async (message: string, _choices: string[]) => {
        selectCalls.push(message);
        return undefined;
      },
    },
    logs,
    errors,
    workingMessages,
    selectCalls,
  } as unknown as MockContext;
}

export function mockConsole(logs: string[], errors: string[]): { restore: () => void } {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: any[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: any[]) => {
    errors.push(args.map(String).join(" "));
  };
  return {
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}
