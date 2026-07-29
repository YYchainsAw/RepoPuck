import { describe, expect, it } from "vitest";
import { getGitCopy, localizeGitMessage } from "./git";

describe("Git translations", () => {
  it("provides concise Chinese composer and repository labels", () => {
    const copy = getGitCopy("zh-CN");

    expect(copy.commitMessage).toBe("提交信息");
    expect(copy.commitAndPush).toBe("提交并推送");
    expect(copy.chooseRepository).toBe("选择仓库");
    expect(copy.generateCommitMessage).toContain("AI");
  });

  it("localizes known native results while preserving unknown diagnostics", () => {
    expect(localizeGitMessage("Changes pushed", "zh-CN")).toBe("更改已推送");
    expect(localizeGitMessage("Branch feature/ui already exists", "zh-CN")).toBe(
      "分支 feature/ui 已存在",
    );
    expect(localizeGitMessage("Custom provider error", "zh-CN")).toBe(
      "Custom provider error",
    );
    expect(localizeGitMessage("Changes pushed", "en")).toBe("Changes pushed");
  });

  it("localizes classified Git exit errors and AI provider failures", () => {
    expect(
      localizeGitMessage("Git index is locked (exit code 128)", "zh-CN"),
    ).toBe(
      "Git 索引已锁定，请确认没有其他 Git 进程正在运行（退出代码 128）",
    );
    expect(
      localizeGitMessage(
        "Current Git branch has no upstream (exit code terminated)",
        "zh-CN",
      ),
    ).toContain("没有上游分支");
    expect(
      localizeGitMessage(
        "AI provider rejected the request (HTTP 400)",
        "zh-CN",
      ),
    ).toBe("AI 服务拒绝了请求（HTTP 400）");
    expect(
      localizeGitMessage(
        "Save an AI API key in Settings before generating",
        "zh-CN",
      ),
    ).toBe("请先在设置中保存 AI API 密钥");
    expect(
      localizeGitMessage(
        "AI provider omitted the requested Conventional Commit scope",
        "zh-CN",
      ),
    ).toBe("AI 服务未返回已启用的提交作用域");
  });
});
