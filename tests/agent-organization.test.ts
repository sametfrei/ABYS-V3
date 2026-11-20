import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface Role {
  key: string;
  name: string;
  level: number;
  focus: string;
  aliases?: string[];
}

interface Department {
  key: string;
  name: string;
  director: Role;
  specialists: Role[];
}

interface Organization {
  root: Role;
  operatingModel: {
    maxDepth: number;
    specialistsMaySpawn: boolean;
    initialConcurrency: number;
    expansionLadder: number[];
  };
  departments: Department[];
}

const organization = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "docs", "agents", "organization.json"),
    "utf8"
  )
) as Organization;

describe("ABYS engineering organization", () => {
  it("defines exactly 31 roles with one root, five directors and 25 specialists", () => {
    const roles = [
      organization.root,
      ...organization.departments.flatMap((department) => [
        department.director,
        ...department.specialists,
      ]),
    ];
    expect(roles).toHaveLength(31);
    expect(organization.departments).toHaveLength(5);
    expect(organization.departments.every((department) => department.specialists.length === 5)).toBe(true);
    expect(new Set(roles.map((role) => role.key)).size).toBe(31);
    expect(organization.root.level).toBe(1);
    expect(organization.departments.every((department) => department.director.level === 2)).toBe(true);
    expect(
      organization.departments.every((department) =>
        department.specialists.every((specialist) => specialist.level === 3)
      )
    ).toBe(true);
  });

  it("keeps the hierarchy bounded and specialists unable to spawn agents", () => {
    expect(organization.operatingModel.maxDepth).toBe(3);
    expect(organization.operatingModel.specialistsMaySpawn).toBe(false);
  });

  it("starts at eight global subagents and expands only through the approved ladder", () => {
    expect(organization.operatingModel.initialConcurrency).toBe(8);
    expect(organization.operatingModel.expansionLadder).toEqual([8, 12, 16, 20, 24, 30]);
  });

  it("gives every role a non-empty key, name and responsibility", () => {
    const roles = [
      organization.root,
      ...organization.departments.flatMap((department) => [
        department.director,
        ...department.specialists,
      ]),
    ];
    for (const role of roles) {
      expect(role.key.trim().length).toBeGreaterThan(0);
      expect(role.name.trim().length).toBeGreaterThan(0);
      expect(role.focus.trim().length).toBeGreaterThan(0);
    }
  });
});
