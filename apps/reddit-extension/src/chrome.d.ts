declare namespace chrome {
  namespace runtime {
    const id: string;
    const onInstalled: ChromeEvent<() => void>;
    const onMessage: ChromeEvent<(message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void>;
    function sendMessage(message: unknown): Promise<unknown>;
    function openOptionsPage(): void;
  }

  namespace alarms {
    interface Alarm { name: string; }
    const onAlarm: ChromeEvent<(alarm: Alarm) => void>;
    function create(name: string, alarmInfo: { delayInMinutes?: number; periodInMinutes?: number; when?: number }): void;
    function clear(name: string): Promise<boolean>;
  }

  namespace storage {
    interface StorageArea {
      get<T extends Record<string, unknown>>(keys?: string[] | Record<string, unknown> | null): Promise<T>;
      set(items: Record<string, unknown>): Promise<void>;
    }
    const local: StorageArea;
  }

  namespace tabs {
    interface Tab { id?: number; url?: string; active?: boolean; windowId?: number; status?: string; }
    const onUpdated: ChromeEvent<(tabId: number, changeInfo: { status?: string }, tab: Tab) => void>;
    function query(queryInfo: Record<string, unknown>): Promise<Tab[]>;
    function create(createProperties: Record<string, unknown>): Promise<Tab>;
    function get(tabId: number): Promise<Tab>;
    function update(tabId: number, updateProperties: Record<string, unknown>): Promise<Tab>;
  }

  namespace windows {
    interface Window { id?: number; tabs?: tabs.Tab[]; }
    function create(createData: Record<string, unknown>): Promise<Window>;
    function get(windowId: number, getInfo?: { populate?: boolean }): Promise<Window>;
  }

  namespace scripting {
    interface InjectionResult<T = unknown> { frameId: number; result?: T; }
    function executeScript<T = unknown>(injection: { target: { tabId: number }; func: (...args: any[]) => T | Promise<T>; args?: unknown[] }): Promise<Array<InjectionResult<T>>>;
  }

  namespace action {
    function setBadgeText(details: { text: string }): void;
    function setTitle(details: { title: string }): void;
  }

  interface ChromeEvent<T extends (...args: any[]) => void> {
    addListener(callback: T): void;
    removeListener(callback: T): void;
  }
}
