/**
 * Tests for Windows onboarding and MSI configuration.
 */

import { describe, it, expect } from "vitest";
import {
  validateStep,
  getNextStep,
  getPreviousStep,
  generateConfig,
  generateEnvFile,
  DEFAULT_ONBOARDING_STATE,
  type OnboardingState,
} from "./windows-onboarding.js";
import { getDefaultMsiConfig, generateWxs } from "./msi-config.js";

describe("Windows Onboarding", () => {
  describe("validateStep", () => {
    it("requires license acceptance on welcome step", () => {
      const errors = validateStep("welcome", { ...DEFAULT_ONBOARDING_STATE, licenseAccepted: false });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("license");
    });

    it("passes welcome with license accepted", () => {
      const errors = validateStep("welcome", { ...DEFAULT_ONBOARDING_STATE, licenseAccepted: true });
      expect(errors).toHaveLength(0);
    });

    it("validates install path format", () => {
      const errors = validateStep("install-path", { ...DEFAULT_ONBOARDING_STATE, installPath: "/usr/local" });
      expect(errors.length).toBeGreaterThan(0);
    });

    it("accepts valid Windows path", () => {
      const errors = validateStep("install-path", { ...DEFAULT_ONBOARDING_STATE, installPath: "C:\\Program Files\\RClaw" });
      expect(errors).toHaveLength(0);
    });

    it("validates agent name", () => {
      const errors = validateStep("agent-config", {
        ...DEFAULT_ONBOARDING_STATE,
        agentName: "123invalid",
        apiKey: "sk-test",
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it("requires API key for cloud providers", () => {
      const errors = validateStep("agent-config", {
        ...DEFAULT_ONBOARDING_STATE,
        agentName: "test",
        modelProvider: "anthropic",
        apiKey: "",
      });
      expect(errors.some((e) => e.includes("API key"))).toBe(true);
    });

    it("does not require API key for ollama", () => {
      const errors = validateStep("agent-config", {
        ...DEFAULT_ONBOARDING_STATE,
        agentName: "test",
        modelProvider: "ollama",
        apiKey: "",
      });
      expect(errors.some((e) => e.includes("API key"))).toBe(false);
    });

    it("warns about short passwords on non-loopback", () => {
      const errors = validateStep("security", {
        ...DEFAULT_ONBOARDING_STATE,
        networkMode: "local",
        gatewayPassword: "abc",
      });
      expect(errors.some((e) => e.includes("8 characters"))).toBe(true);
    });
  });

  describe("step navigation", () => {
    it("returns next step", () => {
      expect(getNextStep("welcome")).toBe("install-path");
      expect(getNextStep("install-path")).toBe("agent-config");
      expect(getNextStep("security")).toBe("installing");
      expect(getNextStep("complete")).toBeNull();
    });

    it("returns previous step", () => {
      expect(getPreviousStep("install-path")).toBe("welcome");
      expect(getPreviousStep("welcome")).toBeNull();
    });
  });

  describe("generateConfig", () => {
    it("generates valid YAML config", () => {
      const config = generateConfig({
        ...DEFAULT_ONBOARDING_STATE,
        agentName: "my-agent",
        modelProvider: "anthropic",
        gatewayPassword: "securepass123",
        enabledChannels: ["discord", "telegram"],
        networkMode: "loopback",
      });

      expect(config).toContain("my-agent");
      expect(config).toContain("anthropic/");
      expect(config).toContain("securepass123");
      expect(config).toContain("discord:");
      expect(config).toContain("telegram:");
      expect(config).toContain("mode: local");
    });

    it("omits password when empty", () => {
      const config = generateConfig({
        ...DEFAULT_ONBOARDING_STATE,
        gatewayPassword: "",
      });
      expect(config).not.toContain("password:");
    });
  });

  describe("generateEnvFile", () => {
    it("generates env with API key", () => {
      const env = generateEnvFile({
        ...DEFAULT_ONBOARDING_STATE,
        modelProvider: "anthropic",
        apiKey: "sk-ant-test123",
      });
      expect(env).toContain("ANTHROPIC_API_KEY=sk-ant-test123");
    });

    it("generates custom endpoint env", () => {
      const env = generateEnvFile({
        ...DEFAULT_ONBOARDING_STATE,
        modelProvider: "custom",
        customEndpoint: "http://localhost:8080/v1",
        apiKey: "custom-key",
      });
      expect(env).toContain("OPENAI_BASE_URL=http://localhost:8080/v1");
      expect(env).toContain("OPENAI_API_KEY=custom-key");
    });
  });
});

describe("MSI Configuration", () => {
  it("generates default config", () => {
    const config = getDefaultMsiConfig("2026.2.17");
    expect(config.productName).toBe("RClaw");
    expect(config.manufacturer).toBe("RDigital Tech");
    expect(config.version).toBe("2026.2.17");
    expect(config.components.length).toBeGreaterThan(0);
    expect(config.uiDialogs.length).toBeGreaterThanOrEqual(4);
  });

  it("generates valid WiX XML", () => {
    const config = getDefaultMsiConfig("2026.2.17");
    const wxs = generateWxs(config);

    expect(wxs).toContain("<?xml version=");
    expect(wxs).toContain("<Wix");
    expect(wxs).toContain("<Package");
    expect(wxs).toContain("RClaw");
    expect(wxs).toContain("RDigital Tech");
    expect(wxs).toContain("2026.2.17");
    expect(wxs).toContain("</Wix>");
  });

  it("includes gateway service component", () => {
    const config = getDefaultMsiConfig("2026.2.17");
    const serviceComp = config.components.find((c) => c.service);
    expect(serviceComp).toBeDefined();
    expect(serviceComp!.service!.name).toBe("RClawGateway");
  });

  it("includes registry entries for PATH", () => {
    const config = getDefaultMsiConfig("2026.2.17");
    const pathEntry = config.registryEntries.find((r) => r.name === "PATH");
    expect(pathEntry).toBeDefined();
  });

  it("includes onboarding UI dialogs", () => {
    const config = getDefaultMsiConfig("2026.2.17");
    const dialogIds = config.uiDialogs.map((d) => d.id);
    expect(dialogIds).toContain("WelcomeDlg");
    expect(dialogIds).toContain("AgentConfigDlg");
    expect(dialogIds).toContain("SecurityDlg");
  });
});
