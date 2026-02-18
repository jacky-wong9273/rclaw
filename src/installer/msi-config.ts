/**
 * Windows MSI Installer Build Configuration
 *
 * Defines the WiX Toolset configuration for building the RClaw Windows installer.
 * This generates a .wxs file that can be compiled with WiX to produce an MSI.
 *
 * Prerequisites:
 *   - WiX Toolset v4+ (dotnet tool install --global wix)
 *   - Node.js 22+ built output in dist/
 *   - Windows SDK (for signing)
 *
 * Build:
 *   node --import tsx src/installer/build-msi.ts
 *   wix build installer/rclaw.wxs -o dist/RClaw-Setup.msi
 */

export type MsiConfig = {
  productName: string;
  manufacturer: string;
  version: string;
  upgradeCode: string;
  description: string;
  installDir: string;
  /** Files/dirs to include in the MSI. */
  components: MsiComponent[];
  /** Registry keys to set. */
  registryEntries: MsiRegistryEntry[];
  /** Shortcuts to create. */
  shortcuts: MsiShortcut[];
  /** Custom actions (post-install). */
  customActions: MsiCustomAction[];
  /** UI sequence (wizard steps). */
  uiDialogs: MsiDialog[];
};

export type MsiComponent = {
  id: string;
  directory: string;
  files: string[];
  /** Whether this component creates a Windows service. */
  service?: {
    name: string;
    displayName: string;
    description: string;
    startType: "auto" | "demand" | "disabled";
  };
};

export type MsiRegistryEntry = {
  root: "HKLM" | "HKCU";
  key: string;
  name: string;
  value: string;
  type: "string" | "integer" | "expandable";
};

export type MsiShortcut = {
  name: string;
  target: string;
  arguments?: string;
  icon?: string;
  location: "desktop" | "start-menu" | "both";
};

export type MsiCustomAction = {
  id: string;
  script: string;
  when: "after-install" | "before-uninstall";
};

export type MsiDialog = {
  id: string;
  title: string;
  description: string;
  controls: Array<{
    type: "text" | "input" | "checkbox" | "combobox" | "pathpicker" | "button";
    id: string;
    label: string;
    property?: string;
    default?: string;
    options?: string[];
  }>;
};

/**
 * Default MSI configuration for RClaw.
 */
export function getDefaultMsiConfig(version: string): MsiConfig {
  return {
    productName: "RClaw",
    manufacturer: "RDigital Tech",
    version,
    upgradeCode: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
    description: "RClaw Multi-Agent AI Gateway — manage intelligent agents across devices",
    installDir: "ProgramFilesFolder\\RClaw",
    components: [
      {
        id: "CoreFiles",
        directory: "INSTALLDIR",
        files: [
          "openclaw.mjs",
          "dist/**/*.js",
          "dist/**/*.d.ts",
          "dist/**/*.json",
          "assets/**/*",
          "node_modules/**/*",
        ],
      },
      {
        id: "GatewayService",
        directory: "INSTALLDIR",
        files: [],
        service: {
          name: "RClawGateway",
          displayName: "RClaw AI Gateway",
          description: "RClaw multi-agent AI gateway service",
          startType: "auto",
        },
      },
    ],
    registryEntries: [
      {
        root: "HKLM",
        key: "SOFTWARE\\RDigitalTech\\RClaw",
        name: "InstallDir",
        value: "[INSTALLDIR]",
        type: "string",
      },
      {
        root: "HKLM",
        key: "SOFTWARE\\RDigitalTech\\RClaw",
        name: "Version",
        value: version,
        type: "string",
      },
      {
        root: "HKCU",
        key: "Environment",
        name: "PATH",
        value: "[INSTALLDIR];[%PATH]",
        type: "expandable",
      },
    ],
    shortcuts: [
      {
        name: "RClaw Dashboard",
        target: "[INSTALLDIR]\\openclaw.mjs",
        arguments: "dashboard",
        location: "both",
      },
      {
        name: "RClaw Terminal",
        target: "cmd.exe",
        arguments: '/k "cd /d [INSTALLDIR] && openclaw"',
        location: "start-menu",
      },
    ],
    customActions: [
      {
        id: "RunOnboarding",
        script: "node openclaw.mjs setup --windows-onboard",
        when: "after-install",
      },
      {
        id: "StopGateway",
        script: "net stop RClawGateway",
        when: "before-uninstall",
      },
    ],
    uiDialogs: [
      {
        id: "WelcomeDlg",
        title: "Welcome to RClaw Setup",
        description: "This wizard will install RClaw, your multi-agent AI gateway for managing intelligent agents across devices.",
        controls: [
          {
            type: "text",
            id: "WelcomeText",
            label: "RClaw enables you to deploy, configure, and orchestrate multiple AI agents with different roles — all from a single dashboard.",
          },
          {
            type: "checkbox",
            id: "AcceptLicense",
            label: "I accept the license agreement (MIT License)",
            property: "ACCEPTLICENSE",
          },
        ],
      },
      {
        id: "InstallDirDlg",
        title: "Installation Directory",
        description: "Choose where to install RClaw.",
        controls: [
          {
            type: "pathpicker",
            id: "InstallPath",
            label: "Installation folder:",
            property: "INSTALLDIR",
            default: "C:\\Program Files\\RClaw",
          },
        ],
      },
      {
        id: "AgentConfigDlg",
        title: "Agent Configuration",
        description: "Configure your first AI agent.",
        controls: [
          {
            type: "input",
            id: "AgentName",
            label: "Agent name:",
            property: "AGENTNAME",
            default: "default",
          },
          {
            type: "combobox",
            id: "ModelProvider",
            label: "Model Provider:",
            property: "MODELPROVIDER",
            options: ["Anthropic (Claude)", "OpenAI (GPT)", "Google (Gemini)", "Ollama (Local)", "Custom"],
            default: "Anthropic (Claude)",
          },
          {
            type: "input",
            id: "ApiKey",
            label: "API Key:",
            property: "APIKEY",
          },
        ],
      },
      {
        id: "SecurityDlg",
        title: "Security Setup",
        description: "Configure gateway security settings.",
        controls: [
          {
            type: "input",
            id: "GatewayPassword",
            label: "Gateway Password (recommended):",
            property: "GATEWAYPASSWORD",
          },
          {
            type: "combobox",
            id: "NetworkMode",
            label: "Network Mode:",
            property: "NETWORKMODE",
            options: ["Loopback only (safest)", "Local network", "Tailscale"],
            default: "Loopback only (safest)",
          },
          {
            type: "checkbox",
            id: "AutoStart",
            label: "Start RClaw Gateway automatically on login",
            property: "AUTOSTART",
            default: "1",
          },
        ],
      },
    ],
  };
}

/**
 * Generate the WiX XML (.wxs) content from the config.
 */
export function generateWxs(config: MsiConfig): string {
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs"`,
    `     xmlns:ui="http://wixtoolset.org/schemas/v4/wxs/ui">`,
    ``,
    `  <Package Name="${config.productName}"`,
    `           Manufacturer="${config.manufacturer}"`,
    `           Version="${config.version}"`,
    `           UpgradeCode="${config.upgradeCode}">`,
    ``,
    `    <Summary Description="${config.description}" />`,
    `    <MajorUpgrade DowngradeErrorMessage="A newer version of ${config.productName} is already installed." />`,
    `    <MediaTemplate EmbedCab="yes" />`,
    ``,
    `    <!-- Installation directory -->`,
    `    <StandardDirectory Id="ProgramFilesFolder">`,
    `      <Directory Id="INSTALLDIR" Name="${config.productName}" />`,
    `    </StandardDirectory>`,
    ``,
    `    <!-- Features -->`,
    `    <Feature Id="Complete" Title="${config.productName}" Level="1">`,
  ];

  for (const comp of config.components) {
    lines.push(`      <ComponentRef Id="${comp.id}" />`);
  }

  lines.push(
    `    </Feature>`,
    ``,
    `    <!-- Registry entries -->`,
  );

  for (const reg of config.registryEntries) {
    lines.push(
      `    <Component Id="Reg_${reg.name}" Directory="INSTALLDIR">`,
      `      <RegistryValue Root="${reg.root}" Key="${reg.key}"`,
      `                     Name="${reg.name}" Value="${reg.value}"`,
      `                     Type="${reg.type}" />`,
      `    </Component>`,
    );
  }

  // Custom actions
  for (const action of config.customActions) {
    lines.push(
      ``,
      `    <CustomAction Id="${action.id}" Directory="INSTALLDIR"`,
      `                  ExeCommand="cmd.exe /c ${action.script}"`,
      `                  Execute="deferred" Impersonate="no" />`,
    );
  }

  lines.push(
    ``,
    `    <!-- UI -->`,
    `    <ui:WixUI Id="WixUI_Custom" />`,
    ``,
    `  </Package>`,
    `</Wix>`,
  );

  return lines.join("\n");
}
