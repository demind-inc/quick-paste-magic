import type { PlasmoConfig } from "plasmo"

export const config: PlasmoConfig = {
  manifest: {
    manifest_version: 3,
    name: "SnipDM",
    version: "1.0.0",
    description: "Insert DM snippets into any text field from your SnipDM workspace.",
    permissions: ["storage", "activeTab", "scripting", "alarms"],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "SnipDM"
    },
    icons: {
      "16": "assets/icon16.png",
      "32": "assets/icon32.png",
      "48": "assets/icon48.png",
      "128": "assets/icon128.png"
    },
    commands: {
      "open-snippet-picker": {
        suggested_key: {
          default: "Ctrl+Shift+Space",
          mac: "Command+Shift+Space"
        },
        description: "Open the SnipDM snippet picker"
      }
    }
  }
}
