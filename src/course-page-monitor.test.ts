import test from "node:test";
import assert from "node:assert/strict";
import { pageChanged } from "./course-page-monitor.ts";

test("a changed lesson body is the notification decision", () => {
  assert.equal(pageChanged("Week 2: video", "Week 2: video"), false);
  assert.equal(pageChanged("Week 2: video", "Week 2: video and quiz"), true);
});
