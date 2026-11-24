import { describe, expect, it } from "vitest";
import { isAllowedRemoteUrl, resolveGithubAssetCandidates } from "../../src/core/github-assets.js";

describe("GitHub asset resolution", () => {
  const source = "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/templates.md#tpl-ui";

  it("maps the style library cover path to the repository data folder", () => {
    expect(resolveGithubAssetCandidates(source, "/images/case17.jpg")[0]).toBe(
      "https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data/images/case17.jpg",
    );
  });

  it("rejects non-GitHub remote URLs", () => {
    expect(isAllowedRemoteUrl("https://example.com/image.png")).toBe(false);
    expect(isAllowedRemoteUrl("https://raw.githubusercontent.com/a/b/main/image.png")).toBe(true);
  });
});

