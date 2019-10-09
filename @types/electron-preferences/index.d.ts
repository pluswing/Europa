declare module "electron-preferences" {
  interface Option {
    label: string;
    value: any;
  }

  interface TextField {
    label: string;
    key: string;
    type: "text";
    help: string;
  }
  interface RadioField {
    label: string;
    key: string;
    type: "radio";
    options: Option[];
    help: string;
  }

  type Field = TextField | RadioField

  interface Group {
    label: string;
    fields: Field[];
  }

  interface Section {
    id: string;
    label: string;
    icon: string;
    form: {
      groups: Group[];
    }
  }

  interface Config {
    dataStore: string;
    defaults: {
      [key: string]: {
        [key: string]: any
      }
    };
    onLoad: (preferences: ElectronPreferences) => ElectronPreferences;
    sections: Section[];
  }
  class ElectronPreferences {
    constructor(config: Config);
    public show(): void;
    public value(key: string): any;
  }

  export default ElectronPreferences;
}
