// Global configuration for the self-hosted Renovate run in .github/workflows/renovate.yml:
// the commands renovate.json's postUpgradeTasks may run.
export default {
  allowedCommands: ["^bun \\./scripts/update-config\\.ts ", "^bun install && bun run test$"],
};
