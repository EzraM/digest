import {
  filterSlashCommandOptions,
  slashCommandOptions,
} from "./slashCommandOptions";

describe("slashCommandOptions", () => {
  it("offers the native BlockNote code block", () => {
    expect(slashCommandOptions.some((option) => option.key === "code_block")).toBe(
      true
    );
    expect(filterSlashCommandOptions("code")[0].key).toBe("code_block");
  });
});
