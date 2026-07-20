export interface PackageSpec {
  name: string;
  directory: string;
  internalDependencies: string[];
  bin?: string;
}

export const packageSpecs: PackageSpec[] = [
  { name: "@termwire/tmux", directory: "packages/tmux", internalDependencies: [] },
  { name: "@termwire/nvim", directory: "packages/nvim", internalDependencies: [] },
  {
    name: "@termwire/cli",
    directory: "packages/cli",
    internalDependencies: ["@termwire/nvim", "@termwire/tmux"],
    bin: "dist/bin/termwire.js",
  },
  {
    name: "@termwire/opencode-plugin",
    directory: "packages/opencode-plugin",
    internalDependencies: ["@termwire/nvim", "@termwire/tmux"],
  },
];
