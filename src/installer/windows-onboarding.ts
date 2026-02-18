/**
 * Windows MSI Installer Onboarding UI
 *
 * Provides a step-by-step setup wizard for Windows users installing RClaw.
 * Steps:
 *   1. Welcome & license acceptance
 *   2. Installation directory selection
 *   3. Agent configuration (name, model provider, API key)
 *   4. Channel selection (which messaging channels to enable)
 *   5. Security setup (gateway password, network mode)
 *   6. Installation progress
 *   7. Completion & next steps
 */

export type OnboardingStep =
  | "welcome"
  | "install-path"
  | "agent-config"
  | "channels"
  | "security"
  | "installing"
  | "complete";

export type OnboardingState = {
  currentStep: OnboardingStep;
  /** Installation directory. */
  installPath: string;
  /** Whether license was accepted. */
  licenseAccepted: boolean;
  /** Agent name. */
  agentName: string;
  /** Model provider selection. */
  modelProvider: "anthropic" | "openai" | "google" | "ollama" | "custom";
  /** API key for the model provider. */
  apiKey: string;
  /** Custom model endpoint (for "custom" provider). */
  customEndpoint: string;
  /** Selected channels to enable. */
  enabledChannels: string[];
  /** Gateway password. */
  gatewayPassword: string;
  /** Network binding mode. */
  networkMode: "loopback" | "local" | "tailscale";
  /** Whether to start gateway on boot. */
  autoStart: boolean;
  /** Installation progress (0–100). */
  installProgress: number;
  /** Installation status message. */
  installStatus: string;
  /** Whether installation completed successfully. */
  installComplete: boolean;
  /** Installation error, if any. */
  installError: string | null;
};

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  currentStep: "welcome",
  installPath: "C:\\Program Files\\RClaw",
  licenseAccepted: false,
  agentName: "default",
  modelProvider: "anthropic",
  apiKey: "",
  customEndpoint: "",
  enabledChannels: [],
  gatewayPassword: "",
  networkMode: "loopback",
  autoStart: true,
  installProgress: 0,
  installStatus: "",
  installComplete: false,
  installError: null,
};

export const AVAILABLE_CHANNELS = [
  { id: "discord", name: "Discord", description: "Discord bot integration" },
  { id: "telegram", name: "Telegram", description: "Telegram bot integration" },
  { id: "slack", name: "Slack", description: "Slack workspace integration" },
  { id: "whatsapp", name: "WhatsApp", description: "WhatsApp Web bridge" },
  { id: "signal", name: "Signal", description: "Signal messenger" },
  { id: "imessage", name: "iMessage", description: "Apple iMessage (macOS only)" },
  { id: "matrix", name: "Matrix", description: "Matrix/Element protocol" },
  { id: "msteams", name: "Microsoft Teams", description: "Teams integration" },
  { id: "web", name: "Web UI", description: "Built-in web dashboard" },
] as const;

export const MODEL_PROVIDERS = [
  {
    id: "anthropic" as const,
    name: "Anthropic (Claude)",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-20250514",
  },
  {
    id: "openai" as const,
    name: "OpenAI (GPT)",
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-4o",
  },
  {
    id: "google" as const,
    name: "Google (Gemini)",
    envVar: "GOOGLE_API_KEY",
    defaultModel: "gemini-2.5-pro",
  },
  {
    id: "ollama" as const,
    name: "Ollama (Local)",
    envVar: "",
    defaultModel: "llama3.3",
  },
  {
    id: "custom" as const,
    name: "Custom OpenAI-compatible",
    envVar: "",
    defaultModel: "",
  },
] as const;

/**
 * Validate the current step and return errors (if any).
 */
export function validateStep(
  step: OnboardingStep,
  state: OnboardingState,
): string[] {
  const errors: string[] = [];

  switch (step) {
    case "welcome":
      if (!state.licenseAccepted) {
        errors.push("You must accept the license agreement to continue.");
      }
      break;

    case "install-path":
      if (!state.installPath.trim()) {
        errors.push("Installation path is required.");
      }
      if (!/^[A-Z]:\\.+/.test(state.installPath)) {
        errors.push("Please provide a valid Windows path (e.g., C:\\Program Files\\RClaw).");
      }
      break;

    case "agent-config":
      if (!state.agentName.trim()) {
        errors.push("Agent name is required.");
      }
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(state.agentName)) {
        errors.push("Agent name must start with a letter and contain only letters, numbers, hyphens, and underscores.");
      }
      if (state.modelProvider !== "ollama" && state.modelProvider !== "custom" && !state.apiKey.trim()) {
        errors.push("API key is required for the selected model provider.");
      }
      if (state.modelProvider === "custom" && !state.customEndpoint.trim()) {
        errors.push("Custom endpoint URL is required.");
      }
      break;

    case "security":
      if (state.networkMode !== "loopback" && !state.gatewayPassword.trim()) {
        errors.push("A gateway password is recommended when exposing the gateway beyond loopback.");
      }
      if (state.gatewayPassword && state.gatewayPassword.length < 8) {
        errors.push("Gateway password should be at least 8 characters.");
      }
      break;
  }

  return errors;
}

/**
 * Get the next step in the onboarding flow.
 */
export function getNextStep(current: OnboardingStep): OnboardingStep | null {
  const steps: OnboardingStep[] = [
    "welcome",
    "install-path",
    "agent-config",
    "channels",
    "security",
    "installing",
    "complete",
  ];
  const idx = steps.indexOf(current);
  return idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;
}

/**
 * Get the previous step in the onboarding flow.
 */
export function getPreviousStep(current: OnboardingStep): OnboardingStep | null {
  const steps: OnboardingStep[] = [
    "welcome",
    "install-path",
    "agent-config",
    "channels",
    "security",
    "installing",
    "complete",
  ];
  const idx = steps.indexOf(current);
  return idx > 0 ? steps[idx - 1] : null;
}

/**
 * Generate the YAML configuration from onboarding state.
 */
export function generateConfig(state: OnboardingState): string {
  const provider = MODEL_PROVIDERS.find((p) => p.id === state.modelProvider);

  const lines: string[] = [
    "# RClaw Agent Configuration",
    `# Generated during setup on ${new Date().toISOString()}`,
    "",
    "gateway:",
    `  mode: ${state.networkMode === "loopback" ? "local" : state.networkMode}`,
    `  bind: ${state.networkMode === "loopback" ? "loopback" : "0.0.0.0"}`,
    "  port: 18789",
  ];

  if (state.gatewayPassword) {
    lines.push(`  password: "${state.gatewayPassword}"`);
  }

  lines.push("", "agents:", "  list:", `    - id: ${state.agentName}`);
  lines.push("      default: true");

  if (provider && provider.defaultModel) {
    lines.push(`      model: "${provider.id}/${provider.defaultModel}"`);
  }

  if (state.enabledChannels.length > 0) {
    lines.push("", "# Enabled channels");
    for (const ch of state.enabledChannels) {
      lines.push(`${ch}:`, "  enabled: true", "");
    }
  }

  // Multi-agent defaults
  lines.push(
    "",
    "# Multi-agent orchestration defaults",
    "agents:",
    "  defaults:",
    "    subagents:",
    "      maxConcurrent: 8",
    "      maxSpawnDepth: 3",
    "      maxChildrenPerAgent: 5",
  );

  return lines.join("\n");
}

/**
 * Generate the environment file content.
 */
export function generateEnvFile(state: OnboardingState): string {
  const provider = MODEL_PROVIDERS.find((p) => p.id === state.modelProvider);
  const lines: string[] = ["# RClaw Environment Variables"];

  if (provider?.envVar && state.apiKey) {
    lines.push(`${provider.envVar}=${state.apiKey}`);
  }

  if (state.modelProvider === "custom" && state.customEndpoint) {
    lines.push(`OPENAI_BASE_URL=${state.customEndpoint}`);
    if (state.apiKey) {
      lines.push(`OPENAI_API_KEY=${state.apiKey}`);
    }
  }

  return lines.join("\n");
}
