import { describe, expect, it } from "vitest";
import {
  getGameCopy,
  getLocalizedIssueLabel,
  localizeGameIssueMessage,
} from "./game";

describe("game project translations", () => {
  it("localizes Unity and Unreal safety copy", () => {
    const copy = getGameCopy("zh-CN");

    expect(copy.checksHeading).toBe("游戏项目检查");
    expect(getLocalizedIssueLabel("missing-meta", "zh-CN")).toBe(
      "缺少 .meta 文件",
    );
    expect(
      localizeGameIssueMessage(
        "This Unity asset is missing its .meta file.",
        "zh-CN",
      ),
    ).toBe("此 Unity 资源缺少对应的 .meta 文件。");
    expect(
      localizeGameIssueMessage(
        "The staged Unity asset would be committed without its .meta file.",
        "zh-CN",
      ),
    ).toContain("暂不建议提交");
    expect(
      localizeGameIssueMessage(
        "This file is at least 100 MiB and may be rejected by the Git host.",
        "zh-CN",
      ),
    ).toContain("100 MiB");
  });
});
