import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { getWindowView } from "./App";

it("routes puck URLs synchronously before the application module loads", () => {
  const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  expect(getWindowView("?view=puck")).toBe("puck");
  expect(index).toMatch(
    /<script>\s*document\.documentElement\.dataset\.windowView\s*=\s*new URLSearchParams\(location\.search\)\.get\("view"\) === "puck" \? "puck" : "panel";/,
  );
});
