import { linkJiraReferences } from "./JiraLinksPlugin";

const settings = {
  enabled: true,
  baseUrl: "https://learning-ally.atlassian.net/browse",
  projectKeys: ["PD"],
};

describe("JiraLinksPlugin", () => {
  it("links a completed ticket after a delimiter", () => {
    expect(
      linkJiraReferences(
        { type: "text", text: "See pd-3662 next", styles: {} },
        settings
      )
    ).toEqual([
      { type: "text", text: "See ", styles: {} },
      {
        type: "link",
        href: "https://learning-ally.atlassian.net/browse/PD-3662",
        content: [{ type: "text", text: "pd-3662", styles: {} }],
      },
      { type: "text", text: " next", styles: {} },
    ]);
  });

  it("waits for a delimiter and ignores unconfigured projects and code", () => {
    const incomplete = { type: "text" as const, text: "PD-3662", styles: {} };
    const otherProject = { type: "text" as const, text: "ABC-1 ", styles: {} };
    const code = {
      type: "text" as const,
      text: "PD-3662 ",
      styles: { code: true },
    };
    expect(
      linkJiraReferences(incomplete, settings)
    ).toEqual([incomplete]);
    expect(linkJiraReferences(otherProject, settings)).toEqual([otherProject]);
    expect(linkJiraReferences(code, settings)).toEqual([code]);
  });
});
