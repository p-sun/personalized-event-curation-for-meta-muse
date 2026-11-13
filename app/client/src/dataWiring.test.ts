import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const dataSource = await Bun.file(new URL("./data.ts", import.meta.url)).text();

describe("client data seam wiring", () => {
  test("data.ts is the only client module that imports api.ts", async () => {
    const importers: string[] = [];
    const glob = new Bun.Glob("*.{ts,tsx}");

    for await (const file of glob.scan({ cwd: new URL(".", import.meta.url).pathname })) {
      if (file.endsWith(".test.ts") || file === "api.ts") continue;
      const source = await Bun.file(new URL(`./${file}`, import.meta.url)).text();
      if (source.includes('from "./api"')) importers.push(file);
    }

    expect(importers).toEqual(["data.ts"]);
  });

  test("data.ts delegates each list function to its server action", () => {
    expect(dataSource).toContain("export async function listEvents()");
    expect(dataSource).toContain("return api.list_events({});");
    expect(dataSource).toContain("export async function listLocations()");
    expect(dataSource).toContain("return api.list_locations({});");
    expect(dataSource).toContain("export async function listIgSources()");
    expect(dataSource).toContain("return api.list_ig_sources({});");
  });

  test("App query functions read through the data seam with unchanged query keys", () => {
    expect(appSource).toContain('queryKey: ["events"], queryFn: () => listEvents()');
    expect(appSource).toContain('queryKey: ["locations"], queryFn: () => listLocations()');
    expect(appSource).toContain('queryKey: ["ig-sources"], queryFn: () => listIgSources()');
    expect(appSource).not.toContain('from "./api"');
    expect(appSource).not.toContain("api.list_");
  });
});
