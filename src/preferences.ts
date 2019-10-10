import { app } from "electron";
import ElectronPreferences from "electron-preferences";
import * as path from "path";

const preferences = new ElectronPreferences({
  dataStore: path.resolve(app.getPath("userData"), "preferences.json"),
  defaults: {
    setting: {
      command_path: "",
      use_lab: false,
    },
  },
  onLoad: (aPreferences: ElectronPreferences) => {
    return aPreferences;
  },
  sections: [
    {
      id: "setting",
      label: "Setting",
      icon: "settings-gear-63",
      form: {
        groups: [
          {
            label: "jupyter setting",
            fields: [
              {
                label: "command path",
                key: "command_path",
                type: "text",
                help: "",
              },
              {
                label: "use lab",
                key: "use_lab",
                type: "radio",
                options: [
                  { label: "notebook", value: false },
                  { label: "lab", value: true },
                ],
                help: "",
              },
            ],
          },
        ],
      },
    },
  ],
});

export default preferences;
