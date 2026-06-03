import type { PiWebPlugin } from "@jmfederico/pi-web/plugin-api";
import { TASKS_CONFIG_PATH } from "./config.js";
import { defineTasksPanelElement, tasksPanelBadge } from "./tasksPanelElement.js";
import { terminalCommandRunsFromContext } from "./piWebInternal.js";

const plugin: PiWebPlugin = {
  apiVersion: 1,
  name: "Workspace Tasks",
  activate: ({ pluginId, html }) => {
    defineTasksPanelElement();

    return {
      contributions: {
        actions: [
          {
            id: "workspace.open-tasks",
            title: "Open Workspace Tasks",
            description: `Open the workspace Tasks tab. Configure tasks in ${TASKS_CONFIG_PATH}.`,
            group: "Workspace",
            enabled: (context) => context.state.selectedWorkspace !== undefined,
            run: (context) => {
              if (context.state.selectedWorkspace === undefined) return;
              context.selectWorkspaceTool(`${pluginId}:workspace.tasks`);
            },
          },
        ],
        workspacePanels: [
          {
            id: "workspace.tasks",
            title: "Tasks",
            order: 40,
            badge: ({ workspace }) => tasksPanelBadge(workspace),
            render: (context) => html`<pi-web-workspace-tasks-panel .workspace=${context.workspace} .terminalCommandRuns=${terminalCommandRunsFromContext(context)} .openTerminal=${context.openTerminal}></pi-web-workspace-tasks-panel>`,
          },
        ],
      },
    };
  },
};

export default plugin;
