import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

export const DEFAULT_DATA_FILE = path.join(process.cwd(), "data", "guilds.json");

export class JsonStateStorage {
  constructor(filePath = DEFAULT_DATA_FILE) {
    this.filePath = filePath;
    this.name = "JSON file";
  }

  async load() {
    return readJsonFile(this.filePath);
  }

  async save(state) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }
}

export class PostgresStateStorage {
  constructor({ connectionString = null, pool = null, seedFilePath = DEFAULT_DATA_FILE } = {}) {
    if (!connectionString && !pool) {
      throw new Error("PostgreSQL storage requires DATABASE_URL.");
    }

    this.pool = pool ?? new Pool({
      connectionString: connectionString ?? undefined,
      max: 3,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000
    });
    this.ownsPool = !pool;
    this.seedFilePath = seedFilePath;
    this.name = "PostgreSQL";
    this.ready = null;

    if (this.ownsPool) {
      this.pool.on("error", (error) => {
        console.error("Unexpected PostgreSQL connection error:", error);
      });
    }
  }

  async load() {
    await this.initialize();
    const result = await this.pool.query(
      "SELECT payload FROM discord_bot_state WHERE id = 1"
    );

    if (result.rows[0]) {
      return normalizeState(result.rows[0].payload);
    }

    const seed = this.seedFilePath ? await readJsonFile(this.seedFilePath) : {};
    await this.save(seed);
    return seed;
  }

  async save(state) {
    await this.initialize();
    await this.pool.query(
      `INSERT INTO discord_bot_state (id, payload, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE
       SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [JSON.stringify(normalizeState(state))]
    );
  }

  async close() {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  async initialize() {
    if (!this.ready) {
      this.ready = this.pool.query(
        `CREATE TABLE IF NOT EXISTS discord_bot_state (
          id SMALLINT PRIMARY KEY CHECK (id = 1),
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      ).catch((error) => {
        this.ready = null;
        throw error;
      });
    }

    await this.ready;
  }
}

export function createStateStorage(options = {}) {
  if (typeof options === "string") {
    return new JsonStateStorage(options);
  }

  if (options.storage) {
    return options.storage;
  }

  const filePath = options.filePath ?? process.env.SPAM_BOT_DATA_FILE ?? DEFAULT_DATA_FILE;
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;

  if (databaseUrl) {
    return new PostgresStateStorage({
      connectionString: databaseUrl,
      seedFilePath: filePath
    });
  }

  return new JsonStateStorage(filePath);
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

function normalizeState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}
