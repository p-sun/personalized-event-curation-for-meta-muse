import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Actions } from "../../server/src/actions";
import { formatFollowerCount } from "./igSources";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const migrationSource = await Bun.file(new URL("../../drizzle/0011_add_ig_sources.sql", import.meta.url)).text();

type BatchStatement = { run: () => unknown };
type TestDatabase = ReturnType<typeof drizzle> & { batch: (statements: BatchStatement[]) => Promise<void> };

let sqlite: Database;
let database: TestDatabase;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(migrationSource);
  const drizzleDatabase = drizzle(sqlite);
  database = Object.assign(drizzleDatabase, {
    batch: async (statements: BatchStatement[]) => {
      sqlite.transaction(() => {
        for (const statement of statements) statement.run();
      })();
    },
  });
});

afterEach(() => sqlite.close());

// Models the owner's own pipeline invocation: dataset writes are owner-only,
// so the context carries an owner viewer like the real local runtime does.
const context = () => ({
  db: () => database,
  invalidateQueries: () => undefined,
  viewer: { isOwner: true },
});

const alice = {
  username: "alice.nyc",
  user_id: "101",
  profile_url: "https://www.instagram.com/alice.nyc/",
  follower_count: 12500,
  verified: true,
};

const zoo = {
  username: "zoo.weekend",
  user_id: null,
  profile_url: "https://www.instagram.com/zoo.weekend/",
  follower_count: null,
  verified: null,
};

describe("IG source actions", () => {
  test("replace_ig_sources fully replaces the table", async () => {
    const replace = Actions.replace_ig_sources;
    const first = replace.request.parse({ sources: [zoo, alice] });
    expect(await replace.handler(context() as never, first)).toEqual({ replaced: 2 });

    const second = replace.request.parse({ sources: [alice] });
    expect(await replace.handler(context() as never, second)).toEqual({ replaced: 1 });

    const listed = await Actions.list_ig_sources.handler(context() as never, {});
    expect(listed.sources).toEqual([alice]);
  });

  test("list_ig_sources returns every field ordered alphabetically", async () => {
    await Actions.replace_ig_sources.handler(
      context() as never,
      Actions.replace_ig_sources.request.parse({ sources: [zoo, alice] }),
    );

    const listed = await Actions.list_ig_sources.handler(context() as never, {});
    expect(listed.sources).toEqual([alice, zoo]);
  });
});

describe("IG sources interface", () => {
  test("settings row pushes the IG sources route", () => {
    expect(appSource).toContain('<span>IG sources</span>');
    expect(appSource).toContain('navigation.push({ type: "ig-sources" })');
    expect(appSource).toContain('type AppRoute = { type: "location"; locationId: string } | { type: "ig-sources" }');
  });

  test("screen renders handles, optional metadata, and user-initiated profile links", () => {
    expect(appSource).toContain('function IGSourcesView(');
    expect(appSource).toContain('@{source.username}');
    expect(appSource).toContain('source.follower_count !== null');
    expect(appSource).toContain('source.verified &&');
    expect(appSource).toContain('href={source.profile_url}');
    expect(appSource).toContain('target="_blank"');
    expect(formatFollowerCount(12500)).toBe("12.5K");
  });
});
