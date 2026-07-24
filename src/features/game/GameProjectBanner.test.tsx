// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GameProjectBanner } from "./GameProjectBanner";
import type { GameProjectSummary, GameSafetyIssue } from "./types";

const unityProfile: GameProjectSummary = {
  name: "Orbit Tactics",
  engine: "unity",
  version: "2022.3.56f1",
  descriptorPath: "D:\\Games\\OrbitTactics\\ProjectSettings\\ProjectVersion.txt",
};

const issues: GameSafetyIssue[] = [
  {
    kind: "missing-meta",
    severity: "danger",
    path: "Assets/Ships/Fighter.prefab",
    message: "The Unity asset does not have a matching .meta file.",
  },
  {
    kind: "large-file",
    severity: "warning",
    path: "Assets/Audio/score.wav",
    message: "This file is larger than the repository warning threshold.",
  },
];

describe("GameProjectBanner", () => {
  it("shows a compact Unity project identity and issue count", () => {
    render(<GameProjectBanner profile={unityProfile} issues={issues} />);

    expect(screen.getByText("Orbit Tactics")).toBeInTheDocument();
    expect(screen.getByText("Unity")).toBeInTheDocument();
    expect(screen.getByText("Unity 2022.3.56f1")).toBeInTheDocument();
    expect(screen.getByLabelText("2 game safety issues")).toHaveTextContent("2");
    expect(screen.getByLabelText("Orbit Tactics").closest("section")).toHaveAttribute(
      "data-engine",
      "unity",
    );
  });

  it("shows a clear Unreal project when no engine version or issues are known", () => {
    render(
      <GameProjectBanner
        profile={{ name: "Neon Frontier", engine: "unreal" }}
        issues={[]}
      />,
    );

    expect(screen.getByText("Unreal project")).toBeInTheDocument();
    expect(screen.getByLabelText("No game safety issues")).toHaveTextContent(
      "Checks clear",
    );
  });

  it("keeps the descriptor path available without adding visual noise", () => {
    render(<GameProjectBanner profile={unityProfile} issues={[]} />);

    expect(screen.getByLabelText("Orbit Tactics").closest("section")).toHaveAttribute(
      "title",
      unityProfile.descriptorPath,
    );
  });
});
