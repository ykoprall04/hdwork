import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryFromPath,
  workspaceMenu,
  navigationKey,
  isWorkspaceCategory,
} from "../src/features/preview/workspace-navigation.ts";
test("B2C main menu has the seven required items in order without a jobs menu", () => {
  const items = workspaceMenu("B2C", "HD");
  assert.deepEqual(
    items.map((i) => i.label),
    [
      "Dashboard B2C",
      "TIAL",
      "LOGIC",
      "Pekerjaan Saya",
      "Transfer Order",
      "Produktivitas HD",
      "Monitoring Publik",
    ],
  );
  assert.ok(!items.some((i) => i.to === "/preview/jobs"));
});
test("other categories have their own dashboard and no TIAL/LOGIC routes", () => {
  for (const category of ["ASSUREN", "B2B", "REPLACEMENT"] as const) {
    const menu = workspaceMenu(category, "HD");
    assert.equal(menu[0].label, `Dashboard ${category}`);
    assert.equal(
      menu.some((i) => ["TIAL", "LOGIC"].includes(i.label)),
      false,
    );
    assert.ok(menu.some((i) => i.to === "/preview/my-work"));
  }
});
test("Admin and Super Admin retain admin access, HD has no admin navigation", () => {
  for (const role of ["ADMIN", "SUPER_ADMIN"])
    assert.ok(
      workspaceMenu("B2C", role).some((i) => i.to === "/preview/admin"),
    );
  assert.ok(!workspaceMenu("B2C", "HD").some((i) => i.to === "/preview/admin"));
});
test("category context accepts only valid workspace routes and isolates remembered preferences per user", () => {
  assert.equal(categoryFromPath("/preview/work/B2C/TIAL"), "B2C");
  assert.equal(categoryFromPath("/preview/work/B2B"), "B2B");
  assert.equal(categoryFromPath("/preview/jobs"), null);
  assert.equal(categoryFromPath("/preview/work/INVALID"), null);
  assert.equal(isWorkspaceCategory("B2C"), true);
  assert.equal(isWorkspaceCategory("B2C/TIAL"), false);
  assert.notEqual(navigationKey("hd_demo_1"), navigationKey("hd_demo_2"));
});
